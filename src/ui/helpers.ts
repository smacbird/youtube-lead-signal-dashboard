import { uniqueDraftStyles } from './draftSelection.js';
import { leadBucket } from '../scoring/leadBuckets.js';
import { safeDraftsForOpportunity } from '../scoring/draftSafety.js';
import { olspReviewFor } from '../../server/youtube/olspReview.js';
import type { FreshnessWindow, LocalStatus, NicheGroup, NicheProfile, OpportunityType, ReviewTab, ScanSummary, ScoredFixture } from './types';

// Order and labels mirror server/youtube/nicheProfiles.js (Steve's approved lineup).
// `group` drives the "Main choices" / "Explore more" split in Step 1.
export const NICHES: Array<{ id: NicheProfile; group: NicheGroup; label: string; phrase: string; finds: string }> = [
  { id: 'clicks_no_sales', group: 'main', label: 'Clicks but No Sales', phrase: 'clicks but no sales', finds: 'People getting clicks or traffic but no affiliate sales, asking what to fix.' },
  { id: 'traffic_leads', group: 'main', label: 'Getting Traffic & Leads', phrase: 'traffic and leads', finds: 'People asking how to get their first leads, clients or website visitors.' },
  { id: 'affiliate_funnels', group: 'main', label: 'Affiliate Funnels & Opt-Ins', phrase: 'affiliate funnels and opt-ins', finds: 'People setting up a funnel, opt-in page or lead magnet and asking how.' },
  { id: 'email_follow_up', group: 'main', label: 'Email Follow-Up', phrase: 'email follow-up', finds: 'People asking how to write follow-up emails or pick an autoresponder.' },
  { id: 'organic_traffic', group: 'main', label: 'Organic Traffic', phrase: 'organic traffic', finds: 'People asking how to rank on Google and get free visitors without ads.' },
  { id: 'choosing_offers', group: 'main', label: 'Choosing Affiliate Offers', phrase: 'choosing affiliate offers', finds: 'People asking which offer, program or niche to promote.' },
  { id: 'training_reviews', group: 'main', label: 'Affiliate Training Reviews', phrase: 'affiliate training', finds: 'People weighing a course or program: is it legit, worth the money?' },
  { id: 'affiliate_marketing', group: 'main', label: 'Affiliate Marketing', phrase: 'affiliate marketing', finds: 'Beginners asking how to start or grow with affiliate links and commissions.' },
  { id: 'ai_tools', group: 'explore', label: 'AI Tools for Marketing', phrase: 'AI tools for marketing', finds: 'People asking which AI tool to use for content and marketing work.' },
  { id: 'biz_opp', group: 'explore', label: 'Compare Online Businesses', phrase: 'online business models', finds: 'People comparing business models and asking which to pick.' },
  { id: 'work_from_home', group: 'explore', label: 'Home-Based Business', phrase: 'home-based business', finds: 'People who want a home-based business: parents, retirees, career changers.' },
  { id: 'side_hustles', group: 'explore', label: 'Side Hustles & Online Income', phrase: 'side hustles and online income', finds: 'People with a day job asking for realistic extra income online.' },
];

export const NICHE_GROUPS: Array<{ key: NicheGroup; title: string }> = [
  { key: 'main', title: 'Main choices' },
  { key: 'explore', title: 'Explore more' },
];

export function nicheLabel(id: NicheProfile) {
  return NICHES.find((niche) => niche.id === id)?.label || id;
}

export function nichePhrase(id: NicheProfile) {
  return NICHES.find((niche) => niche.id === id)?.phrase || id.replaceAll('_', ' ');
}

export const statusLabels: Record<LocalStatus, string> = {
  new: 'New',
  reviewed: 'Looked at',
  approved: 'Reply ready',
  rejected: 'Skipped',
  replied: 'Replied',
};

