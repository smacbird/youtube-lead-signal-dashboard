// Niche-lead scoring for niche scans (imports that carry a profileId).
// Manual URL imports keep using src/scoring/scoring.js unchanged.
import { RISK_KEYWORDS } from '../../src/scoring/scoring.js';
import { resolveNicheProfile } from '../youtube/nicheProfiles.js';

export const NICHE_LEAD_TYPE_LABELS = {
  niche_lead: 'Niche lead',
  low_fit_comment: 'Low-fit comment',
};

export const LOW_FIT_REASONS = {
  self_promotion: 'Possible self-promotion or spam',
  links_only: 'Links only',
  channel_owner: "Comment from the video's own channel",
  video_housekeeping: 'About the video itself (title, link, audio), not a lead',
  praise_only: 'Praise or thanks only',
  greeting_only: 'Greeting only',
  too_short: 'Too short to judge',
  remote_job_request: 'Wants a work-from-home job, not an affiliate or business opportunity',
  generic_question: 'Question with no niche, cost, start or legitimacy signal',
  off_topic: 'Off-topic: no question, need or niche signal',
  no_conversion_pain: 'No personal affiliate sales or conversion problem stated',
};

// Positive signals. Each one counts once; weight is added to the lead score.
const POSITIVE_SIGNALS = [
  {
    key: 'startIntent',
    label: 'Wants to get started',
    phrase: 'wants to get started',
    weight: 24,
    patterns: [
      /\b(want|wanna|wanting|trying|try|looking|ready|planning|plan|hoping|thinking about|thinking of|need)\s+(to\s+)?(start|begin|get started|launch)\b/,
      /\bhow\s+(do|can|would|should)\s+(i|we|someone|a beginner|one)\s+(get\s+)?(start|begin|started)\b/,
      /\bhow\s+to\s+(get\s+)?(start|begin|started)\b/,
      /\bwhere\s+(do|should|can)\s+(i|we|a beginner)\s+(start|begin)\b/,
      /\b(get|getting)\s+started\b/,
      /\b(first|1st)\s+step\b/,
      /\bjust\s+(starting|started|beginning)\b/,
      /\bstart(ing)?\s+(my|a|an|our)\s+(own\s+)?(online\s+|home\s+|small\s+)?(business|side hustle|blog|website|channel|store|shop)\b/,
      /\b(i'?m|i am)\s+(new|a (complete|total) beginner)\b/,
      /\bnew\s+(to\s+(this|it|the\s+\w+)|and\s+(want\s+to\s+)?get\s+into\s+it)\b/,
      /\b(just\s+)?getting\s+into\b/,
      /\b(complete\s+beginner|zero\s+experience)\b/,
      /\bbefore\s+(?:the\s+)?(?:holidays?|christmas|thanksgiving|black\s+friday|new\s+year|\w+\s+\d{1,2})\s+i\s+(want|need|plan)\s+to\s+(start|begin|get\s+into)\b/,
    ],
  },
  {
    key: 'costTime',
    label: 'Asks about cost or time',
    phrase: 'asks about cost or time needed',
    weight: 18,
    patterns: [
      /\bhow\s+much\b/,
      /\b(start-?up|starting|upfront|up front)\s+(cost|costs|fee|fees|money|capital|investment)\b/,
      /\bcost(s)?\s+to\s+(start|join|begin)\b/,
      /\bwhat\s+(does|do)\s+it\s+cost\b/,
      /\bhow\s+(long|many hours)\b/,
      /\b(hours|time)\s+(a|per)\s+(day|week)\b/,
      /\btime\s+(commitment|needed|required|it takes)\b/,
      /\b(can|could)\s+i\s+afford\b/,
      /\b(monthly|membership|sign-?up)\s+fee\b/,
      /\bis\s+it\s+(free|expensive)\b/,
    ],
  },
  {
    key: 'legitimacy',
    label: 'Questions legitimacy',
    phrase: 'asks whether it is legit or worth it',
    weight: 20,
    patterns: [
      /\blegit(imate)?\b/,
      /\bscam(s|my)?\b/,
      /\bis\s+(this|it|that)\s+(real|for real|true|safe)\b/,
      /\bworth\s+(it|the|my)\b/,
      /\b(actually|really|still)\s+work(s)?\b/,
      /\bdoes\s+(this|it|that)\s+(really\s+|actually\s+)?work\b/,
      /\bpyramid\s+scheme\b/,
      /\bmlm\b/,
      /\btoo\s+good\s+to\s+be\s+true\b/,
      /\bcan\s+i\s+trust\b/,
    ],
  },
  {
    key: 'situation',
    label: 'Describes their situation',
    phrase: 'describes their situation',
    weight: 18,
    patterns: [
      /\bi\s+(have|got)\s+no\s+[a-z]+(\s+[a-z]+)?/,
      /\bi\s+(don'?t|do not|dont)\s+have\s+(a|any|much)\s+[a-z]+/,
      // Describes an asset they already run (audience/list/page/channel): concrete reply context.
      /\bi\s+(have|run|built|got|started|manage)\s+(a|an|my|some|small|new|tiny|growing|little|about|around|over|only|just|\d[\d,]*)\s+([a-z0-9-]+\s+){0,3}?(audience|following|email list|list|subscribers?|blog|channel|website|store|shop|page)\b/,
      /\bno\s+(experience|website|money|budget|skills|audience|followers|degree|capital|savings)\b/,
      /\bzero\s+experience\b/,
      /\bnew\s+to\s+(this|it|\w+)\b/,
      /\bstay[- ]at[- ]home\s+(mom|mum|dad|parent|mother|father)\b/,
      /\b(single|working)\s+(mom|mum|dad|parent|mother)\b/,
      /\bsahm\b/,
      /\bi'?m\s+(\d{2})\b/,
      /\bi\s+am\s+(\d{2})\b/,
      /\b(\d{2})\s+(years|yrs)\s+old\b/,
      /\b(i'?m|i am)\s+(retired|disabled|unemployed|a student|a beginner|new|broke|a newbie|a complete beginner|a total beginner)\b/,
      /\b(laid off|lost my job|between jobs|on disability)\b/,
      /\b(full[- ]time job|9\s?(to|-)\s?5)\b/,
      /\bcomplete\s+(beginner|newbie)\b/,
    ],
  },
  {
    key: 'resourceAsk',
    label: 'Asks for a recommendation or next step',
    phrase: 'asks for a recommendation, tool or next step',
    weight: 20,
    patterns: [
      /\brecommend(ation|ations|ed)?\b/,
      /\bsuggest(ion|ions)?\b/,
      /\bwhich\s+(tool|platform|course|program|software|app|site|website|one|company|niche|business)\b/,
      /\bwhat\s+(tool|platform|course|program|software|app|site|website|niche|business)\b/,
      /\bbest\s+(tool|way|platform|course|program|software|app|place|option)\b/,
      /\bany\s+(tips|advice|ideas|resources|recommendations|suggestions)\b/,
      /\bwhere\s+(can|do|should)\s+i\s+(find|learn|sign up|go|get)\b/,
      /\bwhat\s+should\s+i\s+do\b/,
      /\bnext\s+step\b/,
      /\b(can|could)\s+(you|someone|anyone)\s+(help|guide|point|explain|show)\b/,
      /\b(need|want)\s+(help|advice|guidance|a mentor)\b/,
      /\bwhat\s+would\s+you\s+(do|suggest)\b/,
      // Concrete next-step asks: "what should I send/change after they opt in?"
      /\bwhat\s+(should|do|can)\s+i\s+(send|write|post|say|change|fix|improve|do|try|use|include|focus on)\b/,
      // "which affiliate offer/program/tool..." with an adjective between (which + <words> + noun).
      /\bwhich\s+([a-z0-9-]+\s+){0,2}(offer|program|tool|platform|product|niche|course|service|software|app|funnel|autoresponder|affiliate)\b/,
    ],
  },
];

const CREATOR_VIDEO_REQUEST = /\b(?:can\s+you|could\s+you|would\s+you|please|do|make|create|post)\b.{0,45}\b(?:make|create|do|post)?\s*(?:a|another|more)?\s*(?:video|tutorial|walkthrough)\b(?:\s+(?:on|about|for))?/;

// Only flag genuinely different BUSINESS MODELS, not sibling affiliate sub-topics
// (funnels, email, offers, training all share the same affiliate business). The
// "Compare Online Businesses" profile is where FBA/dropshipping are on-topic.
function differentBusiness(profileId, text) {
  if (profileId === 'biz_opp') return null;
  if (/\b(?:amazon\s+fba|fba\s+inventory|fba)\b/.test(text)) return 'FBA';
  if (/\bdropship(?:ping)?\b/.test(text)) return 'dropshipping';
  return null;
}

// People asking for a remote JOB (hiring, apply, resume) are not affiliate/business
// prospects. Scoped to employment language so "I want to start a home business" is unaffected.
const REMOTE_JOB_REQUEST = /\b(are you hiring|is this (a |an )?(real )?job|i (just )?need a job|looking for (a |work[- ]from[- ]home )job|need a remote job|work[- ]from[- ]home job|remote job|any jobs\b|job opening|positions? available|hiring remote|send (you )?my (resume|cv)|hire me|apply for (this |a |the )?(job|position|role|opening)|how (do|can) i apply for)\b/;

// Clicks but No Sales needs evidence from the COMMENT, not an affiliate video.
// A personal marker plus a concrete conversion failure is required. Topic-only
// questions, no-click acquisition, praise and promo cannot become leads here.
const PERSONAL_EXPERIENCE = /\b(?:my|our)\b|\b(?:i|we)\s+(?:have|had|got|get|keep|kept|am|are|run|built|sent|drove|see|saw|spent)\b/;
const PAST_ONLY = /\b(?:i once|used to|back in 20\d{2}|years? ago|before i fixed|then (?:i )?fixed)\b/i;
const CURRENT_AGAIN = /\b(?:still|again|currently|right now|now getting)\b/i;
const NO_CLICKS_OR_TRAFFIC = /\b(?:no|zero|not getting|can'?t get|cannot get)\s+(?:affiliate\s+|link\s+)?clicks?\b|\b(?:no|zero|not getting)\s+traffic\b/;
const CONVERSION_PAIN_PATTERNS = [
  /\b(?:clicks?|traffic)\b.{0,65}\b(?:no|zero|0)\s+(?:affiliate\s+)?(?:sales|commissions?|conversions?|buyers?|purchases?)\b/,
  /\b(?:no|zero|0)\s+(?:affiliate\s+)?(?:sales|commissions?|conversions?|buyers?)\b.{0,65}\b(?:clicks?|traffic)\b/,
  /\b(?:affiliate\s+)?links?\b.{0,85}\b(?:not converting|not convert|don'?t convert|doesn'?t convert|aren'?t converting)\b/,
  /\b(?:affiliate\s+)?(?:funnel|opt[- ]?ins?|signups?|subscribers?|offer|landing page)\b.{0,90}\b(?:nobody|no one)\s+(?:buys|is buying|purchases|converts)\b/,
  /\b(?:affiliate\s+)?(?:funnel|offer)\b.{0,90}\b(?:no|zero)\s+(?:sales|commissions?|buyers?)\b/,
  /\b(?:clicks?|traffic)\b.{0,60}\b(?:low|poor|bad)\s+conversion(?:\s+rate)?\b/,
  /\b(?:low|poor|bad)\s+conversion(?:\s+rate)?\b.{0,60}\b(?:clicks?|traffic)\b/,
  /\b(?:clicks?|traffic)\b.{0,60}\bconversion(?:\s+rate)?\s+(?:is|are)\s+(?:low|poor|bad)\b/,
  /\b(?:affiliate\s+)?(?:clicks?|traffic)\b.{0,60}\bconvert(?:s|ing)?\s+poorly\b/,
  /\btraffic\b.{0,60}\b(?:nobody|no one)\s+(?:buys|converts)\b/,
];

function personalConversionPain(text) {
  if (!PERSONAL_EXPERIENCE.test(text) || NO_CLICKS_OR_TRAFFIC.test(text)
    || (PAST_ONLY.test(text) && !CURRENT_AGAIN.test(text))) return null;
  return firstMatch(text, CONVERSION_PAIN_PATTERNS);
}

const QUESTION_START = /^(how|what|where|which|who|why|when|is|are|can|could|does|do|did|should|would|will|anyone|any)\b/;

const SELF_PROMO_PATTERNS = [
  /https?:\/\//, /\bwww\./, /\b[a-z0-9-]+\.(com|net|org|io|co|ly|me|biz|info)\b/, /\bt\.me\//, /\bwa\.me\//,
  /\bwhats\s?app\b/, /\btelegram\b/, /\b(dm|inbox|message|text|contact|email|reach out to|reach)\s+(me|him|her)\b/,
  /\bcheck\s+(out\s+)?my\s+(channel|video|videos|page|profile|link|bio|website|site|course)\b/,
  /\b(subscribe|sub)\s+to\s+(me|my)\b/, /\bvisit\s+my\b/, /\bjoin\s+my\b/, /\bmy\s+(link|course|program)\s+(is\s+)?(in|below|on)\b/,
  /\bsign\s+up\s+(with|using|through|under)\s+my\b/, /\+?\d[\d\s().-]{9,}\d/,
  /\bthanks\s+to\s+(mr|mrs|ms|miss|dr)\.?\s+[a-z]+/, /\b(mr|mrs|ms|dr)\.?\s+[a-z]+\s+(has|helped|changed|made)\b/,
  /\bi\s+(made|earn|earned|make)\s+\$\s?[1-9][\d,]*k?\s+(a|per|every|in|this)\s+(day|week|month|weeks|days)\b/,
  /\b(earn|make)\s+\$\s?[1-9][\d,]*k?\s+(a|per|every)\s+(day|week)\b/,
];

const PRAISE_PATTERNS = [
  /\b(thank\s*(you|u)|thanks|thx|thnx|thanx|tysm|ty)\b/, /\bgreat\s+(video|content|info|job|work|advice|tips|explanation)\b/,
  /\b(awesome|amazing|excellent|fantastic|brilliant|wonderful|superb|incredible)\b/, /\blove\s+(this|it|you|your|the)\b/,
  /\b(very|so|really|super)\s+(helpful|informative|useful|inspiring)\b/, /\b(helpful|informative|inspiring|well explained)\b/,
  /\b(nice|good)\s+(video|one|content|job|work|info)\b/, /\bgod\s+bless\b/, /\bsubscribed\b/, /\bkeep\s+(it\s+up|going|up the)\b/,
  /\bappreciate\b/, /\bgreat\b/, /\bnice\b/,
];

const GREETING_ONLY = /^(hi+|hello+|hey+|yo|hola|first|early|good\s+(morning|evening|afternoon)|greetings|watching from [a-z ]+|who'?s\s+(here|watching)[a-z0-9 ]*)[\s!.,a-z]{0,20}$/;

const HOUSEKEEPING_PATTERNS = [
  /\bwrong\s+title\b/, /\btitle\s+(is|was)\s+(wrong|misleading)\b/, /\bclick\s?bait\b/,
  /\b(can'?t|cannot|couldn'?t|cant)\s+find\s+(the|your)\s+link\b/, /\bwhere('?s|\s+is)\s+the\s+link\b/,
  /\blink\s+(is\s+)?(broken|dead|not working|doesn'?t work|does not work)\b/,
  /\b(audio|sound|volume|mic|music|background music)\s+(is\s+)?(too|so|bad|low|loud|terrible)\b/,
  /\b(subtitles|captions|timestamps?)\b/, /\bvideo\s+(is\s+)?too\s+long\b/, /\bskip\s+to\b/,
  /\bwhat\s+(mic|microphone|camera|lens|lighting|lights|editing software|editor|background|shirt)\s+(are|do|did|is)\b/,
  /\b(your|the)\s+(mic|microphone|camera|lighting|thumbnail|intro|outro)\b/,
];

const JOKE_PATTERNS = [/\b(lol|lmao|lmfao|rofl|haha+|hehe+)\b/, /[\u{1F602}\u{1F923}]/u];

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function phraseRegex(phrase) {
  const p = phrase.toLowerCase();
  const start = /^[a-z0-9]/.test(p) ? '\\b' : '';
  const end = /[a-z0-9]$/.test(p) ? '\\b' : '';
  return new RegExp(`${start}${escapeRegex(p).replace(/\s+/g, '\\s+')}${end}`);
}
const RISK_REGEXES = RISK_KEYWORDS.map((keyword) => ({ keyword, regex: phraseRegex(keyword) }));

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}
function anyMatch(text, patterns) { return patterns.some((pattern) => pattern.test(text)); }
function wordCount(text) { return (text.match(/[a-z0-9'$]+/gi) || []).length; }
function clamp(value) { return Math.max(0, Math.min(100, Math.round(value))); }
function capitalize(text) { return text ? text[0].toUpperCase() + text.slice(1) : text; }
function snippetFrom(original, lowerMatch) {
  const index = original.toLowerCase().indexOf(lowerMatch);
  if (index === -1) return lowerMatch;
  return original.slice(index, Math.min(original.length, index + Math.max(lowerMatch.length, 80))).trim();
}

export function nicheKeywordMatches(profileId, text = '') {
  const profile = resolveNicheProfile(profileId);
  const lower = String(text || '').toLowerCase();
  return (profile.keywords || []).filter((keyword) => phraseRegex(keyword).test(lower));
}

function priorityFor(score, risk) {
  if (risk === 'high') return 'low';
  if (score >= 82) return 'urgent';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Score one YouTube comment for a niche scan.
 * @param {{ text: string, profileId: string, authorDisplayName?: string, isChannelOwner?: boolean, likeCount?: number, replyCount?: number }} input
 */
export function scoreNicheLead({ text = '', profileId, authorDisplayName = '', isChannelOwner = false, likeCount = 0, replyCount = 0 } = {}) {
  const profile = resolveNicheProfile(profileId);
  const original = String(text || '').trim();
  const lower = original.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const words = wordCount(lower);
  const withoutLinks = lower.replace(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(com|net|org|io|co|ly|me|biz|info)\S*/g, '').replace(/[^a-z0-9]+/g, '');
  const hasQuestion = lower.includes('?') || QUESTION_START.test(lower);
  const conversionMatch = profileId === 'clicks_no_sales' ? personalConversionPain(lower) : null;

  const signals = [];
  for (const signal of POSITIVE_SIGNALS) {
    const match = firstMatch(lower, signal.patterns);
    if (!match) continue;
    // Situation details are the most useful reply context, so keep up to three distinct ones.
    const details = signal.key === 'situation'
      ? [...new Set(signal.patterns.map((pattern) => lower.match(pattern)?.[0]?.trim()).filter(Boolean))]
          .filter((value, _i, all) => !all.some((other) => other !== value && other.includes(value)))
          .slice(0, 3)
      : [match];
    signals.push({ ...signal, match, details });
  }
  const intentSum = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const nicheMatched = nicheKeywordMatches(profileId, lower);
  const nicheBoost = Math.min(3, nicheMatched.length) * 8;
  const creatorVideoRequest = CREATOR_VIDEO_REQUEST.test(lower);
  const otherBusiness = differentBusiness(profileId, lower);
  const remoteJobMatch = firstMatch(lower, [REMOTE_JOB_REQUEST]);

  const riskMatches = RISK_REGEXES.filter(({ regex }) => regex.test(`${String(authorDisplayName).toLowerCase()} ${lower}`)).map(({ keyword }) => keyword);
  const selfPromoMatch = firstMatch(lower, SELF_PROMO_PATTERNS);
  const linksOnly = Boolean(original) && !withoutLinks && /https?:\/\/|www\.|\.[a-z]{2,4}\b/.test(lower);
  const isPraise = anyMatch(lower, PRAISE_PATTERNS);
  const isGreeting = words <= 4 && GREETING_ONLY.test(lower.replace(/[^a-z0-9'\s!.,]/g, '').trim());
  const housekeepingMatch = firstMatch(lower, HOUSEKEEPING_PATTERNS);
  const isJoke = anyMatch(lower, JOKE_PATTERNS);

  let positive = intentSum + nicheBoost + (hasQuestion ? 18 : 0);
  if (conversionMatch) positive += 38;
  if (words >= 12) positive += 4;
  if (words < 3) positive -= 8;

  // Decide low-fit reason first (most specific wins), then lead vs low fit.
  let lowFitReason = null;
  let lowFitDetail = '';
  if (linksOnly) lowFitReason = 'links_only';
  else if (selfPromoMatch) { lowFitReason = 'self_promotion'; lowFitDetail = selfPromoMatch; }
  else if (isChannelOwner) lowFitReason = 'channel_owner';
  else if (housekeepingMatch && intentSum < 24) { lowFitReason = 'video_housekeeping'; lowFitDetail = housekeepingMatch; }
  // A job seeker ("start a remote job, where do I apply?") can carry start-intent, so gate
  // on the absence of any business/niche keyword rather than on intent strength.
  else if (remoteJobMatch && !nicheMatched.length) { lowFitReason = 'remote_job_request'; lowFitDetail = remoteJobMatch; }
  else if (isGreeting && !intentSum) lowFitReason = 'greeting_only';
  else if (isPraise && !intentSum && !hasQuestion && !conversionMatch) lowFitReason = 'praise_only';
  else if (words < 3 && !intentSum) lowFitReason = 'too_short';
  else if (profileId === 'clicks_no_sales' && isJoke && !conversionMatch) { lowFitReason = 'off_topic'; lowFitDetail = 'joke'; }
  else if (profileId === 'clicks_no_sales' && !conversionMatch) lowFitReason = 'no_conversion_pain';
  else {
    const qualifies = Boolean(conversionMatch) || (intentSum >= 24 && positive >= 24) || (intentSum >= 18 && positive >= 30)
      || (hasQuestion && nicheMatched.length >= 1 && positive >= 26);
    if (!qualifies) {
      if (words < 4 && !hasQuestion) lowFitReason = 'too_short';
      else if (hasQuestion) lowFitReason = 'generic_question';
      else lowFitReason = 'off_topic';
      if (isJoke) lowFitDetail = 'joke';
    }
  }

  const isSpam = lowFitReason === 'self_promotion' || lowFitReason === 'links_only';
  let riskScore = riskMatches.length ? Math.min(65, 20 + riskMatches.length * 15) : 0;
  if (isSpam) riskScore = Math.max(riskScore, 85);
  const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
  const engagement = (likeCount >= 5 ? 3 : 0) + (replyCount >= 2 ? 3 : 0);

  // A specific request for more videos is a content idea, not a strong reply lead.
  if (creatorVideoRequest && ['generic_question', 'off_topic', 'too_short'].includes(lowFitReason)) lowFitReason = null;
  const opportunityType = lowFitReason ? 'low_fit_comment' : 'niche_lead';
  let overallScore;
  if (opportunityType === 'niche_lead') {
    overallScore = clamp(28 + positive + engagement - Math.min(16, riskMatches.length * 8));
    if (creatorVideoRequest) overallScore = Math.max(45, Math.min(overallScore, 54));
    else if (otherBusiness) overallScore = Math.min(overallScore, 54);
  } else if (isSpam) {
    overallScore = 0;
  } else {
    overallScore = clamp(Math.min(34, Math.max(0, positive) * 0.5));
  }

  const leadFit = opportunityType === 'niche_lead'
    ? (!creatorVideoRequest && !otherBusiness && riskLevel !== 'high' && overallScore >= 68
      && (hasQuestion || (signals.some((signal) => signal.key === 'startIntent') && nicheMatched.length > 0)) ? 'best' : 'maybe')
    : null;

  // Evidence and human-readable reason.
  const evidenceSnippets = [];
  for (const signal of signals) evidenceSnippets.push(snippetFrom(original, signal.match));
  if (conversionMatch) evidenceSnippets.unshift(snippetFrom(original, conversionMatch));
  if (creatorVideoRequest) evidenceSnippets.push(snippetFrom(original, lower.match(CREATOR_VIDEO_REQUEST)?.[0] || 'video'));
  if (otherBusiness) evidenceSnippets.push(`Different business: ${otherBusiness}`);
  if (nicheMatched.length) evidenceSnippets.push(`Niche match: ${nicheMatched.slice(0, 4).join(', ')}`);
  if (riskMatches.length) evidenceSnippets.push(`Risk phrase: ${riskMatches.slice(0, 3).join(', ')}`);
  if (lowFitDetail && lowFitReason === 'self_promotion') evidenceSnippets.push(`Promo cue: ${lowFitDetail}`);
  const uniqueEvidence = [...new Set(evidenceSnippets.filter(Boolean))].slice(0, 5);

  let summary;
  if (opportunityType === 'niche_lead') {
    const quoted = (signal) => signal.details.map((d) => `"${d}"`).join(', ');
    const parts = signals.map((signal) => (signal.key === 'situation' ? `${signal.phrase}: ${quoted(signal)}` : signal.phrase));
    const start = signals.find((s) => s.key === 'startIntent');
    const situation = signals.find((s) => s.key === 'situation');
    let headline;
    if (start && situation) {
      headline = `Asks how to start; situation: ${quoted(situation)}`;
      const rest = signals.filter((s) => s !== start && s !== situation).map((s) => s.phrase);
      if (rest.length) headline += `; also ${rest.join('; ')}`;
    } else if (parts.length) {
      headline = capitalize(parts.join('; '));
    } else {
      headline = `Asks a ${profile.label.toLowerCase()} question`;
    }
    if (conversionMatch) headline = `Personal conversion blocker: "${conversionMatch}"${parts.length ? `; ${parts.join('; ')}` : ''}`;
    summary = creatorVideoRequest ? 'Asks the creator for a video; useful as a content idea, not a direct reply lead.'
      : otherBusiness ? `About a different business (${otherBusiness}); ${headline.toLowerCase()}. Check fit before replying.`
      : `${headline}.`;
    if (!creatorVideoRequest && !otherBusiness && nicheMatched.length) summary += ` Niche match: ${nicheMatched.slice(0, 3).join(', ')}.`;
    if (leadFit === 'maybe' && !creatorVideoRequest && !otherBusiness) summary += ' Some interest, but not a clear next-step request yet.';
    if (riskMatches.length) summary += ` Caution: mentions "${riskMatches.slice(0, 2).join('", "')}"; reply conservatively.`;
  } else {
    const base = LOW_FIT_REASONS[lowFitReason];
    if (lowFitReason === 'self_promotion') summary = `${base} ("${lowFitDetail}").`;
    else if (lowFitReason === 'video_housekeeping') summary = `${base}: "${lowFitDetail}".`;
    else if (lowFitReason === 'too_short') summary = `${base} (${words} word${words === 1 ? '' : 's'}).`;
    else if (lowFitReason === 'praise_only') summary = 'Praise or thanks only; no question or lead signal.';
    else if (lowFitReason === 'off_topic' && lowFitDetail === 'joke') summary = 'Off-topic joke or banter; no lead signal.';
    else summary = `${base}.`;
  }

  let recommendedAction;
  if (isSpam) recommendedAction = 'reject_as_spam';
  else if (opportunityType === 'low_fit_comment') recommendedAction = 'ignore';
  else recommendedAction = creatorVideoRequest ? 'save_content_idea' : leadFit === 'maybe' ? 'research_author' : 'reply';

  const signalScore = (key) => (signals.some((s) => s.key === key) ? 80 : 0);
  const scoreDimensions = [
    { dimension: 'nicheStartIntent', score: signalScore('startIntent'), reason: signalScore('startIntent') ? 'Wants to start or get started.' : 'No start intent stated.', evidence: signals.filter((s) => s.key === 'startIntent').map((s) => snippetFrom(original, s.match)) },
    { dimension: 'nicheCostTime', score: signalScore('costTime'), reason: signalScore('costTime') ? 'Asks about cost, startup cost or time needed.' : 'No cost or time question.', evidence: signals.filter((s) => s.key === 'costTime').map((s) => snippetFrom(original, s.match)) },
    { dimension: 'nicheLegitimacy', score: signalScore('legitimacy'), reason: signalScore('legitimacy') ? 'Weighing whether it is legit, a scam or worth it.' : 'No legitimacy concern.', evidence: signals.filter((s) => s.key === 'legitimacy').map((s) => snippetFrom(original, s.match)) },
    { dimension: 'nicheSituation', score: signalScore('situation'), reason: signalScore('situation') ? 'Describes their own situation, which makes a tailored reply possible.' : 'No personal situation described.', evidence: signals.filter((s) => s.key === 'situation').flatMap((s) => s.details) },
    { dimension: 'nicheResourceAsk', score: signalScore('resourceAsk'), reason: signalScore('resourceAsk') ? 'Asks for a recommendation, tool, resource or next step.' : 'No recommendation request.', evidence: signals.filter((s) => s.key === 'resourceAsk').map((s) => snippetFrom(original, s.match)) },
    { dimension: 'nicheQuestion', score: hasQuestion ? 70 : 0, reason: hasQuestion ? 'Phrased as a question.' : 'Not a question.', evidence: [] },
    { dimension: 'nicheKeywordFit', score: clamp(nicheMatched.length * 34), reason: nicheMatched.length ? `Matches ${profile.label} keywords.` : `No ${profile.label} keywords in the comment.`, evidence: nicheMatched.slice(0, 4) },
    { dimension: 'noiseSignal', score: lowFitReason ? 100 : 0, reason: lowFitReason ? LOW_FIT_REASONS[lowFitReason] : 'No noise pattern detected.', evidence: lowFitDetail && lowFitDetail !== 'joke' ? [lowFitDetail] : [] },
    { dimension: 'spamComplianceRisk', score: riskScore, reason: riskLevel === 'high' ? 'High risk: likely spam or self-promotion.' : riskLevel === 'medium' ? 'Risk phrase present; use conservative wording.' : 'No major spam or compliance red flags detected.', evidence: riskMatches.slice(0, 4) },
  ];

  if (profileId === 'clicks_no_sales') scoreDimensions.push({
    dimension: 'nicheConversionPain', score: conversionMatch ? 80 : 0,
    reason: conversionMatch ? 'Personal sales or conversion problem stated in the comment.' : 'No personal sales or conversion problem stated.',
    evidence: conversionMatch ? [snippetFrom(original, conversionMatch)] : [],
  });

  return {
    opportunityType,
    opportunityTypeLabel: NICHE_LEAD_TYPE_LABELS[opportunityType],
    leadFit,
    overallScore,
    priority: priorityFor(overallScore, riskLevel),
    riskLevel,
    recommendedAction,
    summary,
    lowFitReason,
    evidenceSnippets: uniqueEvidence,
    detectedOfferFit: opportunityType === 'niche_lead' ? [profile.leadCategory] : [],
    scoreDimensions,
    nicheMatchedKeywords: nicheMatched,
    nicheScoreBoost: nicheBoost,
    nicheSignals: [...signals.map((signal) => signal.key), ...(conversionMatch ? ['conversionPain'] : [])],
  };
}
