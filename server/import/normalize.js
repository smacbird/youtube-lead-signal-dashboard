import { normalizeCommentUrl, normalizeVideoUrl } from '../youtube/url.js';

const AFFILIATE_TERMS = ['affiliate', 'commission', 'amazon associates', 'shareasale', 'impact', 'niche site', 'review site', 'buyer guide'];
const REVENUE_TERMS = ['traffic but no', 'clicks but no', 'low revenue', 'not converting', 'commissions dropped', 'rpm'];
const SPAM_TERMS = ['guaranteed', 'easy money', 'telegram', 'crypto', 'private link', 'hide disclosure', 'fake review'];
const PRODUCT_DECISION_TERMS = ['which', 'best', 'worth it', 'vs', 'under $', 'recommend', 'should i buy'];

function includesTerm(text, terms) {
  return terms.some((term) => text.includes(term));
}

function asInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function inferSignals(video, commentText) {
  const text = `${video.title || ''} ${commentText || ''}`.toLowerCase();
  const signals = [];
  if (includesTerm(text, AFFILIATE_TERMS)) signals.push('affiliate');
  if (includesTerm(text, REVENUE_TERMS)) signals.push('revenue_pain', 'funnel_leak');
  if (includesTerm(text, PRODUCT_DECISION_TERMS) || text.includes('?')) signals.push('buyer_intent', 'content_opportunity', 'replyable');
  if (includesTerm(text, SPAM_TERMS)) signals.push('spam', 'compliance_risk');
  if (!signals.includes('replyable') && text.includes('?') && !signals.includes('spam')) signals.push('replyable');
  return [...new Set(signals)];
}

function inferOfferFit(video, commentText) {
  const text = `${video.title || ''} ${commentText || ''}`.toLowerCase();
  const offerFit = [];
  if (includesTerm(text, ['affiliate', 'commission', 'review site', 'buyer guide'])) offerFit.push('content_strategy');
  if (includesTerm(text, ['clicks but no', 'email signups', 'before the affiliate click'])) offerFit.push('affiliate_funnel');
  if (includesTerm(text, ['track revenue', 'ga4', 'amazon reports', 'dashboard'])) offerFit.push('affiliate_tracking');
  if (includesTerm(text, ['which', 'best', 'under $', 'vs', 'worth it'])) offerFit.push('product_selector');
  return [...new Set(offerFit)];
}

export function normalizeVideoFromYouTube(item) {
  const snippet = item.snippet || {};
  const statistics = item.statistics || {};
  const status = item.status || {};
  return {
    id: `yt_video_${item.id}`,
    youtubeVideoId: item.id,
    title: snippet.title || 'Untitled YouTube video',
    channelId: snippet.channelId || null,
    channelName: snippet.channelTitle || 'Unknown channel',
    publishedAt: snippet.publishedAt || null,
    topic: 'youtube_import',
    offerFit: inferOfferFit({ title: snippet.title || '' }, ''),
    url: normalizeVideoUrl(item.id),
    viewCount: asInt(statistics.viewCount),
    likeCount: asInt(statistics.likeCount),
    commentCount: asInt(statistics.commentCount),
    privacyStatus: status.privacyStatus || null,
    rawEtag: item.etag || null,
  };
}

export function normalizeCommentThreadFromYouTube(thread, video) {
  const threadSnippet = thread.snippet || {};
  const topLevel = threadSnippet.topLevelComment || {};
  const commentSnippet = topLevel.snippet || {};
  const commentId = topLevel.id || thread.id;
  const textOriginal = commentSnippet.textOriginal || commentSnippet.textDisplay || '';
  return {
    id: `yt_comment_${commentId}`,
    videoId: video.id,
    youtubeCommentId: commentId,
    youtubeThreadId: thread.id,
    authorDisplayName: commentSnippet.authorDisplayName || 'Unknown commenter',
    authorChannelId: commentSnippet.authorChannelId?.value || null,
    textOriginal,
    publishedAt: commentSnippet.publishedAt || null,
    updatedAt: commentSnippet.updatedAt || null,
    likeCount: asInt(commentSnippet.likeCount),
    replyCount: asInt(threadSnippet.totalReplyCount),
    isChannelOwner: Boolean(commentSnippet.authorChannelId?.value && commentSnippet.authorChannelId.value === video.channelId),
    language: 'unknown',
    signals: inferSignals(video, textOriginal),
    url: normalizeCommentUrl(video.youtubeVideoId, commentId),
    rawEtag: topLevel.etag || thread.etag || null,
  };
}

export function makeScoringItem(video, comment) {
  const offerFit = [...new Set([...(video.offerFit || []), ...inferOfferFit(video, comment.textOriginal)])];
  return {
    id: `import_${comment.id}`,
    video: {
      id: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      channelName: video.channelName,
      publishedAt: video.publishedAt,
      topic: offerFit.length ? 'affiliate_marketing' : 'youtube_import',
      offerFit,
      url: video.url,
    },
    comment: {
      id: comment.id,
      videoId: video.id,
      youtubeCommentId: comment.youtubeCommentId,
      authorDisplayName: comment.authorDisplayName,
      authorChannelId: comment.authorChannelId,
      textOriginal: comment.textOriginal,
      publishedAt: comment.publishedAt,
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      isChannelOwner: comment.isChannelOwner,
      language: comment.language,
      signals: comment.signals || [],
    },
  };
}

export function makeReplyDrafts(opportunityId, comment) {
  const now = new Date().toISOString();
  return [
    {
      id: `draft_${opportunityId}_helpful`,
      opportunityId,
      style: 'helpful_consultative',
      body: `Helpful angle to review manually: answer ${comment.authorDisplayName}'s question with one concrete next step, then point to a relevant public resource if one exists.`,
      complianceNotes: ['Manual approval required', 'No earnings guarantee', 'Do not ask for private data in public comments'],
      createdAt: now,
      createdBy: 'template_import',
    },
  ];
}
