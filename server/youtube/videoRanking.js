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

// Clicks but No Sales is the only profile with a topical gate. Focus on the
// conversion stage, not traffic acquisition or general affiliate introductions.
const AFFILIATE_TITLE = /\baffiliate(?:s)?\b|\bpartner marketing\b/i;
const AFFILIATE_DESCRIPTION = /\baffiliate marketing\b|\baffiliate (?:links?|offers?|commissions?|programs?)\b/i;
const MUSIC_TITLE = /\b(?:music gear|music tools?|music production|audio plugins?|guitar pedals?)\b/i;
const OFF_TOPIC_TITLE = /\b(?:ecommerce|e-commerce|shopify|online stores?|product pages?)\b/i;
const PAID_AD_TITLE = /\b(?:facebook ads?|google ads?|tiktok ads?|youtube ads?|meta ads?|paid ads?|paid traffic|ppc|adwords|retargeting)\b/i;
const CLICKS_BUT_NO_SALES = /\bclicks? (?:but|and|yet) no (?:affiliate )?(?:sales|conversions?|commissions?)\b/i;
const TRAFFIC_BUT_NO_SALES = /\btraffic (?:but|and|yet) no (?:affiliate )?(?:sales|conversions?|commissions?)\b/i;
const ACQUISITION_STAGE = /\b(?:no|zero|not getting|can'?t get|cannot get) (?:affiliate |link |website |organic )*(?:clicks?|traffic)\b|\b(?:how to |ways to )?(?:get|getting|generate|drive|increase|boost) (?:more |your |affiliate |link |website |organic )*(?:clicks?|traffic)\b/i;
const DIRECT_PAIN = /\b(?:clicks? (?:but|and|yet) no (?:affiliate )?(?:sales|conversions?|commissions?)|traffic (?:but|and|yet) no (?:affiliate )?(?:sales|conversions?|commissions?)|(?:affiliate )?links? (?:not|aren't|are not|isn't|is not|won't) convert(?:ing)?|not getting (?:any )?(?:affiliate )?(?:sales|commissions?|conversions?)|no (?:affiliate )?(?:sales|commissions?|conversions?)|zero (?:affiliate )?(?:sales|commissions?|conversions?)|not converting|no one (?:buys|is buying)|traffic.to.offer mismatch|why (?:am i getting |are there )?no sales)\b/i;
const CONVERSION_TOPIC = /\b(?:affiliate )?(?:conversion rate|conversions?|sales funnel|offers? that convert|sales from (?:affiliate )?clicks?|increase (?:affiliate )?sales|improve (?:affiliate )?sales|convert (?:affiliate )?(?:clicks?|traffic|links?|offers?) (?:into|to) sales)\b/i;
const BROAD_AFFILIATE_TOPIC = /\b(?:troubleshoot(?:ing)?|common mistakes?|mistakes? to avoid|(?:not|isn't|is not|aren't|are not) working|fix(?:ing)? (?:your |an? )?(?:affiliate |sales |conversion |offer|funnel)|funnel(?:s)?|opt[- ]?ins?|bridge pages?|landing pages?|offer(?:s)?|audience (?:match|fit)|tracking (?:sales|conversions?)|conversion strateg(?:y|ies)|traffic.to.sales)\b/i;
const BROAD_EXCLUSIONS = /\b(?:beginner(?:s)? guide|affiliate marketing for beginners|how to start affiliate marketing|getting started with affiliate marketing)\b/i;

// YouTube search snippets HTML-encode titles (&#39;, &amp;) and creators use curly
// quotes; normalise before matching so "Aren’t" and "aren&#39;t" match "aren't".
export function normalizeTitle(text = '') {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

export function clicksNoSalesFit({ title = '', description = '' } = {}) {
  title = normalizeTitle(title);
  description = normalizeTitle(description);
  const affiliateTitle = AFFILIATE_TITLE.test(title);
  if (MUSIC_TITLE.test(title) || PAID_AD_TITLE.test(title) || (OFF_TOPIC_TITLE.test(title) && !affiliateTitle)) return 'off_topic';
  // An acquisition-stage title is excluded even if its description mentions
  // conversions, unless the title explicitly addresses clicks/traffic but no sales.
  if (ACQUISITION_STAGE.test(title) && !CLICKS_BUT_NO_SALES.test(title) && !TRAFFIC_BUT_NO_SALES.test(title)) return 'off_topic';
  const context = affiliateTitle || AFFILIATE_DESCRIPTION.test(description);
  if (!context) return 'off_topic';
  if (DIRECT_PAIN.test(title)) return 'direct';
  // A description can confirm a title's conversion topic, not rescue a generic
  // beginner or traffic title with unrelated tags or boilerplate.
  if (CONVERSION_TOPIC.test(title)) return 'adjacent';
  if (BROAD_AFFILIATE_TOPIC.test(title) && !BROAD_EXCLUSIONS.test(title)) return 'broad';
  return 'off_topic';
}

// Traffic & Leads searches are for affiliate publishers growing traffic to
// their own links/list, not agencies prospecting for clients. A description
// footer with affiliate links cannot turn an unrelated title into a fit.
export function trafficLeadsFit({ title = '' } = {}) {
  const headline = normalizeTitle(title);
  if (!/\baffiliate(?:s)?\b|\bpartner marketing\b/i.test(headline)) return false;
  if (/\b(?:agenc(?:y|ies)|b2b|clients?|local businesses|small businesses|businesses without websites|n8n)\b/i.test(headline)) return false;
  return /\b(?:traffic|leads?|lead generation|visitors?|audience|organic|seo|email list|list building|subscribers?|link clicks?)\b/i.test(headline);
}

/** How many distinct search candidates to request, capped to one videos.list batch. */
export function candidateTarget(maxVideos, profileId) {
  const count = Math.max(1, Math.floor(Number(maxVideos) || 1));
  return profileId === 'clicks_no_sales' && count === 10 ? MAX_CANDIDATES
    : Math.min(MAX_CANDIDATES, count * 2);
}

// Query-title lexical proxy, not a claim that a video or its audience is truly on topic.
// Require an informative search term in the title; descriptions can supply a second
// match but cannot rescue a generic unrelated title. Tiny synthetic test queries
// have no informative terms and retain their old selection behavior.
const QUERY_FILLER = new Set('how to for the a an is are with of and or best beginners beginner what why which your my from on in 2026 2025 step by do as at it no vs affiliate marketing online'.split(' '));
export function queryTopicFit({ title = '', description = '', query = '' } = {}) {
  const terms = [...new Set(normalizeTitle(query).toLowerCase().match(/[a-z]{2,}/g) || [])].filter((term) => !QUERY_FILLER.has(term));
  const headline = new Set(normalizeTitle(title).toLowerCase().match(/[a-z]{2,}/g) || []);
  const body = new Set(normalizeTitle(description).toLowerCase().match(/[a-z]{2,}/g) || []);
  const has = (words, term) => words.has(term) || (term.endsWith('s') && words.has(term.slice(0, -1))) || words.has(`${term}s`);
  // A broad query such as "affiliate marketing for beginners step by step"
  // has no niche-specific terms after filler removal. Require its domain words
  // in the title instead of treating every unrelated video as a topical match.
  if (!terms.length) {
    const anchors = [...new Set(normalizeTitle(query).toLowerCase().match(/[a-z]{2,}/g) || [])].filter((term) => ['affiliate', 'marketing', 'online'].includes(term));
    return anchors.length ? anchors.every((term) => has(headline, term)) : true;
  }
  return terms.some((term) => has(headline, term)) && (terms.length === 1 || terms.filter((term) => has(headline, term) || has(body, term)).length >= 2);
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
  const affiliateTraffic = profileId === 'traffic_leads';

  if (!statsById) {
    if (!focused && !affiliateTraffic) return {
      selected: candidates.slice(0, limit).map((video) => ({ ...video, commentCount: null, rankScore: null, titleMatches: titleProspectMatches(video.title) })),
      dropped: candidates.slice(limit).map((video) => ({ id: video.id, title: video.title, reason: 'search_order_limit', commentCount: null })),
    };
    // Focused conversion and affiliate traffic profiles require verified
    // comment floors. No metadata means no safe shortlist.
    return { selected: [], dropped: candidates.map((video) => ({ id: video.id, title: video.title, reason: 'statistics_unavailable', commentCount: null })) };
  }
  const dropped = [];
  const eligible = [];
  candidates.forEach((video, searchIndex) => {
    const stats = statsById.get(video.id);
    const title = stats?.title || video.title || '';
    const fit = focused ? clicksNoSalesFit({ title, description: stats?.description || video.description || '' }) : null;
    if (fit === 'off_topic' || (affiliateTraffic && !trafficLeadsFit({ title }))) {
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
    const floor = focused ? (fit === 'direct' ? 3 : 5) : minComments;
    if (commentCount < floor) {
      dropped.push({ id: video.id, title, reason: 'too_few_comments', commentCount });
      return;
    }
    const titleMatches = titleProspectMatches(title);
    // log scale so a 50k-comment viral video doesn't swamp everything; title cues add a bounded bonus;
    // a small search-order tiebreak keeps relevance in play.
    const rankScore = Math.log10(commentCount + 1) * 10 + Math.min(2, titleMatches.length) * 6 - searchIndex * 0.1;
    eligible.push({ ...video, ...(focused ? { fit } : {}), commentCount, titleMatches, rankScore: Math.round(rankScore * 10) / 10 });
  });
  const tier = (video) => video.fit === 'direct' ? 0 : video.fit === 'adjacent' ? 1 : 2;
  eligible.sort((a, b) => (focused ? tier(a) - tier(b) : 0) || b.rankScore - a.rankScore);
  const selected = eligible.slice(0, limit);
  for (const video of eligible.slice(limit)) dropped.push({ id: video.id, title: video.title || '', reason: 'ranked_below_cutoff', commentCount: video.commentCount });
  return { selected, dropped };
}

export const SEARCH_QUOTA_UNITS = 100;
export const VIDEOS_LIST_QUOTA_UNITS = 1;

/**
 * Ordinary profiles use two topical query angles before checking metadata; thin
 * pools may try more searches and metadata batches. Clicks but No Sales retains
 * its separate focused selector. All calls are read-only; a metadata failure on
 * ordinary profiles retains topical search order.
 */
export async function selectNicheVideos({ youtubeClient, queries, maxVideos, publishedAfter, order = 'relevance', minComments = MIN_COMMENT_COUNT, profileId }) {
  if (profileId === 'clicks_no_sales') return selectFocusedVideos({ youtubeClient, queries, maxVideos, publishedAfter, order });
  const target = candidateTarget(maxVideos, profileId);
  const affiliateTraffic = profileId === 'traffic_leads';
  const searchQueries = affiliateTraffic ? queries.slice(0, 3) : queries;
  const candidates = [];
  const seen = new Set();
  const rejected = new Map();
  const searchErrors = [];
  const videoItemsById = new Map();
  let estimatedSearchQuotaUnits = 0;
  let estimatedRankingQuotaUnits = 0;
  let metadataFailed = false;
  let selected = [];
  let dropped = [];
  let qualifiedCount = 0;

  // Two distinct query angles before deciding that the pool is good enough.
  // Each search may inspect 50 snippets for the same 100 units, but reserves
  // half the 20/10/50-candidate pool for the second angle. Thin pools can use
  // later queries, always within a 50-ID videos.list batch per lookup.
  const initialCap = queries.length > 1 ? Math.ceil(target / 2) : target;
  for (let index = 0; index < searchQueries.length && candidates.length < MAX_CANDIDATES; index++) {
    if (index >= 2 && qualifiedCount >= maxVideos) break;
    const query = searchQueries[index];
    const cap = index < 2 ? Math.min(MAX_CANDIDATES, (index + 1) * initialCap) : MAX_CANDIDATES;
    if (candidates.length < cap) {
      try {
        estimatedSearchQuotaUnits += SEARCH_QUOTA_UNITS;
        const response = await youtubeClient.searchVideos({ query, publishedAfter, maxResults: 50, order });
        for (const item of response.items || []) {
          const id = item?.id?.videoId;
          if (!id || seen.has(id)) continue;
          const video = {
            id, url: `https://www.youtube.com/watch?v=${id}`,
            title: item?.snippet?.title || 'YouTube video',
            description: item?.snippet?.description || '',
            channelTitle: item?.snippet?.channelTitle || '',
            publishedAt: item?.snippet?.publishedAt || '', matchedQuery: query,
          };
          if (!(affiliateTraffic ? trafficLeadsFit(video) : queryTopicFit({ ...video, query }))) {
            if (!rejected.has(id)) rejected.set(id, { id, title: video.title, reason: 'off_topic', commentCount: null });
            continue;
          }
          rejected.delete(id);
          seen.add(id);
          candidates.push(video);
          if (candidates.length >= cap) break;
        }
      } catch (error) {
        searchErrors.push({ query, code: error?.code || 'search_error', message: error?.message || 'YouTube search failed.' });
      }
    }
    if (index === 0 && searchQueries.length > 1) continue;
    const missing = candidates.filter(({ id }) => !videoItemsById.has(id));
    if (missing.length && !metadataFailed) {
      try {
        estimatedRankingQuotaUnits += VIDEOS_LIST_QUOTA_UNITS;
        const response = await youtubeClient.listVideos(missing.map(({ id }) => id));
        for (const item of response.items || []) videoItemsById.set(item.id, item);
      } catch (error) {
        metadataFailed = true;
        searchErrors.push({ query: null, code: 'video_ranking_failed', message: `Could not load comment counts (${error?.message || 'videos.list failed'}); ${affiliateTraffic ? 'cannot verify the 10-comment minimum, so no videos were selected' : 'kept topical search order'}.` });
      }
    }
    const stats = videoItemsById.size && !metadataFailed
      ? new Map([...videoItemsById].map(([id, item]) => [id, { commentCount: item?.statistics?.commentCount, title: item?.snippet?.title, description: item?.snippet?.description }]))
      : null;
    ({ selected, dropped } = rankCandidateVideos(candidates, stats, { maxVideos, minComments, profileId }));
    qualifiedCount = selected.length;
    if (!affiliateTraffic && stats && !selected.length && candidates.length && (index === searchQueries.length - 1 || candidates.length === MAX_CANDIDATES)) {
      const fallback = dropped.filter((video) => (video.commentCount || 0) > 0).sort((a, b) => b.commentCount - a.commentCount).slice(0, maxVideos);
      const byId = new Map(candidates.map((video) => [video.id, video]));
      selected = fallback.map((video) => ({ ...byId.get(video.id), commentCount: video.commentCount, titleMatches: titleProspectMatches(video.title), rankScore: null }));
      const keep = new Set(selected.map((video) => video.id));
      dropped = dropped.filter((video) => !keep.has(video.id));
      if (selected.length) searchErrors.push({ query: null, code: 'few_commented_videos', message: `No candidate had ${minComments}+ comments; scanned the most-commented ones instead.` });
    }
    if (metadataFailed) break;
  }
  if (affiliateTraffic && !selected.length && !searchErrors.length) searchErrors.push({ query: null, code: candidates.length || rejected.size ? 'no_eligible_traffic_videos' : 'no_search_candidates', message: 'No affiliate traffic or lead-generation videos met the 10-comment minimum in this video-age window. No comments were read; try a wider video-age window or check back later.' });
  return {
    videos: selected,
    videoItems: videoItemsById.size && !metadataFailed ? selected.map((video) => videoItemsById.get(video.id)).filter(Boolean) : null,
    candidatesConsidered: candidates.length + rejected.size,
    droppedVideos: [...dropped, ...rejected.values()], rankedByComments: videoItemsById.size > 0 && !metadataFailed,
    searchErrors, estimatedSearchQuotaUnits, estimatedRankingQuotaUnits,
  };
}

// Profile-only two-stage discovery. One metadata call when broad search snippets
// are plainly sparse OR when verified broad videos already fill the shortlist;
// a second, cheap videos.list is needed only when snippets looked promising but
// their actual comment counts are too low. Never fetch comments during selection.
async function selectFocusedVideos({ youtubeClient, queries, maxVideos, publishedAfter, order }) {
  const target = candidateTarget(maxVideos, 'clicks_no_sales');
  const primaryCount = Math.min(3, queries.length);
  const broadQueries = queries.slice(0, primaryCount);
  const fallbackQueries = queries.slice(primaryCount);
  const broadCap = fallbackQueries.length ? Math.ceil(target * 0.6) : target;
  const broadPerQuery = Math.min(25, Math.ceil(broadCap / Math.max(1, broadQueries.length)));
  const desired = Math.max(1, Math.min(maxVideos, target));
  const candidates = [];
  const seen = new Set();
  const searchErrors = [];
  const videoItemsById = new Map();
  let estimatedSearchQuotaUnits = 0;
  let estimatedRankingQuotaUnits = 0;
  let topicalCount = 0;
  let metadataFailed = false;

  async function search(query, maxResults, cap) {
    if (maxResults <= 0) return;
    try {
      estimatedSearchQuotaUnits += SEARCH_QUOTA_UNITS;
      const response = await youtubeClient.searchVideos({ query, publishedAfter, maxResults: Math.min(25, maxResults), order });
      for (const item of response.items || []) {
        const id = item?.id?.videoId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const video = {
          id,
          url: `https://www.youtube.com/watch?v=${id}`,
          title: item?.snippet?.title || 'YouTube video',
          description: item?.snippet?.description || '',
          channelTitle: item?.snippet?.channelTitle || '',
          publishedAt: item?.snippet?.publishedAt || '',
          matchedQuery: query,
        };
        candidates.push(video);
        if (clicksNoSalesFit(video) !== 'off_topic') topicalCount += 1;
        if (candidates.length >= cap) break;
      }
    } catch (error) {
      searchErrors.push({ query, code: error?.code || 'search_error', message: error?.message || 'YouTube search failed.' });
    }
  }

  async function lookup(ids) {
    if (!ids.length) return true;
    estimatedRankingQuotaUnits += VIDEOS_LIST_QUOTA_UNITS;
    try {
      const response = await youtubeClient.listVideos(ids);
      for (const item of response.items || []) videoItemsById.set(item.id, item);
      return true;
    } catch (error) {
      metadataFailed = true;
      searchErrors.push({ query: null, code: 'video_ranking_failed', message: `Could not load comment counts (${error?.message || 'videos.list failed'}); this scan needs verified counts and will skip videos.` });
      return false;
    }
  }

  function rank() {
    const stats = videoItemsById.size && !metadataFailed
      ? new Map([...videoItemsById].map(([id, item]) => [id, { commentCount: item?.statistics?.commentCount, title: item?.snippet?.title, description: item?.snippet?.description }]))
      : null;
    return { ...rankCandidateVideos(candidates, stats, { maxVideos, profileId: 'clicks_no_sales' }), stats };
  }

  for (const query of broadQueries) {
    if (candidates.length >= broadCap || topicalCount >= desired) break;
    await search(query, Math.min(broadPerQuery, broadCap - candidates.length), broadCap);
  }

  // If search snippets look abundant, verify engagement before deciding to save
  // the remaining expensive queries. Thin verified pools get the fallback queries.
  if (topicalCount >= desired && candidates.length) {
    if (!await lookup(candidates.map((video) => video.id))) return finish();
    if (rank().selected.length >= desired) return finish();
  }

  for (const query of fallbackQueries) {
    if (candidates.length >= target) break;
    await search(query, target - candidates.length, target);
  }
  const unseen = candidates.filter((video) => !videoItemsById.has(video.id));
  if (!metadataFailed) await lookup(unseen.map((video) => video.id));
  return finish();

  function finish() {
    const { selected, dropped, stats } = rank();
    if (!selected.length) {
      searchErrors.push(!candidates.length
        ? { query: null, code: 'no_search_candidates', message: 'No videos were found in this video-age window. Try another niche or check back when new videos are available.' }
        : stats
        ? { query: null, code: 'no_eligible_affiliate_videos', message: 'No affiliate conversion or troubleshooting videos met the comment minimum. Try another niche or check back when new videos are available.' }
        : { query: null, code: 'ranking_metadata_unavailable', message: 'Could not verify video topics and comment counts, so no videos were scanned. Try again later.' });
    }
    return {
      videos: selected,
      videoItems: videoItemsById.size && !metadataFailed ? selected.map((video) => videoItemsById.get(video.id)).filter(Boolean) : null,
      candidatesConsidered: candidates.length,
      droppedVideos: dropped,
      rankedByComments: Boolean(stats),
      searchErrors,
      estimatedSearchQuotaUnits,
      estimatedRankingQuotaUnits,
    };
  }
}
