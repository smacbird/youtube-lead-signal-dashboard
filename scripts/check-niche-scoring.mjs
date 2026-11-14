// Niche-lead scoring, candidate video ranking and niche-import checks.
// Offline only: no YouTube, OpenAI or network calls (mock clients throughout).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scoreNicheLead, LOW_FIT_REASONS } from '../server/scoring/nicheLead.js';
import { leadBucket } from '../src/scoring/leadBuckets.js';
import { NICHE_PROFILES, LEGACY_PROFILE_ALIASES, resolveNicheProfile, listNicheProfiles } from '../server/youtube/nicheProfiles.js';
import { candidateTarget, clicksNoSalesFit, rankCandidateVideos, selectNicheVideos } from '../server/youtube/videoRanking.js';
import { importYouTubeVideos } from '../server/import/importService.js';
import { JsonImportStore } from '../server/persistence/store.js';

const GENERIC_SUMMARIES = [/low-intent affiliate publisher/i, /^low-fit comment for the current/i];

function check(profileId, text, expect) {
  const r = scoreNicheLead({ text, profileId, ...(expect.input || {}) });
  const label = `[${profileId}] "${text}"`;
  assert.equal(r.opportunityType, expect.type, `${label} -> ${r.opportunityType} (${r.summary})`);
  assert.ok(r.overallScore >= 0 && r.overallScore <= 100, `${label} score in range`);
  assert.ok(['low', 'medium', 'high', 'urgent'].includes(r.priority), `${label} priority`);
  assert.ok(r.summary && r.summary.length > 8, `${label} has a summary`);
  for (const generic of GENERIC_SUMMARIES) assert.ok(!generic.test(r.summary), `${label} summary is specific, got "${r.summary}"`);
  if (expect.type === 'low_fit_comment') {
    assert.ok(LOW_FIT_REASONS[r.lowFitReason], `${label} has a known lowFitReason, got ${r.lowFitReason}`);
    if (expect.reason) assert.equal(r.lowFitReason, expect.reason, `${label} lowFitReason (${r.summary})`);
    assert.ok(r.overallScore < 40, `${label} low-fit score stays low (${r.overallScore})`);
    assert.notEqual(r.recommendedAction, 'reply', `${label} low fit is not a reply`);
  } else {
    assert.equal(r.lowFitReason, null, `${label} lead has no lowFitReason`);
    assert.ok(r.overallScore >= 45, `${label} lead score >= 45 (${r.overallScore})`);
    assert.ok(r.evidenceSnippets.length > 0, `${label} lead has evidence`);
  }
  if (expect.summary) assert.match(r.summary, expect.summary, `${label} summary "${r.summary}"`);
  if (expect.risk) assert.equal(r.riskLevel, expect.risk, `${label} risk`);
  if (expect.action) assert.equal(r.recommendedAction, expect.action, `${label} action`);
  return r;
}

const LEAD = 'niche_lead';
const LOW = 'low_fit_comment';

// Noise that should be low fit in every niche, with a specific reason.
const UNIVERSAL_NOISE = [
  ['Thnx for help', 'praise_only', /praise or thanks only/i],
  ['Great video, very helpful! Thank you so much', 'praise_only', /praise/i],
  ['God bless you brother, keep it up', 'praise_only', /praise/i],
  ['Wrong title', 'video_housekeeping', /wrong title/i],
  ["I can't find the link", 'video_housekeeping', /find the link/i],
  ['Hi', 'greeting_only', /greeting/i],
  ['First!', 'greeting_only', /greeting/i],
  ['lol my cat does the same thing when I work', 'off_topic', /off-topic/i],
  ['ok', 'too_short', /too short/i],
  ['https://bit.ly/3xYzAbC', 'links_only', /links only/i],
  ['I made $5,000 a week thanks to Mrs Linda Carter, message her on WhatsApp +1 555 210 9876', 'self_promotion', /self-promotion/i],
  ['Check out my channel for the real method, sub to me!', 'self_promotion', /self-promotion/i],
  ['What mic are you using?', 'video_housekeeping', /mic/i],
];

// One representative lead per new profile (comment evidence of real intent, not just a
// topic match): a personal situation, concrete blocker, cost/time, legitimacy or a
// next-step/resource ask, paired with the profile's own keywords.
const NICHE_LEADS = {
  clicks_no_sales: [
    ['I keep getting clicks but no sales. Any tips on what to fix first?', /recommendation|tips/i],
    ['My affiliate links get clicks but are not converting. How long before sales usually start?', /cost or time/i],
  ],
  traffic_leads: [
    ['How do I get my first leads with no website and no budget for ads?', /start|situation|leads/i],
    ['What landing page tool would you recommend to turn traffic into leads?', /recommendation/i],
  ],
  affiliate_funnels: [
    ['How do I start building a sales funnel with an opt-in page as a beginner?', /start|beginner/i],
    ['What lead magnet works best for an affiliate opt-in funnel? Any suggestions?', /recommendation/i],
  ],
  email_follow_up: [
    ['Which autoresponder do you recommend for affiliate email follow up?', /recommendation/i],
    ['I have no email list yet. How do I start a welcome email sequence for affiliate offers?', /start|situation/i],
  ],
  organic_traffic: [
    ['How long does it take to rank on Google with a new blog for organic traffic?', /cost or time/i],
    ["I'm a complete beginner with no backlinks. Where should I start with SEO?", /start/i],
  ],
  choosing_offers: [
    ['Which affiliate program do you recommend for beginners?', /recommendation/i],
    ['Should I promote high ticket or low ticket offers when I am just starting out?', /start/i],
  ],
  training_reviews: [
    ['Is this affiliate marketing course worth it or is it a scam?', /legit or worth it/i],
    ['How much does this training program cost and is it legit for beginners?', /cost|legit/i],
  ],
  affiliate_marketing: [
    ['How do I start affiliate marketing with no website and no money?', /start/i],
    ['Is Amazon associates worth it for a beginner or should I try clickbank?', /legit or worth it/i],
    ['What tool do you recommend for tracking affiliate link clicks?', /recommendation/i],
  ],
  ai_tools: [
    ['Which AI tool do you recommend for writing marketing content? Is it free?', /recommendation|cost/i],
    ['I have no tech skills. How do I start using ChatGPT for my marketing workflow?', /start|situation/i],
  ],
  biz_opp: [
    ['Affiliate marketing vs dropshipping — which business model is better for a beginner?', /recommendation/i],
    ['What is the best online business model to start with low startup cost?', /cost/i],
  ],
  work_from_home: [
    ["I'm a stay at home mom with no experience. How do I get started with a home based business?", /start.*stay at home mom|stay at home mom/i],
    ['Is this home based business legit? What are the startup costs?', /cost|legit/i],
  ],
  side_hustles: [
    ['Which side hustle would you recommend for someone with no skills and $100?', /recommendation/i],
    ['I lost my job and I am 52. What is a realistic way to make money online as a beginner?', /situation/i],
  ],
};

