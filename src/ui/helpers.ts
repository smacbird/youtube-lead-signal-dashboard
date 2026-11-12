import { leadBucket } from '../scoring/leadBuckets.js';
import type { DraftStyle, FreshnessWindow, LocalStatus, NicheProfile, OpportunityType, ReplyDraft, ReviewTab, ScanSummary, ScoredFixture } from './types';

export const NICHES: Array<{ id: NicheProfile; label: string; finds: string }> = [
  { id: 'affiliate_marketing', label: 'Affiliate marketing', finds: 'People asking how to start or grow with affiliate links, sites and commissions.' },
  { id: 'money_making', label: 'Making money online', finds: 'Beginners asking how to earn online, what it costs and whether it is legit.' },
  { id: 'work_from_home', label: 'Work-from-home business', finds: 'People who want a home-based business: parents, retirees, career changers.' },
  { id: 'side_hustles', label: 'Side hustles', finds: 'People with a day job looking for extra income after hours.' },
  { id: 'biz_opp', label: 'Business opportunities', finds: 'People weighing an opportunity and asking whether it is real and what it costs.' },
  { id: 'ai_tools', label: 'AI tools and software', finds: 'People asking which AI tool to use, what it costs and how to get started.' },
  { id: 'traffic_leads', label: 'Getting leads and traffic', finds: 'Business owners asking how to get leads, clients or website visitors.' },
  { id: 'organic_traffic', label: 'Free traffic from Google (SEO)', finds: 'Site owners asking how to rank on Google and get visitors without ads.' },
];

export function nicheLabel(id: NicheProfile) {
  return NICHES.find((niche) => niche.id === id)?.label || id;
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
  not_fit: { label: 'Not a fit', help: 'Thanks, jokes, spam and comments about the video itself. Each one says why it was set aside.' },
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
  helpful_consultative: 'Helpful',
  concise_resource: 'Short',
  content_follow_up: 'Content idea',
  risk_aware_decline: 'Careful wording',
  ai_short_helpful: 'AI: short',
  ai_consultative: 'AI: helpful',
  ai_content_angle: 'AI: content idea',
};

// Niche-scan "not a fit" items carry lowFitReason; older items do not.
export function isNoise(item: ScoredFixture) {
  return item.score.opportunityType === 'low_fit_comment' && Boolean(item.score.lowFitReason);
}

export function situationDetails(item: ScoredFixture): string[] {
  return item.score.scoreDimensions.find((dimension) => dimension.dimension === 'nicheSituation')?.evidence || [];
}

export function reviewBucket(item: ScoredFixture, status: LocalStatus) {
  return leadBucket({ opportunityType: item.score.opportunityType, overallScore: item.score.overallScore, riskLevel: item.score.riskLevel, status });
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
  if (item.score.opportunityType === 'niche_lead') return item.score.summary;
  if (isNoise(item)) return `Set aside: ${item.score.summary}`;
  if (item.score.opportunityType === 'affiliate_publisher_opportunity') return 'A site owner or creator asking about affiliate links, commissions, tracking, or turning traffic into sales.';
  if (item.score.opportunityType === 'consumer_buyer_question') return 'Someone deciding what to buy, comparing options, or asking if a product is worth it.';
  return 'Probably not worth a reply, but it may still give you a content idea.';
}

