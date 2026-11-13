import { scoreSampleItem } from '../../src/scoring/scoring.js';
import { clampImportOptions, IMPORT_LIMITS } from './limits.js';
import { makeScoringItem, normalizeCommentThreadFromYouTube, normalizeVideoFromYouTube } from './normalize.js';
import { parseManyYouTubeVideoInputs } from '../youtube/url.js';
import { nicheScoreBoost, resolveNicheProfile } from '../youtube/nicheProfiles.js';
import { scoreNicheLead } from '../scoring/nicheLead.js';
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

function makeVideoResult(videoId, video, extra = {}) {
  return {
    youtubeVideoId: videoId,
    title: video?.title || null,
    commentCountOnYouTube: video ? video.commentCount : null,
    budget: 0,
    pages: 0,
    fetched: 0,
    kept: 0,
    duplicates: 0,
    alreadySaved: 0,
    capped: 0,
    moreOnYouTube: false,
    stoppedBy: null,
    error: null,
    ...extra,
  };
}

function scoreAndPersist({ state, video, record, metadata, options }) {
    const upsert = { record };
    const profileId = metadata.profileId || options.profileId || null;
    const opportunityId = `opp_${upsert.record.id}`;
    if (profileId) {
      // Niche scans: score the comment as a niche prospect (niche_lead) or noise (low_fit_comment).
      const profile = resolveNicheProfile(profileId);
      const niche = scoreNicheLead({
        text: upsert.record.textOriginal,
        profileId,
        authorDisplayName: upsert.record.authorDisplayName,
        isChannelOwner: upsert.record.isChannelOwner,
        likeCount: upsert.record.likeCount,
        replyCount: upsert.record.replyCount,
      });
      const { scoreDimensions: nicheDimensions, nicheMatchedKeywords, nicheScoreBoost: nicheBoostValue, nicheSignals, ...nicheScore } = niche;
      const now = new Date().toISOString();
      const opportunity = {
        ...nicheScore,
        id: opportunityId,
        commentId: upsert.record.id,
        videoId: video.id,
        sourceType: 'youtube_import',
        scoringModel: 'niche_lead_v1',
        nicheProfileId: profileId,
        nicheProfileLabel: profile?.label || metadata.profileLabel || null,
        nicheLeadCategory: profile?.leadCategory || null,
        nicheReplyStyle: profile?.replyStyle || null,
        nicheMatchedKeywords,
        nicheScoreBoost: nicheBoostValue,
        nicheSignals,
        createdAt: now,
        updatedAt: now,
      };
      persistScoredOpportunity(state, opportunity, nicheDimensions);
      return opportunityId;
    }

    const scoringItem = makeScoringItem(video, upsert.record);
    const score = scoreSampleItem(scoringItem);
    const combinedText = `${video.title || ''} ${upsert.record.textOriginal || ''}`;
    const nicheBoost = profileId ? nicheScoreBoost(profileId, combinedText) : { boost: 0, matched: [], profile: null };
    const boostedScore = Math.min(100, Math.max(0, (score.overallScore || 0) + nicheBoost.boost));
    const opportunity = {
      ...score,
      overallScore: boostedScore,
      priority: boostedScore >= 80 ? 'urgent' : boostedScore >= 65 ? 'high' : boostedScore >= 40 ? 'medium' : 'low',
      id: opportunityId,
      videoId: video.id,
      commentId: upsert.record.id,
      sourceType: 'youtube_import',
      lowFitReason: null,
      nicheProfileId: profileId,
      nicheProfileLabel: nicheBoost.profile?.label || metadata.profileLabel || null,
      nicheLeadCategory: nicheBoost.profile?.leadCategory || null,
      nicheReplyStyle: nicheBoost.profile?.replyStyle || null,
      nicheMatchedKeywords: nicheBoost.matched,
      nicheScoreBoost: nicheBoost.boost,
      evidenceSnippets: nicheBoost.matched.length ? [...(score.evidenceSnippets || []), `Niche match: ${nicheBoost.matched.slice(0, 4).join(', ')}`] : score.evidenceSnippets,
      summary: nicheBoost.boost ? `${score.summary} Niche fit boost: ${nicheBoost.matched.slice(0, 4).join(', ')}.` : score.summary,
      opportunityType: score.opportunityType || (score.scoreDimensions?.some((dimension) => ['affiliateRelevance', 'affiliatePublisherSignal'].includes(dimension.dimension) && dimension.score >= 60)
        ? 'affiliate_publisher_opportunity'
        : 'consumer_buyer_question'),
    };
    persistScoredOpportunity(state, opportunity, score.scoreDimensions);
    return opportunityId;
}