export const statusHelp: Record<LocalStatus, string> = {
  new: 'You have not acted on this one yet.',
  reviewed: 'You have looked at it. Get a reply ready, or skip it.',
  approved: 'Reply is ready. Post it on YouTube yourself, then mark it replied.',
  rejected: 'Skipped. It stays in Done unless you reopen it.',
  replied: 'Marked as replied. Nothing was posted by this app; you posted it yourself.',
};

export const typeLabels: Record<OpportunityType, string> = {
  all: 'All kinds',
  niche_lead: 'Real prospect',
  affiliate_publisher_opportunity: 'Site owner problem',
  consumer_buyer_question: 'Buyer question',
  low_fit_comment: 'Not a fit',
};

export const tabInfo: Record<ReviewTab, { label: string; help: string }> = {
  best: { label: 'Best leads', help: 'Real prospects: people asking how to start, what it costs, or whether it is legit. Start here.' },
  maybe: { label: 'Maybe', help: 'Some interest, but weaker or riskier. Worth a quick look when Best leads is empty.' },
  not_fit: { label: 'Not a fit', help: 'Thanks, jokes, spam and comments about the video itself. Each one explains why it is not a fit.' },
  done: { label: 'Done', help: 'Comments you replied to or skipped.' },
  buyer: { label: 'Buyer questions', help: 'People deciding which product to buy (from pasted video links).' },
  publisher: { label: 'Site owner problems', help: 'Site owners with traffic or commission problems (from pasted video links).' },
};

const strengthLabels: Record<string, string> = { urgent: 'Very high', high: 'High', medium: 'Medium', low: 'Low' };
export function leadStrengthLabel(priority: string) { return strengthLabels[priority] || priority; }
export function riskLabel(risk: string) { return risk === 'high' ? 'High' : risk === 'medium' ? 'Medium' : 'Low'; }

export const dimensionLabels: Record<string, string> = {
  affiliatePublisherSignal: 'Affiliate site owner',
  publisherRevenuePain: 'Money problem stated',
  publisherActionIntent: 'Asks for a next step',
  consumerRecommendationIntent: 'Asks what to buy',
  consumerComparisonIntent: 'Compares options',
  consumerBudgetConstraint: 'Mentions a budget',
  consumerProductCategory: 'Clear product type',
  urgency: 'Time pressure',
  contentOpportunity: 'Good content idea',
  replyability: 'Easy to reply to',
  spamComplianceRisk: 'Reputation risk',
  nicheStartIntent: 'Wants to start',
  nicheCostTime: 'Asks about cost or time',
  nicheLegitimacy: 'Asks if it is legit',
  nicheSituation: 'Describes their situation',
  nicheResourceAsk: 'Asks for a recommendation',
  nicheQuestion: 'Asks a question',
  nicheKeywordFit: 'Matches the niche',
  noiseSignal: 'Not-a-fit signal',
};

export const replyStyleLabels: Record<string, string> = {
  ai_short_helpful: 'Short answer',
  ai_consultative: 'Detailed answer',
  ai_content_angle: 'Video idea',
  fallback_short: 'Suggested answer',
};

// Niche-scan "not a fit" items carry lowFitReason; older items do not.
export function isNoise(item: ScoredFixture) {
  return item.score.opportunityType === 'low_fit_comment' && Boolean(item.score.lowFitReason);
}

export function situationDetails(item: ScoredFixture): string[] {
  return item.score.scoreDimensions.find((dimension) => dimension.dimension === 'nicheSituation')?.evidence || [];
}

export function reviewBucket(item: ScoredFixture, status: LocalStatus) {
  return leadBucket({ opportunityType: item.score.opportunityType, overallScore: item.score.overallScore, riskLevel: item.score.riskLevel, leadFit: item.score.leadFit, status });
}

export function matchesTab(item: ScoredFixture, status: LocalStatus, tab: ReviewTab) {
  const bucket = reviewBucket(item, status);
  if (tab === 'buyer') return bucket !== 'done' && item.score.opportunityType === 'consumer_buyer_question';
  if (tab === 'publisher') return bucket !== 'done' && item.score.opportunityType === 'affiliate_publisher_opportunity';
  return bucket === tab;
}

