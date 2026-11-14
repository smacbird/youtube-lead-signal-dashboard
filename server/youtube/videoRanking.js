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

// Only Clicks but No Sales is a topical gate. Other profiles keep their existing
// ranking. A video's description can establish affiliate context for a relevant
// title, but a generic "affiliate links below" footer cannot turn music gear or
// ecommerce product-page videos into conversion-pain prospects.
const AFFILIATE_TITLE = /\baffiliate(?:s)?\b|\bpartner marketing\b/i;
const AFFILIATE_DESCRIPTION = /\baffiliate marketing\b|\baffiliate (?:links?|offers?|commissions?|programs?)\b/i;
const OFF_TOPIC_TITLE = /\b(?:music gear|music tools?|music production|audio plugins?|guitar pedals?|ecommerce|e-commerce|shopify|online stores?|product pages?)\b/i;
const PAIN = /\b(?:clicks? (?:but|and) no (?:sales|conversions?)|traffic (?:but|and) no (?:sales|conversions?|commissions?)|(?:affiliate )?links? (?:not|aren't|isn't|won't) convert(?:ing)?|no (?:affiliate )?(?:sales|commissions?|conversions?)|zero (?:affiliate )?(?:sales|commissions?|conversions?)|not converting|no one (?:buys|is buying)|traffic.to.offer mismatch|conversion rate|why (?:am i getting |are there )?no sales)\b/i;

export function clicksNoSalesFit({ title = '', description = '' } = {}) {
  const affiliateTitle = AFFILIATE_TITLE.test(title);
  if (OFF_TOPIC_TITLE.test(title) && !affiliateTitle) return 'off_topic';
  // Affiliate context in a description counts only with a direct pain title;
  // descriptions often carry unrelated boilerplate affiliate-link disclosures.
  const titlePain = PAIN.test(title);
  const context = affiliateTitle || (titlePain && AFFILIATE_DESCRIPTION.test(description));
  if (!context) return 'off_topic';
  // Generic beginner videos often mention conversion rates in boilerplate; only
  // a concrete pain phrase in the description upgrades them to direct.
  if (titlePain || (affiliateTitle && PAIN.test(description.replace(/\bconversion rate\b/gi, '')))) return 'direct';
  return affiliateTitle ? 'adjacent' : 'off_topic';
}

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
 *   null means statistics are unavailable: other profiles keep search order; this profile needs verified counts.
 * @param {{ maxVideos: number, minComments?: number, profileId?: string }} options
 * @returns {{ selected: Array, dropped: Array<{id: string, title: string, reason: string, commentCount: number|null}> }}
 */
export function rankCandidateVideos(candidates, statsById, { maxVideos, minComments = MIN_COMMENT_COUNT, profileId } = {}) {
  const limit = Math.max(1, Math.floor(Number(maxVideos) || 1));
  const focused = profileId === 'clicks_no_sales';
  if (focused) minComments = 5;
  if (!statsById) {
    if (!focused) return { selected: candidates.slice(0, limit).map((video) => ({ ...video, commentCount: null, rankScore: null, titleMatches: titleProspectMatches(video.title) })), dropped: [] };
    // For this profile, no statistics means the five-comment floor cannot be
    // verified. Return an honest empty shortlist instead of scanning blindly.
    return { selected: [], dropped: candidates.map((video) => ({ id: video.id, title: video.title, reason: 'statistics_unavailable', commentCount: null })) };
  }
  const dropped = [];
  const eligible = [];
  candidates.forEach((video, searchIndex) => {
    const stats = statsById.get(video.id);
    const title = stats?.title || video.title || '';
    const fit = focused ? clicksNoSalesFit({ title, description: stats?.description || video.description || '' }) : null;
    if (fit === 'off_topic') {
      dropped.push({ id: video.id, title, reason: 'off_topic', commentCount: null });
      return;
    }
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
    eligible.push({ ...video, ...(focused ? { fit } : {}), commentCount, titleMatches, rankScore: Math.round(rankScore * 10) / 10 });
  });
  eligible.sort((a, b) => (focused ? (a.fit === 'direct' ? 0 : 1) - (b.fit === 'direct' ? 0 : 1) : 0) || b.rankScore - a.rankScore);
  const selected = eligible.slice(0, limit);
  for (const video of eligible.slice(limit)) dropped.push({ id: video.id, title: video.title || '', reason: 'ranked_below_cutoff', commentCount: video.commentCount });
  return { selected, dropped };
}

export const SEARCH_QUOTA_UNITS = 100;
export const VIDEOS_LIST_QUOTA_UNITS = 1;

/**
 * Search for candidates (up to 2x maxVideos), fetch statistics in ONE videos.list call,
 * then keep the best maxVideos. Read-only: uses youtubeClient.searchVideos and listVideos.
 * If videos.list fails, other profiles keep search order; Clicks but No Sales skips unverified videos.
 */
export async function selectNicheVideos({ youtubeClient, queries, maxVideos, publishedAfter, order = 'relevance', minComments = MIN_COMMENT_COUNT, profileId }) {
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
          description: item?.snippet?.description || '',
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
  let videoItemsById = null;
  if (candidates.length) {
    try {
      estimatedRankingQuotaUnits += VIDEOS_LIST_QUOTA_UNITS;
      const response = await youtubeClient.listVideos(candidates.map((video) => video.id));
      videoItemsById = new Map((response.items || []).map((item) => [item.id, item]));
      statsById = new Map((response.items || []).map((item) => [item.id, { commentCount: item?.statistics?.commentCount, title: item?.snippet?.title, description: item?.snippet?.description }]));
    } catch (error) {
      searchErrors.push({ query: null, code: 'video_ranking_failed', message: `Could not load comment counts (${error?.message || 'videos.list failed'}); ${profileId === 'clicks_no_sales' ? 'this scan needs verified counts and will skip videos' : 'kept search order'}.` });
    }
  }

  let { selected, dropped } = rankCandidateVideos(candidates, statsById, { maxVideos, minComments, profileId });
  if (profileId !== 'clicks_no_sales' && statsById && !selected.length && candidates.length) {
    // Every candidate is under the comment threshold: scan the most-commented ones rather than nothing.
    const fallback = dropped.filter((video) => (video.commentCount || 0) > 0).sort((a, b) => b.commentCount - a.commentCount).slice(0, Math.max(1, Math.floor(Number(maxVideos) || 1)));
    const byId = new Map(candidates.map((video) => [video.id, video]));
    selected = fallback.map((video) => ({ ...byId.get(video.id), commentCount: video.commentCount, titleMatches: titleProspectMatches(video.title), rankScore: null }));
    const keep = new Set(selected.map((video) => video.id));
    dropped = dropped.filter((video) => !keep.has(video.id));
    if (selected.length) searchErrors.push({ query: null, code: 'few_commented_videos', message: `No candidate had ${minComments}+ comments; scanned the most-commented ones instead.` });
  }

  if (profileId === 'clicks_no_sales' && candidates.length && !selected.length) {
    searchErrors.push(statsById
      ? { query: null, code: 'no_eligible_affiliate_videos', message: 'No on-topic affiliate videos with at least 5 comments were found. Try a broader video-age choice (up to 90 days) or another niche.' }
      : { query: null, code: 'ranking_metadata_unavailable', message: 'Could not verify video topics and comment counts, so no videos were scanned. Try again later.' });
  }

  return {
    videos: selected,
    // Reuse the read-only videos.list response during import; don't spend a second unit.
    videoItems: videoItemsById ? selected.map((video) => videoItemsById.get(video.id)).filter(Boolean) : null,
    candidatesConsidered: candidates.length,
    droppedVideos: dropped,
    rankedByComments: Boolean(statsById),
    searchErrors,
    estimatedSearchQuotaUnits,
    estimatedRankingQuotaUnits,
  };
}
