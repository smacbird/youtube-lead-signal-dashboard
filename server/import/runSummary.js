import { bucketCounts } from '../../src/scoring/leadBuckets.js';

/**
 * Plain-English accounting for one scan: where every fetched comment went.
 * fetched = kept + duplicates; capped comments arrived in a page but were over budget.
 * notShown = fetched comments that are not in the returned items (duplicates +
 * any response truncation). Capped comments are counted separately because they
 * are excluded before incrementing fetched.
 */
export function buildRunSummary(run, items = [], { total } = {}) {
  const buckets = bucketCounts(items);
  const fetched = run.commentsFetched || 0;
  const kept = run.opportunitiesKept ?? items.length;
  const duplicates = run.commentsDuplicate || 0;
  const capped = run.commentsCapped || 0;
  const shown = items.length;
  const notShown = Math.max(0, fetched - shown);
  const overDisplayLimit = Math.max(0, kept - shown);
  const perVideo = (run.videoResults || []).map((video) => ({
    youtubeVideoId: video.youtubeVideoId,
    title: video.title,
    commentCountOnYouTube: video.commentCountOnYouTube,
    budget: video.budget,
    fetched: video.fetched,
    kept: video.kept,
    duplicates: video.duplicates,
    alreadySaved: video.alreadySaved,
    capped: video.capped,
    moreOnYouTube: video.moreOnYouTube,
    stoppedBy: video.stoppedBy,
    error: video.error,
  }));
  return {
    fetched,
    kept,
    duplicates,
    capped,
    skipped: run.commentsSkipped || 0,
    shown,
    notShown,
    overDisplayLimit,
    totalForRun: total ?? kept,
    best: buckets.best,
    maybe: buckets.maybe,
    notFit: buckets.not_fit,
    done: buckets.done,
    headline: buckets.headline,
    perVideo,
  };
}
