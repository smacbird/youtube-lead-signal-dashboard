// Scan sizes shown in Step 2, and an honest YouTube quota estimate for each.
// Mirrors server/youtube/videoRanking.js (2x candidates, cap 50, <=25 per search)
// and the import (one videos.list for ranking, one for import, one commentThreads page per video).

export const DAILY_QUOTA = 10000;
export const SEARCH_UNITS = 100;

export const SCAN_PRESETS = [
  { id: 'quick', label: 'Quick', videos: 5, comments: 100, pages: 2, time: 'about 30 seconds', blurb: '5 videos, up to 100 comments. Good for a first look.' },
  { id: 'standard', label: 'Standard', videos: 10, comments: 200, pages: 2, time: 'about 1 minute', blurb: '10 videos, up to 200 comments. Right for most days.' },
  { id: 'deep', label: 'Deep', videos: 25, comments: 300, pages: 2, time: '2 to 3 minutes', blurb: '25 videos, up to 300 comments (the most one scan can read).' },
];

export function presetForVideos(videos) {
  return SCAN_PRESETS.find((preset) => preset.videos === Number(videos)) || SCAN_PRESETS[0];
}

export function estimateScanQuota({ videos, pages = 1, queryCount = 6 }) {
  const v = Math.max(1, Math.floor(Number(videos) || 1));
  const q = Math.max(1, Math.floor(Number(queryCount) || 1));
  const target = Math.min(50, v * 2);
  const perQuery = Math.min(25, Math.ceil(target / q));
  const minSearches = Math.min(q, Math.ceil(target / perQuery));
  const low = minSearches * SEARCH_UNITS + 2 + v;
  const high = q * SEARCH_UNITS + 2 + v * Math.max(1, Math.floor(Number(pages) || 1));
  return { low, high, minSearches, maxSearches: q };
}
