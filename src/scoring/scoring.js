const DIMENSIONS = [
  'affiliatePublisherSignal',
  'publisherRevenuePain',
  'publisherActionIntent',
  'consumerRecommendationIntent',
  'consumerComparisonIntent',
  'consumerBudgetConstraint',
  'consumerProductCategory',
  'urgency',
  'contentOpportunity',
  'replyability',
  'spamComplianceRisk',
];

const OPPORTUNITY_TYPE_LABELS = {
  affiliate_publisher_opportunity: 'Affiliate publisher opportunity',
  consumer_buyer_question: 'Consumer buyer question',
  low_fit_comment: 'Low-fit comment',
};

const AFFILIATE_KEYWORDS = [
  'affiliate', 'amazon associates', 'impact', 'shareasale', 'cj', 'clickbank',
  'commission', 'commissions', 'niche site', 'content site', 'review site', 'product review',
  'comparison post', 'comparison posts', 'buyer guide', 'buying guide', 'affiliate click',
  'affiliate clicks', 'affiliate link', 'affiliate links', 'disclosure', 'sponsored',
  'review page', 'roundup', 'product roundup', 'revenue by article', 'email signups',
  'lead magnet', 'affiliate funnel', 'amazon reports', 'partner program', 'publisher',
];

const REVENUE_PAIN_KEYWORDS = [
  'traffic but no sales', 'traffic but no conversions', 'traffic but no commissions',
  'clicks but no sales', 'click and disappear', 'clicks and disappear', 'almost no email signups',
  'no email signups', 'low rpm', 'low revenue', 'not converting', 'conversion rate is terrible',
  'commissions dropped', 'amazon cut', 'earnings dropped', 'revenue dropped', 'vendors changed pricing',
  'outdated', 'old page', 'ranking but', 'rank for', 'lots of traffic', 'high traffic',
];

const PUBLISHER_ACTION_KEYWORDS = [
  'what would you add', 'what should i add', 'should i', 'would you build', 'what would you recommend',
  'is there a template', 'do you have a template', 'checklist', 'calculator', 'quiz', 'selector',
  'dashboard', 'how do i track', 'how do i collect', 'how often should', 'what tool', 'best tool',
  'alternative', 'where do i start', 'update the whole post', 'separate comparison pages',
];

const CONSUMER_RECOMMENDATION_KEYWORDS = [
  'which product should i buy', 'which one should i buy', 'which should i buy', 'what should i buy',
  'which should i get', 'should i buy', 'should i get', 'recommend', 'recommendation',
  'what would you recommend', 'best ', 'top pick', 'help me choose', 'worth it', 'buying advice',
];

const CONSUMER_COMPARISON_KEYWORDS = [
  ' vs ', ' versus ', 'compare', 'comparison', 'compared with', 'or should i', 'or the',
  'better than', 'difference between', 'choosing between', 'which is better', 'instead of',
];

const BUDGET_KEYWORDS = [
  'under $', 'less than $', 'below $', 'budget', 'cheap', 'cheaper', 'affordable', 'price',
  'worth the extra', 'worth it', 'deal', 'on sale', 'costs',
];

const PRODUCT_CATEGORY_KEYWORDS = [
  'camera', 'lens', 'laptop', 'monitor', 'headphones', 'earbuds', 'microphone', 'standing desk',
  'desk', 'chair', 'vacuum', 'coffee grinder', 'espresso machine', 'router', 'keyboard', 'tablet',
  'phone', 'printer', 'software', 'crm', 'projector', 'water filter', 'air purifier', 'mattress',
];

const URGENCY_KEYWORDS = [
  'today', 'this week', 'by friday', 'before my trip', 'before we launch', 'asap', 'right now',
  'need to buy', 'buying now', 'deadline', 'gift', 'sale ends', 'prime day', 'black friday',
  'holiday', 'already tried', 'stuck', 'need help',
];

const CONTENT_KEYWORDS = [
  'comparison', 'review', 'buyer guide', 'buying guide', 'template', 'spreadsheet', 'calculator',
  'quiz', 'selector', 'checklist', 'resource hub', 'content hub', 'update the whole post',
  'separate comparison pages', 'which camera should i buy', 'which product should i buy',
  'which one should i buy', 'under $', 'best ', ' vs ', 'alternative to', 'vendors changed pricing',
  'pricing changed', 'faq', 'worth it',
];