export function commentAgeDays(item: ScoredFixture) {
  const published = new Date(item.comment.publishedAt).getTime();
  if (!Number.isFinite(published)) return null;
  return Math.max(0, Math.floor((Date.now() - published) / 86400000));
}

export function ageLabel(item: ScoredFixture) {
  const days = commentAgeDays(item);
  if (days === null) return 'age unknown';
  if (days === 0) return 'posted today';
  if (days === 1) return '1 day old';
  if (days < 30) return `${days} days old`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month old' : `${months} months old`;
}

export function isWithinAge(item: ScoredFixture, window: FreshnessWindow) {
  if (window === 'all') return true;
  const days = commentAgeDays(item);
  return days !== null && days <= Number(window);
}

export function whyThisMatters(item: ScoredFixture) {
  if (item.score.opportunityType === 'niche_lead') {
    const niche = NICHES.find((entry) => entry.label.toLowerCase() === item.score.nicheProfileLabel?.toLowerCase())?.phrase
      || item.score.nicheProfileLabel?.replace(/^./, (letter) => letter.toLowerCase()) || 'the video topic';
    return `This person is asking for help with ${niche}. Check their situation below and answer only what they asked, without a sales pitch.`;
  }
  if (isNoise(item)) return `Not a fit: ${item.score.summary}`;
  if (item.score.opportunityType === 'affiliate_publisher_opportunity') return 'A site owner or creator asking about affiliate links, commissions, tracking, or turning traffic into sales.';
  if (item.score.opportunityType === 'consumer_buyer_question') return 'Someone deciding what to buy, comparing options, or asking if a product is worth it.';
  return 'Probably not worth a reply, but it may still give you a content idea.';
}

export function nextBestAction(item: ScoredFixture) {
  const days = commentAgeDays(item);
  if (item.score.riskLevel === 'high' || item.score.recommendedAction === 'reject_as_spam') return 'Skip it';
  if (item.score.opportunityType === 'low_fit_comment') return 'No reply needed';
  if (days !== null && days > 30) return `${ageLabel(item)}: old comment, use for ideas`;
  if (days !== null && days >= 14) return `${ageLabel(item)}: reply only if the thread is still active`;
  if (item.score.recommendedAction === 'save_content_idea') return 'Consider a video idea';
  if (item.score.leadFit === 'maybe') return 'Review before replying';
  if (item.score.opportunityType === 'niche_lead' || item.score.overallScore >= 68) return 'Write a helpful reply';
  return 'Worth a look';
}

export function makeYouTubeVideoUrl(item: ScoredFixture) {
  const videoId = item.video.youtubeVideoId;
  if (videoId && !videoId.includes('FIX')) return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return item.video.url ?? '#';
}

