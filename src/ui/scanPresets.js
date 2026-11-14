// Scan sizes shown in Step 2, and an honest YouTube quota estimate for each.
// Mirrors videoRanking: ordinary cards search two topical angles first (50 snippets
// requested per search; at most 50 distinct metadata candidates overall). Focused
// Clicks but No Sales retains its separate selector. Metadata is reused at import.

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

export function estimateScanQuota({ videos, comments, queryCount = 6, profileId } = {}) {
  const v = Math.max(1, Math.min(25, Math.floor(Number(videos) || 1)));
  const cap = Math.max(1, Math.min(300, Math.floor(Number(comments) || 1)));
  const q = Math.min(profileId === 'traffic_leads' ? 3 : Infinity, Math.max(1, Math.floor(Number(queryCount) || 1)));
  const target = profileId === 'clicks_no_sales' && v === 10 ? 50 : Math.min(50, v * 2);
  const broadCap = q > 3 ? Math.ceil(target * 0.6) : target;
  const broadPerQuery = Math.ceil(broadCap / Math.min(3, q));
  const topicalTarget = Math.min(broadCap, v);
  const minSearches = profileId === 'clicks_no_sales'
    ? Math.min(q, Math.ceil(topicalTarget / broadPerQuery))
    : Math.min(q, 2);
  // With enough search results: searches cost 100 each, the ranking videos.list is
  // reused at import (1 unit, or 2 when focused fallback verifies a thin broad
  // pool), and commentThreads costs 1 per page actually read.
  // A normal fair share <=100 uses one page/video. Roll-forward can make a later
  // video's share >100, bounded by 3 pages/video and the global comment cap.
  const typicalCommentPages = Math.min(v, cap);
  const maxCommentPages = Math.min(v * 3, cap);
  const low = minSearches * SEARCH_UNITS + 1 + typicalCommentPages;
  const high = q * SEARCH_UNITS + (profileId === 'clicks_no_sales' ? (q > 3 ? 2 : 1) : Math.max(1, q - 1)) + maxCommentPages;
  return { low, high, minSearches, maxSearches: q, typicalCommentPages, maxCommentPages };
}