const RISK_KEYWORDS = [
  'hide my affiliate disclosure', 'hide disclosure', 'fake review', 'fake reviews', 'guaranteed',
  'guarantee', 'secret system', 'make $', 'easy money', 'crypto', 'private link', 'telegram',
  'before youtube deletes', 'no disclosure', 'sponsored but', 'medical', 'mortgage', 'insurance',
  'lawyer', 'legal advice', 'health', 'nutrition', 'supplement', 'cure', 'treatment', 'diagnose',
  'investment', 'loan', 'credit score', 'tax advice', 'children', 'kids safety',
];

const OFFER_KEYWORDS = {
  affiliate_funnel: ['affiliate click', 'affiliate clicks', 'email signups', 'lead magnet', 'before the affiliate click', 'people click'],
  content_strategy: ['comparison', 'review', 'buyer guide', 'buying guide', 'content', 'article', 'post', 'resource hub'],
  affiliate_tracking: ['track revenue', 'revenue by article', 'which links convert', 'affiliate dashboard', 'ga4', 'amazon reports', 'impact dashboard'],
  disclosure_trust: ['disclosure', 'trust', 'fake reviews', 'honest review', 'sponsored'],
  product_selector: ['quiz', 'calculator', 'selector', 'which one should i buy', 'under $', 'which product should i buy'],
  niche_research: ['niche', 'offer', 'monetize', 'monetise', 'affiliate offers'],
  consumer_product_recommendation: ['which product should i buy', 'what should i buy', 'recommend', 'best ', 'worth it'],
  consumer_comparison_reply: [' vs ', 'versus', 'compare', 'which is better'],
  budget_buying_guide: ['under $', 'budget', 'affordable', 'worth the extra'],
};

function clamp(value) { return Math.max(0, Math.min(100, Math.round(value))); }
function containsKeyword(text, word) {
  const trimmed = word.trim();
  if (trimmed.length <= 4 && /^[a-z0-9 ]+$/.test(trimmed)) {
    return new RegExp('\\b' + trimmed.replaceAll(' ', '\\s+') + '\\b').test(text);
  }
  return text.includes(word);
}
function includesAny(text, words) { return words.filter((word) => containsKeyword(text, word)); }
function snippet(text, phrase) {
  const lower = text.toLowerCase();
  const index = lower.indexOf(phrase.toLowerCase().trim());
  if (index === -1) return phrase.trim();
  return text.slice(index, Math.min(text.length, index + Math.max(phrase.length, 90))).trim();
}
function evidenceFrom(text, matches, limit = 4) { return [...new Set(matches)].slice(0, limit).map((match) => snippet(text, match)); }
function hasSignal(item, signal) { return item.comment.signals?.includes(signal); }
function textFor(item) { return `${item.video.topic} ${item.video.title} ${(item.video.offerFit || []).join(' ')} ${item.comment.textOriginal}`.toLowerCase(); }
function commentText(item) { return item.comment.textOriginal.toLowerCase(); }

function detectOfferFit(item) {
  const text = textFor(item);
  const detected = new Set(item.video.offerFit || []);
  for (const [offer, keywords] of Object.entries(OFFER_KEYWORDS)) {
    if (keywords.some((keyword) => containsKeyword(text, keyword))) detected.add(offer);
  }
  if (hasSignal(item, 'spam')) return [];
  return [...detected];
}

