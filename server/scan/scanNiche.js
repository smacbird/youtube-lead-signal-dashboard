import { importYouTubeVideos } from '../import/importService.js';
import { buildRunSummary } from '../import/runSummary.js';
import { summarizeCandidateSelection } from './candidateDiagnostics.js';
import { RUN_RESULT_LIMIT } from '../persistence/store.js';
import { resolveNicheProfile } from '../youtube/nicheProfiles.js';
import { selectNicheVideos } from '../youtube/videoRanking.js';

// A healthy search with no eligible videos is a valid zero-result scan, not an
// API failure. Preserve errors from failed search/metadata requests as HTTP 400.
export function nicheScanResponseStatus(result) {
  if (result.run.status !== 'failed' || result.videosFound.length) return 200;
  const expected = result.profileId === 'clicks_no_sales'
    ? new Set(['no_search_candidates', 'no_eligible_affiliate_videos'])
    : result.profileId === 'traffic_leads' ? new Set(['no_search_candidates', 'no_eligible_traffic_videos']) : new Set();
  return result.searchErrors.length === 1 && expected.has(result.searchErrors[0].code) ? 200 : 400;
}

export function formatScanTitle({ profileLabel, daysBack, maxVideos, commentsFetched, startedAt }) {
  const date = new Date(startedAt || Date.now()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  return `${date} UTC · ${profileLabel || 'Manual scan'} · ${daysBack || 'custom'} days · ${maxVideos || 'manual'} videos · ${commentsFetched || 0} comments`;
}

function daysAgoIso(days) {
  const date = new Date(Date.now() - Math.max(1, Number(days) || 14) * 86400000);
  return date.toISOString();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function scanNiche({ body, store, youtubeClient }) {
  const profileId = body.profileId || body.nicheProfile || 'affiliate_marketing';
  const profile = resolveNicheProfile(profileId);
  const maxVideos = clampNumber(body.maxVideos, 1, 25, 10);
  const daysBack = clampNumber(body.daysBack, 1, 90, 14);
  const queries = Array.isArray(body.queries) && body.queries.length
    ? body.queries.map((value) => String(value).trim()).filter(Boolean).slice(0, 8)
    : profile.queries;
  const publishedAfter = daysAgoIso(daysBack);
  const selection = await selectNicheVideos({ youtubeClient, queries, maxVideos, publishedAfter, order: body.order || 'relevance', profileId });
  const found = selection.videos;
  const candidateDiagnostics = summarizeCandidateSelection(selection);
  const { searchErrors, estimatedSearchQuotaUnits, estimatedRankingQuotaUnits } = selection;

  const run = await importYouTubeVideos({
    inputs: found.map((video) => video.url),
    options: {
      ...body,
      maxVideos,
      autoPagesPerVideo: true,
      maxCommentsPerRun: body.maxCommentsPerRun || body.maxComments || 250,
      maxResultsPerPage: 100,
      profileId,
    },
    store,
    youtubeClient,
    videoItems: selection.videoItems,
    metadata: { scanType: 'niche', profileId, profileLabel: profile.label, queries, daysBack, maxVideos, order: body.order || 'relevance', profileId, profileLabel: profile.label },
  });
  // No eligible videos after a healthy search is a completed zero-result scan.
  // The importer creates the run, but its empty-input error is not a user error.
  const expectedEmpty = !found.length && searchErrors.length === 1
    && (profileId === 'clicks_no_sales' && ['no_search_candidates', 'no_eligible_affiliate_videos'].includes(searchErrors[0].code)
      || profileId === 'traffic_leads' && ['no_search_candidates', 'no_eligible_traffic_videos'].includes(searchErrors[0].code));
  if (expectedEmpty) {
    run.status = 'succeeded';
    run.errors = run.errors.filter((error) => error.code !== 'no_valid_video_ids');
  }
  run.estimatedQuotaUnits += estimatedSearchQuotaUnits + estimatedRankingQuotaUnits;
  run.candidateDiagnostics = candidateDiagnostics;
  run.title = formatScanTitle({ profileLabel: profile.label, daysBack, maxVideos, commentsFetched: run.commentsFetched, startedAt: run.startedAt });
  for (const error of searchErrors) run.errors.push(error);
  // importYouTubeVideos already saved the run; save the scan-level additions too so Previous Scans
  // shows the full quota, title and search errors.
  await store.mutate((state) => {
    const saved = state.importRuns[run.id];
    if (saved) Object.assign(saved, { estimatedQuotaUnits: run.estimatedQuotaUnits, title: run.title, errors: run.errors, status: run.status, candidateDiagnostics });
  });

  // Results for THIS scan only, looked up by the run's own opportunity ids (not a store-wide top-N).
  const runResult = await store.listOpportunitiesForRun(run.id, { limit: RUN_RESULT_LIMIT });
  const currentScanItems = runResult.items;
  const summary = buildRunSummary(run, currentScanItems, { total: runResult.total });

  return {
    profileId,
    profileLabel: profile.label,
    queries,
    daysBack,
    videosFound: found,
    candidatesConsidered: selection.candidatesConsidered,
    candidateDiagnostics,
    droppedVideos: selection.droppedVideos,
    rankedByComments: selection.rankedByComments,
    estimatedSearchQuotaUnits,
    estimatedRankingQuotaUnits,
    searchErrors,
    run,
    items: currentScanItems,
    currentScanOpportunityCount: currentScanItems.length,
    summary,
  };
}