let checked = 0;
for (const profileId of Object.keys(NICHE_PROFILES)) {
  for (const [text, reason, summary] of UNIVERSAL_NOISE) {
    check(profileId, text, { type: LOW, reason, summary });
    checked += 1;
  }
  assert.ok(NICHE_LEADS[profileId], `${profileId} has lead fixtures`);
  for (const [text, summary] of NICHE_LEADS[profileId]) {
    check(profileId, text, { type: LEAD, summary });
    checked += 1;
  }
}

// Approved lineup: exact order, exact labels and the two groups the API/UI render.
const EXPECTED_LINEUP = [
  ['clicks_no_sales', 'main', 'Clicks but No Sales'],
  ['traffic_leads', 'main', 'Getting Traffic & Leads'],
  ['affiliate_funnels', 'main', 'Affiliate Funnels & Opt-Ins'],
  ['email_follow_up', 'main', 'Email Follow-Up'],
  ['organic_traffic', 'main', 'Organic Traffic'],
  ['choosing_offers', 'main', 'Choosing Affiliate Offers'],
  ['training_reviews', 'main', 'Affiliate Training Reviews'],
  ['affiliate_marketing', 'main', 'Affiliate Marketing'],
  ['ai_tools', 'explore', 'AI Tools for Marketing'],
  ['biz_opp', 'explore', 'Compare Online Businesses'],
  ['work_from_home', 'explore', 'Home-Based Business'],
  ['side_hustles', 'explore', 'Side Hustles & Online Income'],
];
const lineup = listNicheProfiles();
assert.equal(lineup.length, 12, 'exactly 12 profiles');
assert.deepEqual(lineup.map((p) => [p.id, p.group, p.label]), EXPECTED_LINEUP, 'API order, groups and labels match the approved lineup');
assert.deepEqual(lineup.filter((p) => p.group === 'main').map((p) => p.id), EXPECTED_LINEUP.filter(([, g]) => g === 'main').map(([id]) => id), 'eight main cards');
assert.deepEqual(lineup.filter((p) => p.group === 'explore').map((p) => p.id), ['ai_tools', 'biz_opp', 'work_from_home', 'side_hustles'], 'four explore cards');
assert.ok(!NICHE_PROFILES.money_making, 'standalone money-making profile removed');
// Bounded, non-empty query bundles (no keyword-dump blow-up of search quota).
for (const profile of lineup) {
  assert.ok(profile.queries.length >= 4 && profile.queries.length <= 6, `${profile.id} has 4–6 search queries, got ${profile.queries.length}`);
  assert.ok(profile.queries.every((q) => typeof q === 'string' && q.trim().length > 6), `${profile.id} queries are real phrases`);
}

// Old saved money_making scans resolve gracefully (folded into side hustles), never crash.
assert.equal(LEGACY_PROFILE_ALIASES.money_making, 'side_hustles');
assert.equal(resolveNicheProfile('money_making').label, 'Side Hustles & Online Income', 'legacy money_making aliases to side hustles');
assert.equal(resolveNicheProfile('no_such_profile').label, 'Affiliate Marketing', 'unknown id falls back to affiliate marketing');
const legacyLead = scoreNicheLead({ text: 'How do I start making money online with no experience?', profileId: 'money_making' });
assert.equal(legacyLead.opportunityType, 'niche_lead', 'legacy money_making still scores a real lead');
assert.ok(legacyLead.summary && legacyLead.summary.length > 8, 'legacy money_making lead has a summary');

// Work-from-home JOB seekers are noise, not business prospects.
for (const text of ['Are you hiring? I can send you my resume', 'I just need a remote job, is this a job?', 'Any jobs available? I want to apply for a position']) {
  const job = check('work_from_home', text, { type: LOW, reason: 'remote_job_request' });
  assert.match(job.summary, /job, not/i, `"${text}" flagged as a job request`);
}
// But a business starter who merely mentions their old job is still a lead.
const quitJob = check('work_from_home', 'I lost my 9 to 5 job and want to start a home based business, how do I begin?', { type: LEAD });
assert.notEqual(quitJob.lowFitReason, 'remote_job_request');
// A job seeker with start-intent but no business keyword is still a job request, not a lead.
const jobWithStart = check('work_from_home', 'I want to start a remote job, where should I apply?', { type: LOW, reason: 'remote_job_request' });
assert.equal(leadBucket(jobWithStart), 'not_fit');