export function makeYouTubeCommentUrl(item: ScoredFixture) {
  const videoId = item.video.youtubeVideoId;
  const commentId = item.comment.youtubeCommentId;
  if (videoId && commentId && !videoId.includes('FIX') && !commentId.includes('FIX')) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(commentId)}`;
  }
  return makeYouTubeVideoUrl(item);
}

export function isRealYouTubeUrl(url: string) {
  return url.startsWith('https://www.youtube.com/') || url.startsWith('https://youtube.com/');
}

export function getOlspReview(item: ScoredFixture) {
  return item.olspReview || olspReviewFor(item.video, item.comment);
}

export function copyBundleText(item: ScoredFixture, draftText?: string) {
  return [
    `Lead: ${typeLabels[item.score.opportunityType]}`,
    getOlspReview(item)?.reason ? `OLSP: review (${getOlspReview(item)?.reason})` : '',
    `Lead strength: ${leadStrengthLabel(item.score.priority)} (${item.score.overallScore}/100)`,
    `Why: ${whyThisMatters(item)}`,
    `Next step: ${nextBestAction(item)}`,
    `Video: ${item.video.title}`,
    `Commenter: ${item.comment.authorDisplayName}`,
    `Comment: ${item.comment.textOriginal}`,
    `Comment link: ${makeYouTubeCommentUrl(item)}`,
    draftText ? `Draft reply: ${draftText}` : '',
  ].filter(Boolean).join('\n\n');
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportOpportunitiesCsv(items: ScoredFixture[], statuses: Record<string, LocalStatus>) {
  const rows = [
    ['score', 'type', 'lead_strength', 'reputation_risk', 'status', 'age', 'reason', 'low_fit_reason', 'olsp_review', 'olsp_reason', 'niche', 'video', 'commenter', 'comment', 'url'],
    ...items.map((item) => [
      item.score.overallScore,
      item.score.opportunityTypeLabel,
      item.score.priority,
      item.score.riskLevel,
      statuses[item.id] ?? item.opportunity.status,
      ageLabel(item),
      item.score.summary,
      item.score.lowFitReason || '',
      getOlspReview(item)?.flagged ? 'OLSP: review' : '',
      getOlspReview(item)?.reason || '',
      item.score.nicheProfileLabel || '',
      item.video.title,
      item.comment.authorDisplayName,
      item.comment.textOriginal,
      makeYouTubeCommentUrl(item),
    ]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `best-lead-system-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function makeDrafts(item: ScoredFixture, selectedDraftId?: string) {
  const safe = safeDraftsForOpportunity(item.opportunity.replyDrafts ?? [], item.opportunity.id);
  return uniqueDraftStyles(safe, selectedDraftId);
}

export function transitionOptions(status: LocalStatus, riskLevel: ScoredFixture['score']['riskLevel']) {
  const options: Array<{ to: LocalStatus; label: string; note: string; tone?: 'safe' | 'danger' | 'mock' }> = [];
  const ready = { to: 'approved' as LocalStatus, label: riskLevel === 'high' ? 'Reply ready (use care)' : 'Reply ready', note: 'Marks your reply as ready. Nothing is posted.', tone: 'safe' as const };
  const skip = { to: 'rejected' as LocalStatus, label: 'Skip', note: 'Moves it to Done without replying.', tone: 'danger' as const };
  const replied = { to: 'replied' as LocalStatus, label: 'I replied on YouTube', note: 'Moves it to Done. This app never posts for you.', tone: 'mock' as const };
  if (status === 'new') options.push(replied, ready, { to: 'reviewed', label: 'Looked at it', note: 'Marks it as looked at.' }, skip);
  if (status === 'reviewed') options.push(replied, ready, skip);
  if (status === 'approved') options.push(replied, { ...skip, label: 'Skip instead' });
  if (status === 'replied' || status === 'rejected') options.push({ to: 'reviewed', label: 'Reopen', note: 'Moves it back out of Done.' });
  return options;
}

export function normaliseImportedOpportunity(raw: any): ScoredFixture {
  const video = raw.video || {};
  const comment = raw.comment || {};
  return {
    id: raw.id,
    olspReview: raw.olspReview || olspReviewFor(video, comment),
    video: {
      id: video.id || raw.videoId || 'imported_video',
      youtubeVideoId: video.youtubeVideoId || video.id,
      title: video.title || 'YouTube video',
      channelName: video.channelName || video.channelTitle || 'YouTube channel',
      description: video.description || '',
      publishedAt: video.publishedAt || raw.createdAt || new Date().toISOString(),
      topic: video.topic || 'youtube_import',
      offerFit: video.offerFit || raw.detectedOfferFit || [],
      url: video.url,
    },
    comment: {
      id: comment.id || raw.commentId,
      youtubeCommentId: comment.youtubeCommentId || comment.id,
      authorDisplayName: comment.authorDisplayName || comment.authorName || 'YouTube commenter',
      textOriginal: comment.textOriginal || comment.text || '',
      publishedAt: comment.publishedAt || raw.createdAt || new Date().toISOString(),
      likeCount: comment.likeCount || 0,
      replyCount: comment.replyCount || 0,
      signals: comment.signals || [],
      language: comment.language || 'en',
    },
    opportunity: { id: raw.id, status: raw.status || 'new', replyDrafts: raw.replyDrafts || [] },
    score: {
      overallScore: raw.overallScore || 0,
      priority: raw.priority || 'low',
      riskLevel: raw.riskLevel || 'low',
      summary: raw.summary || 'Imported YouTube comment.',
      opportunityType: raw.opportunityType || 'low_fit_comment',
      opportunityTypeLabel: raw.opportunityTypeLabel || typeLabels[raw.opportunityType as OpportunityType] || 'Imported comment',
      leadFit: raw.leadFit || null,
      recommendedAction: raw.recommendedAction || 'reply',
      detectedOfferFit: raw.detectedOfferFit || [],
      evidenceSnippets: raw.evidenceSnippets || [],
      scoreDimensions: raw.scoreDimensions || [],
      lowFitReason: raw.lowFitReason || null,
      nicheProfileLabel: raw.nicheProfileLabel || null,
      nicheProfileId: raw.nicheProfileId || null,
    },
  };
}