export function nextBestAction(item: ScoredFixture) {
  const days = commentAgeDays(item);
  if (item.score.riskLevel === 'high' || item.score.recommendedAction === 'reject_as_spam') return 'Skip it';
  if (item.score.opportunityType === 'low_fit_comment') return 'No reply needed';
  if (days !== null && days > 14) return 'Older comment: reply only if the thread is still active';
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

export function copyBundleText(item: ScoredFixture, draftText?: string) {
  return [
    `Lead: ${typeLabels[item.score.opportunityType]}`,
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
    ['score', 'type', 'lead_strength', 'reputation_risk', 'status', 'age', 'reason', 'low_fit_reason', 'niche', 'video', 'commenter', 'comment', 'url'],
    ...items.map((item) => [
      item.score.overallScore,
      item.score.opportunityTypeLabel,
      item.score.priority,
      item.score.riskLevel,
      statuses[item.id] ?? item.opportunity.status,
      ageLabel(item),
      item.score.summary,
      item.score.lowFitReason || '',
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

function draftForStyle(item: ScoredFixture, style: DraftStyle): ReplyDraft {
  const topic = item.score.nicheProfileLabel || item.video.topic.replaceAll('_', ' ');
  const offer = item.score.detectedOfferFit[0] ? item.score.detectedOfferFit[0].replaceAll('_', ' ') : topic;
  if (style === 'helpful_consultative') {
    return { id: `${item.opportunity.id}_generated_consultative`, style, body: `A good reply would acknowledge ${item.comment.authorDisplayName}'s question, give one practical first step for ${topic}, and invite them to compare it with their own situation, without asking for private details in public.`, complianceNotes: ['You approve every reply', 'No promised results', 'No private details'] };
  }
  if (style === 'concise_resource') {
    return { id: `${item.opportunity.id}_generated_concise`, style, body: `Short version: point them to a checklist or simple framework for ${offer}, and remind them to judge it against their own situation first.`, complianceNotes: ['Helpful pointer, not a pitch', 'No pressure'] };
  }
  if (style === 'content_follow_up') {
    return { id: `${item.opportunity.id}_generated_content_follow_up`, style, body: `This could become a short video or post: answer the question for ${topic} using the general problem, not this person's details.`, complianceNotes: ['Content idea, not a reply', 'Keep the commenter anonymous'] };
  }
  return { id: `${item.opportunity.id}_generated_risk_aware`, style, body: 'Use careful wording: acknowledge the concern, avoid promises or regulated advice, and keep it educational rather than promotional.', complianceNotes: ['Extra care needed', 'No promised results', 'No sensitive details in public'] };
}

export function makeDrafts(item: ScoredFixture) {
  const drafts = [...(item.opportunity.replyDrafts ?? [])];
  for (const style of ['helpful_consultative', 'concise_resource', 'content_follow_up'] as DraftStyle[]) {
    if (!drafts.some((draft) => draft.style === style) && item.score.recommendedAction !== 'reject_as_spam') drafts.push(draftForStyle(item, style));
  }
  if ((item.score.riskLevel !== 'low' || item.score.recommendedAction === 'reject_as_spam') && !drafts.some((draft) => draft.style === 'risk_aware_decline')) {
    drafts.push(draftForStyle(item, 'risk_aware_decline'));
  }
  return drafts;
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
    video: {
      id: video.id || raw.videoId || 'imported_video',
      youtubeVideoId: video.youtubeVideoId || video.id,
      title: video.title || 'YouTube video',
      channelName: video.channelName || video.channelTitle || 'YouTube channel',
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
      recommendedAction: raw.recommendedAction || 'reply',
      detectedOfferFit: raw.detectedOfferFit || [],
      evidenceSnippets: raw.evidenceSnippets || [],
      scoreDimensions: raw.scoreDimensions || [],
      lowFitReason: raw.lowFitReason || null,
      nicheProfileLabel: raw.nicheProfileLabel || null,
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
  parts.push(`${counts.not_fit} low fit`);
  if (counts.done) parts.push(`${counts.done} done`);
  return parts.join(' + ');
}

/** Builds the Step 2 result card from the server summary when there is one, else from the items. */
export function buildScanSummary(source: ScanSummary['source'], items: ScoredFixture[], body: any = {}): ScanSummary {
  const server = body.summary;
  const run = body.run || {};
  const statuses = Object.fromEntries(items.map((item) => [item.id, item.opportunity.status])) as Record<string, LocalStatus>;
  const counts = countBuckets(items, statuses);
  const notes: string[] = [];
  for (const error of [...(body.searchErrors || []), ...(run.errors || [])]) {
    if (error?.message && !notes.includes(error.message)) notes.push(error.message);
  }
  return {
    source,
    title: run.title,
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
    videos: body.videosFound ? body.videosFound.length : server?.perVideo?.length ?? null,
    quotaUnits: Number(run.estimatedQuotaUnits || 0),
    perVideo: server?.perVideo || [],
    notes: notes.slice(0, 4),
  };
}
