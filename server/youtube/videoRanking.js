// Ranks niche-scan candidate videos so the scan spends its comment quota on
// videos whose comment sections are most likely to hold prospects.

export const MIN_COMMENT_COUNT = 10;
export const MAX_CANDIDATES = 50; // one videos.list call takes up to 50 ids

const PROSPECT_TITLE_PATTERNS = [
  { pattern: /\bbeginners?\b/i, label: 'beginner' },
  { pattern: /\bhow\s+to\s+(get\s+)?start(ed)?\b/i, label: 'how to start' },
  { pattern: /\bstart(ing)?\s+(from\s+)?(scratch|zero|nothing)\b/i, label: 'from scratch' },
  { pattern: /\blegit\b/i, label: 'legit' },
  { pattern: /\bscams?\b/i, label: 'scam' },
  { pattern: /\b(is\s+it\s+)?real\b/i, label: 'real' },
  { pattern: /\bhonest\b/i, label: 'honest' },
  { pattern: /\btruth\b/i, label: 'truth' },
  { pattern: /\bworth\s+it\b/i, label: 'worth it' },
  { pattern: /\bno\s+(experience|money|website)\b/i, label: 'no experience' },
];

/** How many search candidates to request for a scan of maxVideos videos. */
export function candidateTarget(maxVideos) {
  return Math.min(MAX_CANDIDATES, Math.max(1, Math.floor(Number(maxVideos) || 1)) * 2);
}

export function titleProspectMatches(title = '') {
  return PROSPECT_TITLE_PATTERNS.filter(({ pattern }) => pattern.test(String(title))).map(({ label }) => label);
}

/**
 * Rank candidates using videos.list statistics.
 * @param {Array<{id: string, title?: string}>} candidates in search order
 * @param {Map<string, {commentCount?: number|string|null, title?: string}>|null} statsById
 *   null means statistics are unavailable: keep the original search order.
 * @param {{ maxVideos: number, minComments?: number }} options
 * @returns {{ selected: Array, dropped: Array<{id: string, title: string, reason: string, commentCount: number|null}> }}
 */
export function rankCandidateVideos(candidates, statsById, { maxVideos, minComments = MIN_COMMENT_COUNT } = {}) {
  const limit = Math.max(1, Math.floor(Number(maxVideos) || 1));
  if (!statsById) {
    return { selected: candidates.slice(0, limit).map((video) => ({ ...video, commentCount: null, rankScore: null, titleMatches: titleProspectMatches(video.title) })), dropped: [] };
  }
  const dropped = [];
  const eligible = [];
  candidates.forEach((video, searchIndex) => {
    const stats = statsById.get(video.id);
    const title = stats?.title || video.title || '';
    if (!stats) {
      dropped.push({ id: video.id, title, reason: 'no_statistics', commentCount: null });
      return;
    }
    const raw = stats.commentCount;
    const commentCount = raw === undefined || raw === null || raw === '' ? null : Number(raw);
    if (commentCount === null || !Number.isFinite(commentCount)) {
      dropped.push({ id: video.id, title, reason: 'comments_hidden_or_disabled', commentCount: null });
      return;
    }
    if (commentCount < minComments) {
      dropped.push({ id: video.id, title, reason: 'too_few_comments', commentCount });
      return;
    }
    const titleMatches = titleProspectMatches(title);
    // log scale so a 50k-comment viral video doesn't swamp everything; title cues add a bounded bonus;
    // a small search-order tiebreak keeps relevance in play.
    const rankScore = Math.log10(commentCount + 1) * 10 + Math.min(2, titleMatches.length) * 6 - searchIndex * 0.1;
    eligible.push({ ...video, commentCount, titleMatches, rankScore: Math.round(rankScore * 10) / 10 });
  });
  eligible.sort((a, b) => b.rankScore - a.rankScore);
  const selected = eligible.slice(0, limit);
  for (const video of eligible.slice(limit)) dropped.push({ id: video.id, title: video.title || '', reason: 'ranked_below_cutoff', commentCount: video.commentCount });
  return { selected, dropped };
}

export const SEARCH_QUOTA_UNITS = 100;
export const VIDEOS_LIST_QUOTA_UNITS = 1;

/**
 * Search for candidates (up to 2x maxVideos), fetch statistics in ONE videos.list call,
 * then keep the best maxVideos. Read-only: uses youtubeClient.searchVideos and listVideos.
 * If videos.list fails, keeps the original search order and records a searchErrors entry.
 */
export async function selectNicheVideos({ youtubeClient, queries, maxVideos, publishedAfter, order = 'relevance', minComments = MIN_COMMENT_COUNT }) {
  const target = candidateTarget(maxVideos);
  const perQuery = Math.min(25, Math.max(1, Math.ceil(target / Math.max(1, queries.length))));
  const candidates = [];
  const seen = new Set();
  const searchErrors = [];
  let estimatedSearchQuotaUnits = 0;
  let estimatedRankingQuotaUnits = 0;

  for (const query of queries) {
    if (candidates.length >= target) break;
    try {
      estimatedSearchQuotaUnits += SEARCH_QUOTA_UNITS;
      const response = await youtubeClient.searchVideos({ query, publishedAfter, maxResults: perQuery, order });
      for (const item of response.items || []) {
        const id = item?.id?.videoId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        candidates.push({
          id,
          url: `https://www.youtube.com/watch?v=${id}`,
          title: item?.snippet?.title || 'YouTube video',
          channelTitle: item?.snippet?.channelTitle || '',
          publishedAt: item?.snippet?.publishedAt || '',
          matchedQuery: query,
        });
        if (candidates.length >= target) break;
      }
    } catch (error) {
      searchErrors.push({ query, code: error?.code || 'search_error', message: error?.message || 'YouTube search failed.' });
    }
  }

  let statsById = null;
  if (candidates.length) {
    try {
      estimatedRankingQuotaUnits += VIDEOS_LIST_QUOTA_UNITS;
      const response = await youtubeClient.listVideos(candidates.map((video) => video.id));
      statsById = new Map((response.items || []).map((item) => [item.id, { commentCount: item?.statistics?.commentCount, title: item?.snippet?.title }]));
    } catch (error) {
      searchErrors.push({ query: null, code: 'video_ranking_failed', message: `Could not load comment counts (${error?.message || 'videos.list failed'}); kept search order.` });
    }
  }

  let { selected, dropped } = rankCandidateVideos(candidates, statsById, { maxVideos, minComments });
  if (statsById && !selected.length && candidates.length) {
    // Every candidate is under the comment threshold: scan the most-commented ones rather than nothing.
    const fallback = dropped.filter((video) => (video.commentCount || 0) > 0).sort((a, b) => b.commentCount - a.commentCount).slice(0, Math.max(1, Math.floor(Number(maxVideos) || 1)));
    const byId = new Map(candidates.map((video) => [video.id, video]));
    selected = fallback.map((video) => ({ ...byId.get(video.id), commentCount: video.commentCount, titleMatches: titleProspectMatches(video.title), rankScore: null }));
    const keep = new Set(selected.map((video) => video.id));
    dropped = dropped.filter((video) => !keep.has(video.id));
    if (selected.length) searchErrors.push({ query: null, code: 'few_commented_videos', message: `No candidate had ${minComments}+ comments; scanned the most-commented ones instead.` });
  }

  return {
    videos: selected,
    candidatesConsidered: candidates.length,
    droppedVideos: dropped,
    rankedByComments: Boolean(statsById),
    searchErrors,
    estimatedSearchQuotaUnits,
    estimatedRankingQuotaUnits,
  };
}
