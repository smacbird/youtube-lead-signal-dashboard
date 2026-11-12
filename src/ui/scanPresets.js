// Scan sizes shown in Step 2, and an honest YouTube quota estimate for each.
// Mirrors server/youtube/videoRanking.js (2x candidates, cap 50, <=25 per search)
// and the import (reuse one videos.list result; one commentThreads call per page read).

export const DAILY_QUOTA = 10000;
export const SEARCH_UNITS = 100;

export const SCAN_PRESETS = [
  { id: 'quick', label: 'Quick', videos: 5, comments: 100, time: 'about 30 seconds', blurb: '5 videos, up to 100 comments. Good for a first look.' },
  { id: 'standard', label: 'Standard', videos: 10, comments: 200, time: 'about 1 minute', blurb: '10 videos, up to 200 comments. Right for most days.' },
  { id: 'deep', label: 'Deep', videos: 25, comments: 300, time: '2 to 3 minutes', blurb: '25 videos, up to 300 comments (the most one scan can read).' },
];

export function presetForVideos(videos) {
  return SCAN_PRESETS.find((preset) => preset.videos === Number(videos)) || SCAN_PRESETS[0];
}

export function estimateScanQuota({ videos, comments, queryCount = 6 }) {
  const v = Math.max(1, Math.min(25, Math.floor(Number(videos) || 1)));
  const cap = Math.max(1, Math.min(300, Math.floor(Number(comments) || 1)));
  const q = Math.max(1, Math.floor(Number(queryCount) || 1));
  const target = Math.min(50, v * 2);
  const perQuery = Math.min(25, Math.ceil(target / q));
  const minSearches = Math.min(q, Math.ceil(target / perQuery));
  // With enough search results: searches cost 100 each, the ranking videos.list is
  // reused at import (1 unit total), and commentThreads costs 1 per page actually read.
  // A normal fair share <=100 uses one page/video. Roll-forward can make a later
  // video's share >100, bounded by 3 pages/video and the global comment cap.
  const typicalCommentPages = Math.min(v, cap);
  const maxCommentPages = Math.min(v * 3, cap);
  const low = minSearches * SEARCH_UNITS + 1 + typicalCommentPages;
  const high = q * SEARCH_UNITS + 1 + maxCommentPages;
  return { low, high, minSearches, maxSearches: q, typicalCommentPages, maxCommentPages };
}