function countBuckets(items: ScoredFixture[], statuses: Record<string, LocalStatus>) {
  const counts = { best: 0, maybe: 0, not_fit: 0, done: 0 };
  for (const item of items) counts[reviewBucket(item, statuses[item.id] ?? item.opportunity.status)] += 1;
  return counts;
}

export function headlineFor(counts: { best: number; maybe: number; not_fit: number; done: number }) {
  const parts = [`${counts.best} lead${counts.best === 1 ? '' : 's'}`];
  if (counts.maybe) parts.push(`${counts.maybe} maybe`);
  parts.push(`${counts.not_fit} not a fit`);
  if (counts.done) parts.push(`${counts.done} done`);
  return parts.join(' + ');
}

/** Builds the Step 2 result card from the server summary when there is one, else from the items. */
export function buildScanSummary(source: ScanSummary['source'], items: ScoredFixture[], body: any = {}): ScanSummary {
  const server = body.summary;
  const run = body.run || {};
  const candidateDiagnostics = server?.candidateDiagnostics ?? run.candidateDiagnostics ?? body.candidateDiagnostics ?? null;
  const statuses = Object.fromEntries(items.map((item) => [item.id, item.opportunity.status])) as Record<string, LocalStatus>;
  const counts = countBuckets(items, statuses);
  const notes: string[] = [];
  for (const error of [...(body.searchErrors || []), ...(run.errors || [])]) {
    if (error?.message && !notes.includes(error.message)) notes.push(error.message);
  }
  return {
    source,
    title: run.title,
    startedAt: run.startedAt,
    candidatesConsidered: candidateDiagnostics?.considered ?? body.candidatesConsidered ?? null,
    candidateDiagnostics,
    candidateDiagnosticsNotRecorded: source === 'previous' && run.metadata?.scanType === 'niche' && !candidateDiagnostics,
    headline: headlineFor(counts),
    best: counts.best,
    maybe: counts.maybe,
    notFit: counts.not_fit,
    done: counts.done,
    nicheLeads: items.filter((item) => item.score.opportunityType === 'niche_lead').length,
    fetched: server?.fetched ?? Number(run.commentsFetched || items.length),
    kept: server?.kept ?? items.length,
    shown: items.length,
    notShown: server ? server.notShown : null,
    overDisplayLimit: server?.overDisplayLimit ?? 0,
    duplicates: server?.duplicates ?? 0,
    capped: server?.capped ?? 0,
    skipped: server?.skipped ?? 0,
    videos: candidateDiagnostics?.selected ?? (body.videosFound ? body.videosFound.length : server?.perVideo?.length ?? null),
    readableVideos: server?.perVideo?.length ? server.perVideo.filter((video: { fetched: number }) => video.fetched > 0).length : null,
    quotaUnits: Number(run.estimatedQuotaUnits || 0),
    perVideo: server?.perVideo || [],
    notes: notes.slice(0, 4),
  };
}