export async function importYouTubeVideos({ inputs, options = {}, store, youtubeClient, metadata = {}, videoItems = null }) {
  const requestedInputs = Array.isArray(inputs) ? inputs : String(inputs || '').split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
  const cappedOptions = clampImportOptions(options);
  const parsed = parseManyYouTubeVideoInputs(requestedInputs, cappedOptions.maxVideosPerRun);

  return store.mutate(async (state) => {
    const run = createImportRun(state, requestedInputs, parsed, metadata);
    Object.assign(run, { commentsDuplicate: 0, commentsCapped: 0, opportunitiesKept: 0, videoResults: [] });
    if (!parsed.videoIds.length) {
      recordImportError(run, 'no_valid_video_ids', 'No supported YouTube video URLs or IDs were provided.');
      return finishImportRun(run, 'failed');
    }

    try {
      // A niche scan already fetched all selected video metadata during ranking.
      // Manual imports and ranking failures still make one read-only videos.list call.
      if (!videoItems) run.estimatedQuotaUnits += IMPORT_LIMITS.estimatedVideosListQuota;
      const videoResponse = videoItems ? { items: videoItems } : await youtubeClient.listVideos(parsed.videoIds);
      const videosByYouTubeId = new Map((videoResponse.items || []).map((item) => [item.id, normalizeVideoFromYouTube(item)]));

      // Fair comment budget: each remaining video gets ceil(remaining budget / remaining videos);
      // anything a video does not use (few comments, comments off) rolls forward to the next ones.
      const scanVideos = [];
      for (const videoId of parsed.videoIds) {
        const normalizedVideo = videosByYouTubeId.get(videoId);
        if (!normalizedVideo) {
          run.commentsSkipped += 1;
          run.videoResults.push(makeVideoResult(videoId, null, { error: 'video_not_found' }));
          recordImportError(run, 'video_not_found', 'YouTube did not return metadata for the requested video.', { videoId });
          continue;
        }
        scanVideos.push({ videoId, normalizedVideo });
      }
      const seenThisRun = new Set();
      const keptIds = new Set();
      const resumable = [];
      const saveThread = (thread, video, result, allowance) => {
        if (result.fetched >= allowance || run.commentsFetched >= cappedOptions.maxCommentsPerRun) {
          run.commentsSkipped += 1;
          run.commentsCapped += 1;
          result.capped += 1;
          return;
        }
        const comment = normalizeCommentThreadFromYouTube(thread, video);
        run.commentsFetched += 1;
        result.fetched += 1;
        if (seenThisRun.has(comment.id)) {
          run.commentsSkipped += 1;
          run.commentsDuplicate += 1;
          result.duplicates += 1;
          return;
        }
        seenThisRun.add(comment.id);
        const upsert = upsertImportedComment(state, comment);
        run.commentIds.push(comment.id);
        if (upsert.inserted) run.commentsInserted += 1;
        if (upsert.updated) { run.commentsUpdated += 1; result.alreadySaved += 1; }
        const opportunityId = scoreAndPersist({ state, video, record: upsert.record, metadata, options });
        if (!keptIds.has(opportunityId)) {
          keptIds.add(opportunityId);
          run.opportunityIds.push(opportunityId);
        }
        result.kept += 1;
      };

      for (let index = 0; index < scanVideos.length; index += 1) {
        const { videoId, normalizedVideo } = scanVideos[index];
        const video = upsertImportedVideo(state, normalizedVideo);
        run.videoIds.push(video.id);
        const remainingBudget = Math.max(0, cappedOptions.maxCommentsPerRun - run.commentsFetched);
        const share = Math.ceil(remainingBudget / (scanVideos.length - index));
        const result = makeVideoResult(videoId, normalizedVideo, { budget: share });
        run.videoResults.push(result);
        if (share <= 0) { result.stoppedBy = 'run_budget_used'; continue; }

        let pageToken;
        try {
          // For niche scans the shared comment cap determines pages automatically.
          // One page when this video's allowance is <=100, up to the existing 3-page limit.
          const pagesForVideo = options.autoPagesPerVideo
            ? Math.min(IMPORT_LIMITS.maxPagesPerVideo, Math.max(1, Math.ceil(share / cappedOptions.maxResultsPerPage)))
            : cappedOptions.maxPagesPerVideo;
          for (let page = 0; page < pagesForVideo; page += 1) {
            const wanted = share - result.fetched;
            if (wanted <= 0) { result.stoppedBy = 'video_budget_used'; break; }
            run.estimatedQuotaUnits += IMPORT_LIMITS.estimatedCommentThreadsListQuota;
            const pageResponse = await youtubeClient.listCommentThreads({
              videoId,
              pageToken,
              maxResults: Math.min(cappedOptions.maxResultsPerPage, wanted),
            });
            run.pagesFetched += 1;
            result.pages += 1;

            for (const thread of pageResponse.items || []) saveThread(thread, video, result, share);

            pageToken = pageResponse.nextPageToken;
            if (!pageToken) { result.stoppedBy = 'no_more_comments'; break; }
            if (page + 1 >= pagesForVideo) result.stoppedBy = 'page_limit';
          }
          if (pageToken) {
            result.moreOnYouTube = true;
            if (options.autoPagesPerVideo && result.pages < IMPORT_LIMITS.maxPagesPerVideo)
              resumable.push({ videoId, video, result, pageToken });
          }
        } catch (error) {
          const safe = sanitizeThrownError(error);
          // Quota or auth problems affect every video: stop the scan. Anything else (comments off,
          // video removed) only skips this video.
          if (/quota|keyInvalid|forbidden|youtube_api_key_missing|dailyLimit/i.test(safe.code) && !/commentsDisabled/i.test(safe.code)) throw error;
          result.error = safe.code;
          result.stoppedBy = 'error';
          recordImportError(run, safe.code, safe.message, { videoId, status: safe.status });
        }
      }
      // If late videos had no readable comments, return the unused shared cap to earlier
      // videos that still have a page token. This is bounded by the existing 3-page limit.
      if (options.autoPagesPerVideo && resumable.length) {
        let available = resumable;
        while (available.length && run.commentsFetched < cappedOptions.maxCommentsPerRun) {
          const remaining = available;
          available = [];
          let progress = 0;
          for (let index = 0; index < remaining.length; index += 1) {
            const entry = remaining[index];
            const { videoId, video, result } = entry;
            if (result.pages >= IMPORT_LIMITS.maxPagesPerVideo) continue;
            const remainingBudget = cappedOptions.maxCommentsPerRun - run.commentsFetched;
            if (remainingBudget <= 0) break;
            const allowance = result.fetched + Math.ceil(remainingBudget / (remaining.length - index));
            try {
              while (result.fetched < allowance && result.pages < IMPORT_LIMITS.maxPagesPerVideo) {
                run.estimatedQuotaUnits += IMPORT_LIMITS.estimatedCommentThreadsListQuota;
                const pageResponse = await youtubeClient.listCommentThreads({
                  videoId,
                  pageToken: entry.pageToken,
                  maxResults: Math.min(cappedOptions.maxResultsPerPage, allowance - result.fetched),
                });
                run.pagesFetched += 1;
                result.pages += 1;
                const before = result.fetched;
                for (const thread of pageResponse.items || []) saveThread(thread, video, result, allowance);
                progress += result.fetched - before;
                entry.pageToken = pageResponse.nextPageToken;
                if (!entry.pageToken) { result.moreOnYouTube = false; result.stoppedBy = 'no_more_comments'; break; }
              }
              if (entry.pageToken && result.pages < IMPORT_LIMITS.maxPagesPerVideo) {
                result.stoppedBy = 'video_budget_used';
                available.push(entry);
              } else if (entry.pageToken) {
                result.stoppedBy = 'page_limit';
              }
            } catch (error) {
              const safe = sanitizeThrownError(error);
              if (/quota|keyInvalid|forbidden|youtube_api_key_missing|dailyLimit/i.test(safe.code) && !/commentsDisabled/i.test(safe.code)) throw error;
              result.error = safe.code;
              result.stoppedBy = 'error';
              result.moreOnYouTube = false;
              recordImportError(run, safe.code, safe.message, { videoId, status: safe.status });
            }
          }
          if (!progress) break;
        }
      }
      run.opportunitiesKept = keptIds.size;

      const hasErrors = run.errors.length > 0;
      return finishImportRun(run, hasErrors ? 'completed_with_errors' : 'succeeded');
    } catch (error) {
      const safe = sanitizeThrownError(error);
      recordImportError(run, safe.code, safe.message, { status: safe.status });
      return finishImportRun(run, 'failed');
    }
  });
}
