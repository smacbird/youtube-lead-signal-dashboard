export const IMPORT_LIMITS = Object.freeze({
  maxVideosPerRun: 25,
  maxPagesPerVideo: 3,
  maxResultsPerPage: 100,
  maxCommentsPerRun: 300,
  estimatedVideosListQuota: 1,
  estimatedCommentThreadsListQuota: 1,
});

export function clampImportOptions(options = {}) {
  return {
    maxVideosPerRun: Math.max(1, Math.min(Number(options.maxVideosPerRun || options.maxVideos) || IMPORT_LIMITS.maxVideosPerRun, IMPORT_LIMITS.maxVideosPerRun)),
    maxPagesPerVideo: Math.max(1, Math.min(Number(options.maxPagesPerVideo) || 1, IMPORT_LIMITS.maxPagesPerVideo)),
    maxResultsPerPage: Math.max(1, Math.min(Number(options.maxResultsPerPage) || 100, IMPORT_LIMITS.maxResultsPerPage)),
    maxCommentsPerRun: Math.max(1, Math.min(Number(options.maxCommentsPerRun) || IMPORT_LIMITS.maxCommentsPerRun, IMPORT_LIMITS.maxCommentsPerRun)),
  };
}