function scoreAffiliatePublisherSignal(item) {
  const text = textFor(item);
  const matches = includesAny(text, AFFILIATE_KEYWORDS);
  let score = matches.length * 13;
  if (hasSignal(item, 'affiliate')) score += 36;
  if (hasSignal(item, 'buyer_intent_affiliate')) score += 12;
  if (item.video.topic === 'affiliate_marketing') score += 28;
  if (hasSignal(item, 'publisher')) score += 24;
  if (hasSignal(item, 'consumer_buyer_question')) score -= 12;
  if (hasSignal(item, 'spam')) score = Math.min(score, 35);
  return {
    dimension: 'affiliatePublisherSignal',
    score: clamp(score),
    reason: score >= 70 ? 'Strong publisher/site-owner affiliate context: commissions, review content, tracking, disclosure, or funnel monetization.' : score >= 45 ? 'Some affiliate publisher context exists, but it needs supporting intent before ranking highly.' : 'Not clearly a publisher or affiliate-marketing opportunity.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scorePublisherRevenuePain(item) {
  const text = commentText(item);
  const matches = includesAny(text, REVENUE_PAIN_KEYWORDS);
  let score = matches.length * 18;
  if (hasSignal(item, 'revenue_pain')) score += 42;
  if (hasSignal(item, 'funnel_leak')) score += 28;
  if (/\$\d|\d+ posts|\d+ articles|\d+ clicks|\d+%/.test(text)) score += 12;
  if (hasSignal(item, 'consumer_buyer_question')) score = Math.min(score, 25);
  if (hasSignal(item, 'spam')) score = 0;
  return {
    dimension: 'publisherRevenuePain',
    score: clamp(score),
    reason: score >= 80 ? 'Strong publisher monetization pain: traffic, clicks, rankings, or commissions are leaking.' : score >= 45 ? 'Some affiliate revenue or content-performance problem is stated.' : 'Little publisher revenue pain is stated.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scorePublisherActionIntent(item) {
  const text = commentText(item);
  const matches = includesAny(text, PUBLISHER_ACTION_KEYWORDS);
  let score = matches.length * 15;
  if (hasSignal(item, 'buyer_intent_affiliate')) score += 42;
  if (hasSignal(item, 'template_request')) score += 20;
  if (text.includes('?')) score += 8;
  if (hasSignal(item, 'consumer_buyer_question')) score = Math.min(score, 30);
  if (hasSignal(item, 'spam')) score = Math.min(score, 5);
  if (hasSignal(item, 'hostile')) score = Math.min(score, 15);
  return {
    dimension: 'publisherActionIntent',
    score: clamp(score),
    reason: score >= 80 ? 'The publisher asks for a concrete tool, template, content structure, or next step.' : score >= 45 ? 'The publisher has a usable question, but intent is moderate.' : 'No strong publisher action request is present.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreConsumerRecommendationIntent(item) {
  const text = commentText(item);
  const matches = includesAny(text, CONSUMER_RECOMMENDATION_KEYWORDS);
  let score = matches.length * 18;
  if (hasSignal(item, 'consumer_buyer_question')) score += 38;
  if (hasSignal(item, 'recommendation_intent')) score += 28;
  if (text.includes('?')) score += 8;
  if (hasSignal(item, 'spam')) score = Math.min(score, 8);
  return {
    dimension: 'consumerRecommendationIntent',
    score: clamp(score),
    reason: score >= 80 ? 'Clear consumer buying decision: the commenter asks what to buy, choose, or whether a product is worth it.' : score >= 45 ? 'Some product-decision intent exists, but it may be broad or weak.' : 'No clear consumer buying recommendation request is present.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreConsumerComparisonIntent(item) {
  const text = commentText(item);
  const matches = includesAny(text, CONSUMER_COMPARISON_KEYWORDS);
  let score = matches.length * 22;
  if (hasSignal(item, 'comparison_intent')) score += 42;
  if (/\b[a-z0-9][a-z0-9+\- ]{1,28}\s+vs\.?\s+[a-z0-9][a-z0-9+\- ]{1,28}\b/i.test(item.comment.textOriginal)) score += 24;
  if (hasSignal(item, 'spam')) score = Math.min(score, 8);
  return {
    dimension: 'consumerComparisonIntent',
    score: clamp(score),
    reason: score >= 75 ? 'The comment compares products or asks which option is better.' : score >= 40 ? 'There is a comparison angle, but it is not the main request.' : 'No meaningful product comparison was detected.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreConsumerBudgetConstraint(item) {
  const text = commentText(item);
  const matches = includesAny(text, BUDGET_KEYWORDS);
  let score = matches.length * 18;
  if (hasSignal(item, 'budget_constraint')) score += 42;
  if (/under\s*\$?\d+|less than\s*\$?\d+|below\s*\$?\d+|\$\d+/.test(text)) score += 28;
  if (hasSignal(item, 'spam')) score = Math.min(score, 8);
  return {
    dimension: 'consumerBudgetConstraint',
    score: clamp(score),
    reason: score >= 70 ? 'A concrete budget or price tradeoff is part of the buying decision.' : score >= 35 ? 'Some price sensitivity is present.' : 'No clear budget constraint is stated.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreConsumerProductCategory(item) {
  const text = textFor(item);
  const matches = includesAny(text, PRODUCT_CATEGORY_KEYWORDS);
  let score = matches.length * 18;
  if (hasSignal(item, 'product_category')) score += 36;
  if (item.video.topic === 'consumer_product_reviews') score += 24;
  if (hasSignal(item, 'spam')) score = Math.min(score, 20);
  return {
    dimension: 'consumerProductCategory',
    score: clamp(score),
    reason: score >= 70 ? 'The product category is specific enough for a useful public recommendation framework.' : score >= 35 ? 'A product category is visible, but the request may need more context.' : 'No specific product category is clear.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreUrgency(item) {
  const text = commentText(item);
  const matches = includesAny(text, URGENCY_KEYWORDS);
  let score = matches.length * 16;
  if (hasSignal(item, 'urgent')) score += 42;
  if (hasSignal(item, 'revenue_pain') && (/this week|today|dropped|ranking but|traffic/.test(text))) score += 16;
  if (hasSignal(item, 'spam')) score = Math.min(score, 10);
  return {
    dimension: 'urgency',
    score: clamp(score),
    reason: score >= 70 ? 'The commenter signals time pressure or a near-term buying/revenue decision.' : score >= 35 ? 'Some urgency is implied.' : 'No strong urgency signal is present.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreContentOpportunity(item) {
  const text = commentText(item);
  const matches = includesAny(text, CONTENT_KEYWORDS);
  let score = matches.length * 13;
  if (hasSignal(item, 'content_opportunity')) score += 38;
  if (hasSignal(item, 'template_request')) score += 18;
  if (hasSignal(item, 'consumer_buyer_question')) score += 12;
  if (item.comment.likeCount >= 20) score += 10;
  if (item.comment.replyCount >= 5) score += 8;
  if (hasSignal(item, 'spam')) score = Math.min(score, 12);
  return {
    dimension: 'contentOpportunity',
    score: clamp(score),
    reason: score >= 80 ? 'Strong reusable content/tool idea: guide, comparison, selector, checklist, or buying framework.' : score >= 45 ? 'Some content angle exists, but it may not be the main action.' : 'Low content asset value.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreSpamComplianceRisk(item) {
  const text = `${item.comment.authorDisplayName} ${item.comment.textOriginal}`.toLowerCase();
  const matches = includesAny(text, RISK_KEYWORDS);
  let score = matches.length * 14;
  if (hasSignal(item, 'spam')) score += 72;
  if (hasSignal(item, 'compliance_risk')) score += 58;
  if (hasSignal(item, 'earnings_claim')) score += 36;
  if (hasSignal(item, 'regulated_caution')) score += 24;
  if (hasSignal(item, 'hostile')) score += 22;
  if (!matches.length && !hasSignal(item, 'compliance_risk') && !hasSignal(item, 'regulated_caution')) score -= 8;
  return {
    dimension: 'spamComplianceRisk',
    score: clamp(score),
    reason: score >= 80 ? 'High risk: spam, deceptive claims, hidden disclosure, regulated advice, or unsafe wording.' : score >= 35 ? 'Some trust/compliance risk exists; use conservative wording.' : 'No major spam or compliance red flags detected.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function scoreReplyability(item, riskScore, affiliateScore, consumerScore) {
  const text = commentText(item);
  const matches = includesAny(text, ['what', 'how', 'should', 'recommend', 'template', 'checklist', 'quiz', 'calculator', 'which', 'best', 'worth it', 'vs']);
  let score = 34;
  if (affiliateScore >= 55 || consumerScore >= 55) score += 26;
  if (hasSignal(item, 'replyable')) score += 24;
  if (hasSignal(item, 'replyable_with_caution')) score += 12;
  if (hasSignal(item, 'buyer_intent_affiliate') || hasSignal(item, 'consumer_buyer_question')) score += 12;
  if (text.includes('?')) score += 8;
  if (hasSignal(item, 'spam') || hasSignal(item, 'not_replyable')) score = 0;
  if (hasSignal(item, 'hostile')) score = Math.min(score, 25);
  if (riskScore >= 80) score = Math.min(score, 48);
  if (riskScore >= 95) score = 0;
  return {
    dimension: 'replyability',
    score: clamp(score),
    reason: score >= 80 ? 'A helpful public reply can answer the question without sounding spammy or asking for private details.' : score >= 45 ? 'A reply is possible, but it needs caution or may be better as a content idea.' : 'Low value or unsafe to reply publicly.',
    evidence: evidenceFrom(item.comment.textOriginal, matches),
  };
}

function dimensionMap(dimensions) { return Object.fromEntries(dimensions.map((x) => [x.dimension, x.score])); }
function affiliatePathScore(d) {
  if (d.affiliatePublisherSignal < 45) return d.affiliatePublisherSignal * 0.35 - d.spamComplianceRisk * 0.2;
  return d.affiliatePublisherSignal * 0.22 + d.publisherRevenuePain * 0.22 + d.publisherActionIntent * 0.2 + d.contentOpportunity * 0.17 + d.replyability * 0.14 + d.urgency * 0.05 - d.spamComplianceRisk * 0.22;
}
function consumerPathScore(d) {
  if (d.consumerRecommendationIntent < 38 && d.consumerComparisonIntent < 38) return Math.max(d.consumerRecommendationIntent, d.consumerComparisonIntent) * 0.45 - d.spamComplianceRisk * 0.2;
  return d.consumerRecommendationIntent * 0.25 + d.consumerComparisonIntent * 0.15 + d.consumerBudgetConstraint * 0.12 + d.consumerProductCategory * 0.14 + d.urgency * 0.08 + d.replyability * 0.18 + d.contentOpportunity * 0.08 - d.spamComplianceRisk * 0.22;
}
function inferOpportunityType(item, dimensions) {
  const d = dimensionMap(dimensions);
  const affiliatePath = affiliatePathScore(d);
  const consumerPath = consumerPathScore(d);
  const consumerRaw = Math.max(d.consumerRecommendationIntent, d.consumerComparisonIntent);
  if (hasSignal(item, 'consumer_buyer_question') && consumerRaw >= 40) return 'consumer_buyer_question';
  if (hasSignal(item, 'affiliate') && d.affiliatePublisherSignal >= 45) return 'affiliate_publisher_opportunity';
  if (consumerPath >= 45 && consumerPath >= affiliatePath) return 'consumer_buyer_question';
  if (affiliatePath >= 45 || d.affiliatePublisherSignal >= 65) return 'affiliate_publisher_opportunity';
  return 'low_fit_comment';
}
function weightedOverall(dimensions, opportunityType) {
  const d = dimensionMap(dimensions);
  const score = opportunityType === 'consumer_buyer_question' ? consumerPathScore(d) : opportunityType === 'affiliate_publisher_opportunity' ? affiliatePathScore(d) : Math.max(affiliatePathScore(d), consumerPathScore(d));
  return clamp(score);
}
function riskLevel(riskScore) { if (riskScore >= 70) return 'high'; if (riskScore >= 30) return 'medium'; return 'low'; }
function priority(overallScore, risk) { if (risk === 'high' || overallScore < 35) return 'low'; if (overallScore >= 82) return 'urgent'; if (overallScore >= 68) return 'high'; if (overallScore >= 45) return 'medium'; return 'low'; }
function recommendedAction(dimensions, risk, overallScore, opportunityType) {
  const d = dimensionMap(dimensions);
  if (risk === 'high' && d.replyability <= 20) return 'reject_as_spam';
  if (opportunityType === 'low_fit_comment') return risk === 'high' ? 'reject_as_spam' : 'ignore';
  if (risk === 'high') return d.replyability >= 35 ? 'reply' : 'reject_as_spam';
  if (overallScore < 35 && d.contentOpportunity < 60) return 'ignore';
  if (d.contentOpportunity >= 85 && d.replyability < 70) return 'save_content_idea';
  return 'reply';
}
function summary(item, dimensions, action, risk, opportunityType) {
  const d = dimensionMap(dimensions);
  if (action === 'reject_as_spam') return 'Spam or unsafe solicitation; reject rather than reply.';
  if (opportunityType === 'low_fit_comment') return 'Low-fit comment for the current opportunity queue.';
  if (opportunityType === 'consumer_buyer_question') {
    if (risk === 'medium' || risk === 'high') return 'Consumer product-decision question with compliance caution before replying.';
    if (d.consumerComparisonIntent >= 70) return 'Strong consumer buyer question: product comparison with a replyable decision framework.';
    if (d.consumerBudgetConstraint >= 65) return 'Strong consumer buyer question: recommendation intent plus a clear budget constraint.';
    if (d.consumerRecommendationIntent >= 75) return 'Consumer buyer question asking what to buy or whether a product is worth it.';
    return 'Consumer product-decision question for Steve to review.';
  }
  if (action === 'ignore') return 'Low-intent affiliate publisher comment with little lead or content value.';
  if (action === 'save_content_idea') return 'Strong affiliate content/tool idea, but not a direct reply lead.';
  if (risk === 'medium' || risk === 'high') return 'Affiliate publisher opportunity with trust/compliance caution before replying.';
  if (d.publisherRevenuePain >= 75 && d.publisherActionIntent >= 70) return 'Strong affiliate publisher opportunity: monetization pain plus a clear next-step question.';
  if (d.contentOpportunity >= 80) return 'Strong affiliate publisher content opportunity with a safe public reply path.';
  return 'Relevant affiliate publisher opportunity for Steve to review.';
}
function topEvidence(dimensions) {
  const evidence = [];
  for (const dimension of dimensions) for (const item of dimension.evidence) if (item && !evidence.includes(item)) evidence.push(item);
  return evidence.slice(0, 5);
}

export function scoreSampleItem(item, now = '2026-05-07T16:45:00.000Z') {
  const detectedOfferFit = detectOfferFit(item);
  const affiliate = scoreAffiliatePublisherSignal(item);
  const publisherRevenuePain = scorePublisherRevenuePain(item);
  const publisherActionIntent = scorePublisherActionIntent(item);
  const consumerRecommendationIntent = scoreConsumerRecommendationIntent(item);
  const consumerComparisonIntent = scoreConsumerComparisonIntent(item);
  const consumerBudgetConstraint = scoreConsumerBudgetConstraint(item);
  const consumerProductCategory = scoreConsumerProductCategory(item);
  const urgency = scoreUrgency(item);
  const contentOpportunity = scoreContentOpportunity(item);
  const risk = scoreSpamComplianceRisk(item);
  const consumerSignalForReplyability = Math.max(consumerRecommendationIntent.score, consumerComparisonIntent.score, consumerBudgetConstraint.score);
  const replyability = scoreReplyability(item, risk.score, affiliate.score, consumerSignalForReplyability);
  const dimensions = [
    affiliate,
    publisherRevenuePain,
    publisherActionIntent,
    consumerRecommendationIntent,
    consumerComparisonIntent,
    consumerBudgetConstraint,
    consumerProductCategory,
    urgency,
    contentOpportunity,
    replyability,
    risk,
  ];
  const opportunityType = inferOpportunityType(item, dimensions);
  const overallScore = weightedOverall(dimensions, opportunityType);
  const level = riskLevel(risk.score);
  const action = recommendedAction(dimensions, level, overallScore, opportunityType);
  return {
    id: `scored_${item.id}`,
    commentId: item.comment.id,
    opportunityType,
    opportunityTypeLabel: OPPORTUNITY_TYPE_LABELS[opportunityType],
    overallScore,
    priority: priority(overallScore, level),
    riskLevel: level,
    summary: summary(item, dimensions, action, level, opportunityType),
    recommendedAction: action,
    detectedOfferFit,
    evidenceSnippets: topEvidence(dimensions),
    scoreDimensions: dimensions,
    createdAt: now,
    updatedAt: now,
  };
}

export function scoreSampleItems(items, now) { return items.map((item) => scoreSampleItem(item, now)); }
export { DIMENSIONS, OPPORTUNITY_TYPE_LABELS };