// Review follow-up: high-intent comment-fit cases that must land in Best, not Maybe/noise.
const emailFit = check('email_follow_up', 'I have 30 subscribers and no sales. What should I send after they opt in?', { type: LEAD });
assert.equal(emailFit.leadFit, 'best', 'subscriber count + next-step ask is a strong email lead');
assert.ok(emailFit.nicheMatchedKeywords.length > 0, 'email follow-up now matches subscriber/opt-in keywords');
const funnelFit = check('affiliate_funnels', 'I built an opt-in page but no one signs up. What should I change?', { type: LEAD });
assert.equal(funnelFit.leadFit, 'best', 'specific funnel blocker + what-to-change ask is a strong lead');
const offerFit = check('choosing_offers', 'I have a small fitness audience. Which affiliate offer should I promote?', { type: LEAD });
assert.equal(offerFit.leadFit, 'best', 'audience + "which affiliate offer" selection ask is a strong lead');
// Nearby counterexample: generic praise with no ask stays noise even in these niches.
for (const niche of ['email_follow_up', 'affiliate_funnels', 'choosing_offers']) {
  assert.equal(check(niche, 'Great video, thanks so much!', { type: LOW, reason: 'praise_only' }).leadFit, null);
}

// Specific reasons and behaviour.
const spam = check('side_hustles', 'Contact Mr James on telegram, he made me $3000 per week guaranteed', { type: LOW, reason: 'self_promotion', risk: 'high', action: 'reject_as_spam' });
assert.equal(spam.overallScore, 0, 'spam scores 0');
const owner = check('work_from_home', 'How do I start? Answer in my next video!', { type: LOW, reason: 'channel_owner', input: { isChannelOwner: true } });
assert.match(owner.summary, /own channel/i);
const situation = check('work_from_home', "I'm 50, no experience and no website. How do I start?", { type: LEAD });
assert.match(situation.summary, /Asks how to start/);
assert.match(situation.summary, /no experience/);
assert.match(situation.summary, /i'm 50/i);
const riskyLead = check('side_hustles', 'Is this guaranteed income legit? How much does it cost to start?', { type: LEAD, risk: 'medium' });
assert.match(riskyLead.summary, /Caution: mentions "guaranteed"/, 'RISK_KEYWORDS flag a lead with caution');
const plainRiskFree = scoreNicheLead({ text: 'How do I start with no experience?', profileId: 'side_hustles' });
assert.ok(riskyLead.overallScore < plainRiskFree.overallScore + 20, 'risk phrases do not inflate score');
const nicheBoosted = scoreNicheLead({ text: 'Is a home business opportunity legit?', profileId: 'work_from_home' });
assert.ok(nicheBoosted.nicheMatchedKeywords.includes('home business opportunity'), 'niche keyword match recorded');
assert.ok(nicheBoosted.nicheScoreBoost > 0, 'niche boost recorded');
const praiseQuestion = check('side_hustles', 'Great video! How much does it cost to start this?', { type: LEAD });
assert.match(praiseQuestion.summary, /cost/i, 'praise plus a real question still counts as a lead');
const vague = check('ai_tools', 'Nice', { type: LOW, reason: 'praise_only' });
assert.ok(vague.overallScore < 20);

// Middle band: real but incomplete interest belongs in Maybe, not Best or noise.
for (const text of ["I'm new", 'New and get into it', 'New to this', 'Just getting into affiliate marketing', 'Complete beginner', 'Zero experience', 'Before Black Friday I want to start']) {
  const result = check('affiliate_marketing', text, { type: LEAD, summary: /start|beginner|situation/i });
  assert.equal(result.leadFit, 'maybe', `${text} has weak intent without a specific question`);
  assert.equal(leadBucket(result), 'maybe');
}
const moderate = check('work_from_home', 'How long does it take?', { type: LEAD, summary: /cost or time/i });
assert.equal(moderate.leadFit, 'maybe');
assert.equal(leadBucket(moderate), 'maybe');
const strong = check('work_from_home', "I'm a stay at home mom with no experience. How do I start a home business?", { type: LEAD });
assert.equal(strong.leadFit, 'best');
assert.equal(leadBucket(strong), 'best');
for (const text of ['Can you make a video on how to start a home business?', 'Please make a video about this', 'Do a video about getting started']) {
  const request = check('work_from_home', text, { type: LEAD, summary: /Asks the creator for a video/ });
  assert.equal(request.leadFit, 'maybe');
  assert.ok(request.overallScore <= 54);
  assert.equal(request.recommendedAction, 'save_content_idea');
}
const fba = check('affiliate_marketing', "I'm new to Amazon FBA inventory. How much stock do I need?", { type: LEAD, summary: /different business \(FBA\)/i });
assert.equal(fba.leadFit, 'maybe');
assert.ok(fba.overallScore <= 54);
for (const text of ['Thnx for help', 'lol my cat does this', 'Check out my channel for a secret system']) {
  assert.equal(scoreNicheLead({ text, profileId: 'work_from_home' }).opportunityType, LOW, 'noise stays Not a fit');
}

// Two-stage comment fit is profile-specific: video topic cannot turn a generic
// or historical comment into a lead without a current personal conversion issue.
for (const text of [
  'I have 200 affiliate link clicks and zero sales. What should I fix first?',
  'My affiliate funnel gets opt-ins but nobody buys. What should I change?',
  'I have affiliate traffic but the conversion rate is low. What should I check?',
  'I have no sales after 200 affiliate link clicks; what is wrong?',
]) {
  const lead = check('clicks_no_sales', text, { type: LEAD, summary: /Personal conversion blocker/i });
  assert.equal(lead.leadFit, 'best', `${text} is an actionable personal conversion blocker`);
  assert.ok(lead.nicheSignals.includes('conversionPain'));
  assert.equal(lead.scoreDimensions.find((dimension) => dimension.dimension === 'nicheConversionPain')?.score, 80);
  assert.ok(lead.evidenceSnippets.some((evidence) => /clicks|traffic|funnel/i.test(evidence)));
}
const painWithoutAsk = check('clicks_no_sales', 'I have 200 clicks but zero sales from my affiliate links.', { type: LEAD, summary: /Personal conversion blocker/ });
assert.equal(painWithoutAsk.leadFit, 'maybe', 'personal pain without a next-step ask stays Maybe');
for (const text of [
  'How do I start affiliate marketing as a beginner?',
  'I have no clicks and no sales. How can I get traffic?',
  'Affiliate marketing funnels are cool. Any tips?',
  'I once had 200 clicks and zero sales, then fixed my funnel.',
]) {
  const low = check('clicks_no_sales', text, { type: LOW, reason: 'no_conversion_pain' });
  assert.equal(low.scoreDimensions.find((dimension) => dimension.dimension === 'nicheConversionPain')?.score, 0);
}
check('clicks_no_sales', 'Great video, thanks for explaining affiliate marketing!', { type: LOW, reason: 'praise_only' });
check('clicks_no_sales', 'I have 200 clicks zero sales, check my channel for the real fix.', { type: LOW, reason: 'self_promotion' });
check('clicks_no_sales', "I can't find the link in the description", { type: LOW, reason: 'video_housekeeping' });
assert.equal(scoreNicheLead({ text: 'How do I start affiliate marketing as a beginner?', profileId: 'affiliate_marketing' }).opportunityType, LEAD, 'other profile keeps its starter scoring');

// Candidate ranking.
assert.equal(candidateTarget(10), 20);
assert.equal(candidateTarget(10, 'clicks_no_sales'), 50, 'focused Standard samples 50 candidates');
assert.equal(candidateTarget(5, 'clicks_no_sales'), 10, 'focused Quick stays lean');
assert.equal(candidateTarget(25, 'clicks_no_sales'), 50, 'focused Deep unchanged');
assert.equal(candidateTarget(10, 'work_from_home'), 20, 'other Standard profiles unchanged');
assert.equal(candidateTarget(25), 50);
assert.equal(candidateTarget(40), 50, 'capped at one videos.list batch');
const candidates = [
  { id: 'a', title: 'My morning routine' },
  { id: 'b', title: 'Home business for beginners: is it legit?' },
  { id: 'c', title: 'Quiet video' },
  { id: 'd', title: 'Big generic video' },
  { id: 'e', title: 'Comments off' },
  { id: 'f', title: 'Honest review of side businesses' },
];
const stats = new Map([
  ['a', { commentCount: '40', title: 'My morning routine' }],
  ['b', { commentCount: '120', title: 'Home business for beginners: is it legit?' }],
  ['c', { commentCount: '3', title: 'Quiet video' }],
  ['d', { commentCount: '900', title: 'Big generic video' }],
  ['e', { title: 'Comments off' }],
  ['f', { commentCount: '60', title: 'Honest review of side businesses' }],
]);
const ranked = rankCandidateVideos(candidates, stats, { maxVideos: 3 });
// b (120 comments, 'beginners' + 'legit' title) outranks d (900 comments, generic title); f's 'honest' beats a's extra comments.
assert.deepEqual(ranked.selected.map((v) => v.id), ['b', 'd', 'f'], `ranking prefers comments + prospect titles, got ${ranked.selected.map((v) => v.id)}`);
assert.ok(ranked.dropped.some((v) => v.id === 'c' && v.reason === 'too_few_comments'));
assert.ok(ranked.dropped.some((v) => v.id === 'e' && v.reason === 'comments_hidden_or_disabled'));
assert.ok(ranked.dropped.some((v) => v.id === 'a' && v.reason === 'ranked_below_cutoff'));
const unranked = rankCandidateVideos(candidates, null, { maxVideos: 2 });
assert.deepEqual(unranked.selected.map((v) => v.id), ['a', 'b'], 'no stats keeps search order');

// Clicks but No Sales selects for topic before comment popularity. The other
// eleven profiles still use the original general ranking and 10-comment rule.
for (const title of [
  'Affiliate marketing: clicks but no sales',
  'Affiliate links not converting: what to check',
  'Getting traffic but no affiliate commissions',
  'Zero commissions from affiliate links',
  'Affiliate marketing: no sales despite traffic',
]) assert.equal(clicksNoSalesFit({ title }), 'direct', title);
assert.equal(clicksNoSalesFit({ title: 'How to increase affiliate conversion rate for beginners' }), 'adjacent', 'conversion advice without stated pain is adjacent');
assert.equal(clicksNoSalesFit({ title: 'Affiliate offers that convert' }), 'adjacent');
for (const title of ['Affiliate marketing troubleshooting common mistakes', 'Affiliate funnel opt-in fixes', 'Affiliate offer audience mismatch', 'Affiliate traffic to sales strategy'])
  assert.equal(clicksNoSalesFit({ title }), 'broad', title);
assert.equal(clicksNoSalesFit({ title: 'Facebook Ads affiliate sales funnel conversion rate' }), 'off_topic', 'paid-ad-specific title excluded even with affiliate anchor');
assert.equal(clicksNoSalesFit({ title: 'Affiliate music gear offer review' }), 'off_topic', 'music gear is not a conversion topic');
assert.equal(clicksNoSalesFit({ title: 'Affiliate marketing for beginners' }), 'off_topic', 'generic beginner content does not fill the shortlist');
assert.equal(clicksNoSalesFit({ title: 'Affiliate marketing for beginners', description: 'Learn conversion rate tips and track growth.' }), 'off_topic', 'generic title stays out despite conversion boilerplate');
assert.equal(clicksNoSalesFit({ title: 'Affiliate marketing for beginners', description: 'Why affiliate links get clicks but no sales.' }), 'off_topic', 'specific description cannot rescue a generic beginner title');
assert.equal(clicksNoSalesFit({ title: 'Clicks but no sales: offer mismatch', description: 'Affiliate marketing traffic and offers explained' }), 'direct');
assert.equal(clicksNoSalesFit({ title: 'Why Your Affiliate Links Get No Clicks (The Fix)', description: 'Improve affiliate conversion rate.' }), 'off_topic', 'actual wrong-funnel-stage video is excluded');
assert.equal(clicksNoSalesFit({ title: 'How to get more affiliate traffic and clicks' }), 'off_topic');
assert.equal(clicksNoSalesFit({ title: 'No affiliate traffic or clicks? Here is how to grow' }), 'off_topic');
assert.equal(clicksNoSalesFit({ title: 'Affiliate marketing: no clicks vs clicks but no sales' }), 'direct', 'explicit conversion-pain exception');
for (const title of [
  'Music tools: best plugins for beginners',
  'Ecommerce product page conversion rate tips',
  'Shopify online store: clicks but no sales',
  'How to improve conversion rate for online stores',
]) assert.equal(clicksNoSalesFit({ title, description: 'Affiliate links below help support the channel.' }), 'off_topic', title);
assert.equal(clicksNoSalesFit({ title: 'Music gear for beginners', description: 'Affiliate marketing links below.' }), 'off_topic');
assert.equal(clicksNoSalesFit({ title: 'Marketing for beginners', description: 'Affiliate links below.' }), 'off_topic', 'footer disclosure alone is not enough');

const focusedCandidates = [
  { id: 'music', title: 'Music gear for beginners' },
  { id: 'noClicks', title: 'Why Your Affiliate Links Get No Clicks (The Fix)' },
  { id: 'beginner', title: 'Affiliate marketing for beginners' },
  { id: 'store', title: 'Ecommerce product page conversion rate' },
  { id: 'adjacent', title: 'How to improve affiliate conversion rate for beginners' },
  { id: 'direct', title: 'Affiliate links not converting: clicks but no sales' },
  { id: 'low', title: 'Affiliate links not converting: zero commissions' },
];
const focusedStats = new Map([
  ['music', { commentCount: 9000 }],
  ['noClicks', { commentCount: 12000 }],
  ['beginner', { commentCount: 15000 }],
  ['store', { commentCount: 2500 }],
  ['adjacent', { commentCount: 600 }],
  ['direct', { commentCount: 5 }],
  ['low', { commentCount: 4 }],
]);
const focusedRank = rankCandidateVideos(focusedCandidates, focusedStats, { maxVideos: 5, profileId: 'clicks_no_sales' });
assert.deepEqual(focusedRank.selected.map(({ id }) => id), ['direct', 'low', 'adjacent'], 'direct pain with 4-5 comments outranks adjacent with 600');
assert.ok(focusedRank.dropped.some(({ id, reason }) => id === 'music' && reason === 'off_topic'), 'high-comment music excluded');
assert.ok(focusedRank.dropped.some(({ id, reason }) => id === 'noClicks' && reason === 'off_topic'), 'actual no-clicks title excluded despite 12000 comments');
assert.ok(focusedRank.dropped.some(({ id, reason }) => id === 'beginner' && reason === 'off_topic'), 'generic beginner title excluded despite 15000 comments');
assert.ok(focusedRank.dropped.some(({ id, reason }) => id === 'store' && reason === 'off_topic'), 'generic ecommerce excluded');
assert.equal(focusedRank.selected.find(({ id }) => id === 'low')?.commentCount, 4, 'direct pain accepts four comments');
assert.equal(rankCandidateVideos([{ id: 'direct', title: focusedCandidates.find(({ id }) => id === 'direct').title }], new Map([['direct', { commentCount: 3 }]]), { maxVideos: 1, profileId: 'clicks_no_sales' }).selected.length, 1, 'direct pain accepts three comments');
assert.ok(rankCandidateVideos([{ id: 'direct', title: focusedCandidates.find(({ id }) => id === 'direct').title }], new Map([['direct', { commentCount: 2 }]]), { maxVideos: 1, profileId: 'clicks_no_sales' }).dropped.some(({ reason }) => reason === 'too_few_comments'), 'direct pain rejects two comments');
assert.ok(rankCandidateVideos([{ id: 'adjacent', title: focusedCandidates.find(({ id }) => id === 'adjacent').title }], new Map([['adjacent', { commentCount: 4 }]]), { maxVideos: 1, profileId: 'clicks_no_sales' }).dropped.some(({ reason }) => reason === 'too_few_comments'), 'conversion-adjacent still requires five');
assert.equal(rankCandidateVideos([{ id: 'adjacent', title: focusedCandidates.find(({ id }) => id === 'adjacent').title }], new Map([['adjacent', { commentCount: 5 }]]), { maxVideos: 1, profileId: 'clicks_no_sales' }).selected.length, 1);
assert.deepEqual(rankCandidateVideos(focusedCandidates, focusedStats, { maxVideos: 2, profileId: 'affiliate_marketing' }).selected.map(({ id }) => id), ['beginner', 'music'], 'other profiles retain comment/title ranking even for focused off-topic videos');
assert.equal(rankCandidateVideos([{ id: 'direct', title: focusedCandidates.find(({ id }) => id === 'direct').title }], new Map([['direct', { commentCount: 5 }]]), { maxVideos: 1 }).selected.length, 0, 'other profiles still require 10');
const noStats = rankCandidateVideos(focusedCandidates, null, { maxVideos: 2, profileId: 'clicks_no_sales' });
assert.deepEqual(noStats.selected, [], 'ranking failure cannot verify the comment minimum, so scans none');
assert.equal(rankCandidateVideos([{ id: 'music', title: focusedCandidates[0].title }], null, { maxVideos: 2, profileId: 'clicks_no_sales' }).selected.length, 0, 'no-statistics fallback does not scan unrelated videos');

const focusedClient = {
  calls: { videos: 0, search: 0 },
  async searchVideos() {
    this.calls.search += 1;
    return { items: focusedCandidates.map(({ id, title }) => ({ id: { videoId: id }, snippet: { title } })) };
  },
  async listVideos(ids) {
    this.calls.videos += 1;
    return { items: ids.map((id) => ({ id, snippet: { title: focusedCandidates.find((item) => item.id === id).title }, statistics: { commentCount: String(focusedStats.get(id).commentCount) } })) };
  },
};
const focusedSelection = await selectNicheVideos({ youtubeClient: focusedClient, queries: ['affiliate clicks but no sales'], maxVideos: 5, publishedAfter: '2026-10-01T00:00:00Z', profileId: 'clicks_no_sales' });
assert.deepEqual(focusedSelection.videos.map(({ id }) => id), ['direct', 'low', 'adjacent']);
assert.equal(focusedClient.calls.videos, 1, 'same one read-only batched metadata lookup');
assert.equal(focusedClient.calls.search, 1, 'no extra search calls');
// Focused Standard samples up to 50 distinct results while staying within the
// six-query bundle, 25-result/search limit and one videos.list batch.
const standardCalls = { search: [], videos: [] };
let generated = 0;
const standardClient = {
  async searchVideos({ query, maxResults }) {
    standardCalls.search.push({ query, maxResults });
    return { items: Array.from({ length: maxResults }, () => {
      generated += 1;
      return { id: { videoId: `cand${String(generated).padStart(7, '0')}` }, snippet: { title: 'Affiliate links not converting: zero commissions' } };
    }) };
  },
  async listVideos(ids) {
    standardCalls.videos.push(ids);
    return { items: ids.map((id) => ({ id, snippet: { title: 'Affiliate links not converting: zero commissions' }, statistics: { commentCount: '3' } })) };
  },
};
const standardQueries = NICHE_PROFILES.clicks_no_sales.queries;
const standardSelection = await selectNicheVideos({ youtubeClient: standardClient, queries: standardQueries, maxVideos: 10, profileId: 'clicks_no_sales' });
assert.equal(standardSelection.candidatesConsidered, 10, 'focused Standard stops after 10 verified engaged broad candidates');
assert.equal(standardSelection.videos.length, 10, 'still selects at most 10 for comments');
assert.equal(standardCalls.videos.length, 1, 'one videos.list request for the focused Standard batch');
assert.equal(standardCalls.videos[0].length, 10);
assert.equal(new Set(standardCalls.videos[0]).size, 10);
assert.equal(standardCalls.search.length, 1, 'engaged broad pool avoids five further paid searches');
assert.ok(standardCalls.search.length <= standardQueries.length, 'search calls bounded by existing query bundle');
assert.ok(standardCalls.search.every(({ maxResults }) => maxResults <= 25), 'each search asks at most 25');
assert.equal(standardSelection.estimatedSearchQuotaUnits, standardCalls.search.length * 100);
assert.equal(standardSelection.estimatedRankingQuotaUnits, 1);
const sparseBroadCalls = { search: [], videos: [] };
let sparseGenerated = 0;
const sparseBroadClient = {
  async searchVideos({ query, maxResults }) {
    sparseBroadCalls.search.push({ query, maxResults });
    const broad = sparseBroadCalls.search.length <= 3;
    return { items: Array.from({ length: maxResults }, () => {
      sparseGenerated += 1;
      return { id: { videoId: `sparse${String(sparseGenerated).padStart(5, '0')}` }, snippet: { title: broad ? 'Unrelated music gear for beginners' : 'Affiliate links not converting: zero commissions' } };
    }) };
  },
  async listVideos(ids) {
    sparseBroadCalls.videos.push(ids);
    return { items: ids.map((id) => ({ id, snippet: { title: Number(id.slice(-5)) <= 30 ? 'Unrelated music gear for beginners' : 'Affiliate links not converting: zero commissions' }, statistics: { commentCount: '12' } })) };
  },
};
const sparseBroad = await selectNicheVideos({ youtubeClient: sparseBroadClient, queries: standardQueries, maxVideos: 10, profileId: 'clicks_no_sales' });
assert.equal(sparseBroad.candidatesConsidered, 50, 'sparse broad pool uses fallback to fill the 50-candidate cap');
assert.equal(sparseBroadCalls.search.length, 4, 'three broad searches plus one fallback, not all six');
assert.ok(sparseBroadCalls.search.every(({ maxResults }) => maxResults <= 25));
assert.equal(sparseBroadCalls.videos.length, 1);
assert.equal(new Set(sparseBroadCalls.videos[0]).size, 50);
assert.equal(sparseBroad.videos.length, 10);
assert.ok(sparseBroad.videos.every(({ title }) => title.includes('not converting')));

// When broad titles look relevant but their comments are under the floor,
// verify once, run pain-specific fallbacks, then verify only NEW ids once more.
const thinBroadCalls = { searches: [], metadata: [] };
let thinGenerated = 0;
const thinBroadClient = {
  async searchVideos({ query, maxResults }) {
    thinBroadCalls.searches.push({ query, maxResults });
    const broad = thinBroadCalls.searches.length === 1;
    return { items: Array.from({ length: maxResults }, () => {
      thinGenerated += 1;
      return { id: { videoId: `thin${String(thinGenerated).padStart(7, '0')}` }, snippet: { title: broad ? 'Affiliate marketing troubleshooting mistakes' : 'Affiliate links not converting: zero commissions' } };
    }) };
  },
  async listVideos(ids) {
    thinBroadCalls.metadata.push(ids);
    return { items: ids.map((id) => ({ id, snippet: { title: Number(id.slice(-7)) <= 10 ? 'Affiliate marketing troubleshooting mistakes' : 'Affiliate links not converting: zero commissions' }, statistics: { commentCount: Number(id.slice(-7)) <= 10 ? '2' : '12' } })) };
  },
};
const thinBroad = await selectNicheVideos({ youtubeClient: thinBroadClient, queries: standardQueries, maxVideos: 10, profileId: 'clicks_no_sales' });
assert.deepEqual(thinBroadCalls.searches.length, 3, 'under-engaged broad pool triggers two specific fallback searches');
assert.deepEqual(thinBroadCalls.metadata.map((ids) => ids.length), [10, 40], 'second videos.list checks only new candidate ids');
assert.equal(thinBroad.candidatesConsidered, 50);
assert.equal(thinBroad.videos.length, 10);
assert.ok(thinBroad.videos.every(({ fit }) => fit === 'direct'));
assert.equal(thinBroad.estimatedSearchQuotaUnits, 300);
assert.equal(thinBroad.estimatedRankingQuotaUnits, 2);

// Broad engaged troubleshooting videos are eligible without the exact phrase,
// but direct pain still ranks first; off-topic high-comment videos never fill in.
const tierCandidates = [
  { id: 'broad', title: 'Affiliate marketing troubleshooting common mistakes', comments: 900 },
  { id: 'adjacentTier', title: 'How to improve affiliate conversion rate', comments: 400 },
  { id: 'directTier', title: 'Affiliate clicks but no sales: what to fix', comments: 3 },
  { id: 'musicTier', title: 'Music gear for beginners', comments: 20000 },
  { id: 'storeTier', title: 'Ecommerce product page conversion rate tips', comments: 8000 },
  { id: 'adsTier', title: 'Facebook Ads affiliate funnel conversion rate', comments: 7000 },
  { id: 'noClicksTier', title: 'Why Your Affiliate Links Get No Clicks (The Fix)', comments: 6000 },
];
const tierRank = rankCandidateVideos(tierCandidates, new Map(tierCandidates.map(({ id, comments }) => [id, { commentCount: comments }])), { maxVideos: 5, profileId: 'clicks_no_sales' });
assert.deepEqual(tierRank.selected.map(({ id }) => id), ['directTier', 'adjacentTier', 'broad'], 'direct, then adjacent, then broad troubleshooting');
assert.equal(tierRank.selected.find(({ id }) => id === 'broad').fit, 'broad');
assert.deepEqual(tierRank.dropped.map(({ id, reason }) => [id, reason]), [['musicTier', 'off_topic'], ['storeTier', 'off_topic'], ['adsTier', 'off_topic'], ['noClicksTier', 'off_topic']]);
assert.ok(rankCandidateVideos([{ id: 'thinBroad', title: tierCandidates[0].title }], new Map([['thinBroad', { commentCount: 4 }]]), { maxVideos: 1, profileId: 'clicks_no_sales' }).dropped.some(({ reason }) => reason === 'too_few_comments'), 'broad tier keeps five-comment floor');

const repeatedClient = {
  async searchVideos({ maxResults }) { return { items: Array.from({ length: maxResults }, (_, index) => ({ id: { videoId: `same${index}` }, snippet: { title: 'Affiliate clicks but no sales' } })) }; },
  async listVideos(ids) { assert.equal(new Set(ids).size, ids.length, 'deduplicated ids sent to videos.list'); return { items: ids.map((id) => ({ id, snippet: { title: 'Affiliate clicks but no sales' }, statistics: { commentCount: '3' } })) }; },
};
const repeated = await selectNicheVideos({ youtubeClient: repeatedClient, queries: standardQueries, maxVideos: 10, profileId: 'clicks_no_sales' });
assert.equal(repeated.candidatesConsidered, 10, 'verified broad pool stops before duplicate fallback results');
const wrongStageClient = {
  async searchVideos() { return { items: [{ id: { videoId: 'wrong-stage' }, snippet: { title: 'Why Your Affiliate Links Get No Clicks (The Fix)' } }] }; },
  async listVideos() { return { items: [{ id: 'wrong-stage', snippet: { title: 'Why Your Affiliate Links Get No Clicks (The Fix)' }, statistics: { commentCount: '9000' } }] }; },
};
const wrongStage = await selectNicheVideos({ youtubeClient: wrongStageClient, queries: standardQueries, maxVideos: 10, profileId: 'clicks_no_sales' });
assert.deepEqual(wrongStage.videos, [], 'no-clicks video alone yields honest empty shortlist');
assert.ok(wrongStage.searchErrors.some(({ code }) => code === 'no_eligible_affiliate_videos'));
assert.ok(wrongStage.searchErrors.every(({ message }) => !/up to 90 days|broader age window/i.test(message)), 'empty result does not suggest an age choice already exhausted');

const allOffTopicClient = {
  async searchVideos() { return { items: [{ id: { videoId: 'music' }, snippet: { title: 'Music gear for beginners' } }] }; },
  async listVideos() { return { items: [{ id: 'music', snippet: { title: 'Music gear for beginners' }, statistics: { commentCount: '9999' } }] }; },
};
const emptySelection = await selectNicheVideos({ youtubeClient: allOffTopicClient, queries: ['affiliate clicks'], maxVideos: 1, profileId: 'clicks_no_sales' });
assert.deepEqual(emptySelection.videos, [], 'no off-topic fallback when no eligible videos');
assert.ok(emptySelection.searchErrors.some(({ code }) => code === 'no_eligible_affiliate_videos'), 'empty shortlist explains next step');
const noCandidates = await selectNicheVideos({
  youtubeClient: { async searchVideos() { return { items: [] }; }, async listVideos() { throw new Error('should not call videos.list'); } },
  queries: standardQueries, maxVideos: 10, profileId: 'clicks_no_sales',
});
assert.deepEqual(noCandidates.videos, []);
assert.ok(noCandidates.searchErrors.some(({ code }) => code === 'no_search_candidates'), 'zero search results have a specific diagnostic');
assert.ok(noCandidates.searchErrors.every(({ message }) => !/up to 90 days|broader age window/i.test(message)), 'no-candidate result remains useful at 90 days');
assert.equal(noCandidates.estimatedRankingQuotaUnits, 0, 'no empty metadata lookup');

const missingStatsClient = {
  async searchVideos() { return { items: [{ id: { videoId: 'direct' }, snippet: { title: 'Affiliate links not converting' } }] }; },
  async listVideos() { throw new Error('metadata temporarily unavailable'); },
};
const missingStats = await selectNicheVideos({ youtubeClient: missingStatsClient, queries: ['affiliate clicks'], maxVideos: 1, profileId: 'clicks_no_sales' });
assert.deepEqual(missingStats.videos, [], 'missing counts never bypass the five-comment floor');
assert.ok(missingStats.searchErrors.some(({ code }) => code === 'ranking_metadata_unavailable'));
assert.match(missingStats.searchErrors[0].message, /skip videos/, 'failure note does not promise search-order fallback');

const belowCutoffClient = {
  async searchVideos() { return { items: [{ id: { videoId: 'direct' }, snippet: { title: 'Affiliate links not converting' } }] }; },
  async listVideos() { return { items: [{ id: 'direct', snippet: { title: 'Affiliate links not converting' }, statistics: { commentCount: '2' } }] }; },
};
assert.equal((await selectNicheVideos({ youtubeClient: belowCutoffClient, queries: ['affiliate clicks'], maxVideos: 1, profileId: 'clicks_no_sales' })).videos.length, 0, 'relevant two-comment video stays below threshold');

function mockSearchClient({ failVideosList = false, comments = {} } = {}) {
  const calls = { search: [], videos: [] };
  let n = 0;
  return {
    calls,
    async searchVideos({ query, maxResults }) {
      calls.search.push({ query, maxResults });
      return { items: Array.from({ length: maxResults }, () => { n += 1; return { id: { videoId: `vid${String(n).padStart(8, '0')}` }, snippet: { title: n % 3 === 0 ? 'Is it legit? Beginners guide' : `Video ${n}`, channelTitle: 'Ch' } }; }) };
    },
    async listVideos(ids) {
      calls.videos.push(ids);
      if (failVideosList) throw Object.assign(new Error('quotaExceeded'), { code: 'quotaExceeded' });
      return { items: ids.map((id, i) => ({ id, snippet: { title: `T ${id}` }, statistics: { commentCount: String(comments[id] ?? (i % 2 ? 5 : 50 + i)) } })) };
    },
  };
}

const okClient = mockSearchClient();
const picked = await selectNicheVideos({ youtubeClient: okClient, queries: ['q1', 'q2', 'q3', 'q4'], maxVideos: 5, publishedAfter: '2026-01-01T00:00:00Z' });
assert.equal(okClient.calls.videos.length, 1, 'exactly one batched videos.list call');
assert.ok(picked.candidatesConsidered >= 10 && picked.candidatesConsidered <= 10, `requests 2x candidates (${picked.candidatesConsidered})`);
assert.equal(picked.videos.length, 5);
assert.ok(picked.videos.every((v) => v.commentCount >= 10), 'low-comment videos dropped');
assert.equal(picked.estimatedRankingQuotaUnits, 1);
assert.equal(picked.estimatedSearchQuotaUnits, 100 * okClient.calls.search.length);
assert.equal(picked.searchErrors.length, 0);

const failClient = mockSearchClient({ failVideosList: true });
const fallback = await selectNicheVideos({ youtubeClient: failClient, queries: ['q1', 'q2'], maxVideos: 3, publishedAfter: '2026-01-01T00:00:00Z' });
assert.equal(fallback.videos.length, 3, 'fallback still returns videos');
assert.deepEqual(fallback.videos.map((v) => v.id), ['vid00000001', 'vid00000002', 'vid00000003'], 'fallback keeps search order');
assert.equal(fallback.rankedByComments, false);
assert.ok(fallback.searchErrors.some((e) => e.code === 'video_ranking_failed'), 'videos.list failure recorded');

// Niche import end-to-end with a mock read-only client and a temp store.
const tempDir = await mkdtemp(join(tmpdir(), 'niche-import-store-'));
try {
  const store = new JsonImportStore({ filePath: join(tempDir, 'store.json') });
  const texts = [
    "I'm a stay at home mom with no experience, how do I get started with a home based business?",
    'Thnx for help',
    'Wrong title',
    "I can't find the link",
    'Is this legit? How much does it cost to start?',
  ];
  const youtubeClient = {
    async listVideos(ids) {
      return { items: ids.map((id) => ({ id, snippet: { title: 'Work from home business for beginners', channelId: 'owner', channelTitle: 'Owner', publishedAt: '2026-11-01T00:00:00Z' }, statistics: { commentCount: '5' }, status: { privacyStatus: 'public' } })) };
    },
    async listCommentThreads({ videoId }) {
      return { items: texts.map((text, i) => ({ id: `t${i}`, snippet: { videoId, totalReplyCount: 0, topLevelComment: { id: `c${i}`, snippet: { authorDisplayName: `User ${i}`, authorChannelId: { value: `u${i}` }, textOriginal: text, likeCount: 0, publishedAt: '2026-11-10T00:00:00Z' } } } })) };
    },
  };
  const run = await importYouTubeVideos({ inputs: ['dQw4w9WgXcQ'], options: { profileId: 'work_from_home' }, store, youtubeClient, metadata: { scanType: 'niche', profileId: 'work_from_home', profileLabel: 'Work at/from home business' } });
  assert.equal(run.status, 'succeeded');
  const items = await store.listOpportunities({ limit: 50 });
  const byText = new Map(items.map((item) => [item.comment.textOriginal, item]));
  const lead = byText.get(texts[0]);
  assert.equal(lead.opportunityType, 'niche_lead');
  assert.equal(lead.opportunityTypeLabel, 'Niche lead');
  assert.equal(lead.nicheProfileId, 'work_from_home');
  assert.ok(lead.scoreDimensions.length > 0, 'niche dimensions persisted');
  assert.equal(byText.get(texts[1]).lowFitReason, 'praise_only');
  assert.equal(byText.get(texts[2]).lowFitReason, 'video_housekeeping');
  assert.equal(byText.get(texts[3]).lowFitReason, 'video_housekeeping');
  assert.equal(byText.get(texts[4]).opportunityType, 'niche_lead');
  for (const item of items) assert.ok(!/low-intent affiliate publisher/i.test(item.summary), 'no generic affiliate label on niche scans');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log(`Niche scoring checks passed: ${checked} niche comments across ${Object.keys(NICHE_PROFILES).length} niches, video ranking, videos.list fallback, niche import.`);
