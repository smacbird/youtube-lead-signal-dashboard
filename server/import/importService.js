import { scoreSampleItem } from '../../src/scoring/scoring.js';
import { clampImportOptions, IMPORT_LIMITS } from './limits.js';
import { makeReplyDrafts, makeScoringItem, normalizeCommentThreadFromYouTube, normalizeVideoFromYouTube } from './normalize.js';
import { parseManyYouTubeVideoInputs } from '../youtube/url.js';
import {
  createImportRun,
  finishImportRun,
  persistScoredOpportunity,
  recordImportError,
  upsertImportedComment,
  upsertImportedVideo,
} from '../persistence/store.js';

function sanitizeThrownError(error) {
  return {
    code: error?.code || 'import_error',
    message: error?.message || 'Import failed.',
    status: error?.status || null,
  };
}

export async function importYouTubeVideos({ inputs, options = {}, store, youtubeClient, metadata = {} }) {
  const requestedInputs = Array.isArray(inputs) ? inputs : String(inputs || '').split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
  const cappedOptions = clampImportOptions(options);
  const parsed = parseManyYouTubeVideoInputs(requestedInputs, cappedOptions.maxVideosPerRun);

  return store.mutate(async (state) => {
    const run = createImportRun(state, requestedInputs, parsed, metadata);
    if (!parsed.videoIds.length) {
      recordImportError(run, 'no_valid_video_ids', 'No supported YouTube video URLs or IDs were provided.');
      return finishImportRun(run, 'failed');
    }

    try {
      run.estimatedQuotaUnits += IMPORT_LIMITS.estimatedVideosListQuota;
      const videoResponse = await youtubeClient.listVideos(parsed.videoIds);
      const videosByYouTubeId = new Map((videoResponse.items || []).map((item) => [item.id, normalizeVideoFromYouTube(item)]));

      for (const videoId of parsed.videoIds) {
        const normalizedVideo = videosByYouTubeId.get(videoId);
        if (!normalizedVideo) {
          run.commentsSkipped += 1;
          recordImportError(run, 'video_not_found', 'YouTube did not return metadata for the requested video.', { videoId });
          continue;
        }

        const video = upsertImportedVideo(state, normalizedVideo);
        let pageToken;
        for (let page = 0; page < cappedOptions.maxPagesPerVideo; page += 1) {
          if (run.commentsFetched >= cappedOptions.maxCommentsPerRun) break;
          run.estimatedQuotaUnits += IMPORT_LIMITS.estimatedCommentThreadsListQuota;
          const pageResponse = await youtubeClient.listCommentThreads({
            videoId,
            pageToken,
            maxResults: cappedOptions.maxResultsPerPage,
          });
          run.pagesFetched += 1;

          for (const thread of pageResponse.items || []) {
            if (run.commentsFetched >= cappedOptions.maxCommentsPerRun) {
              run.commentsSkipped += 1;
              continue;
            }
            const comment = normalizeCommentThreadFromYouTube(thread, video);
            const upsert = upsertImportedComment(state, comment);
            run.commentsFetched += 1;
            if (upsert.inserted) run.commentsInserted += 1;
            if (upsert.updated) run.commentsUpdated += 1;

            const scoringItem = makeScoringItem(video, upsert.record);
            const score = scoreSampleItem(scoringItem);
            const opportunityId = `opp_${upsert.record.id}`;
            const opportunity = {
              ...score,
              id: opportunityId,
              videoId: video.id,
              commentId: upsert.record.id,
              sourceType: 'youtube_import',
              opportunityType: score.opportunityType || (score.scoreDimensions?.some((dimension) => ['affiliateRelevance', 'affiliatePublisherSignal'].includes(dimension.dimension) && dimension.score >= 60)
                ? 'affiliate_publisher_opportunity'
                : 'consumer_buyer_question'),
            };
            const drafts = makeReplyDrafts(opportunityId, upsert.record);
            persistScoredOpportunity(state, opportunity, score.scoreDimensions, drafts);
          }

          pageToken = pageResponse.nextPageToken;
          if (!pageToken) break;
        }
      }

      const hasErrors = run.errors.length > 0;
      return finishImportRun(run, hasErrors ? 'completed_with_errors' : 'succeeded');
    } catch (error) {
      const safe = sanitizeThrownError(error);
      recordImportError(run, safe.code, safe.message, { status: safe.status });
      return finishImportRun(run, 'failed');
    }
  });
}
