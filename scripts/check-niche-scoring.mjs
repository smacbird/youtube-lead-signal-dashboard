// Niche-lead scoring, candidate video ranking and niche-import checks.
// Offline only: no YouTube, OpenAI or network calls (mock clients throughout).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scoreNicheLead, LOW_FIT_REASONS } from '../server/scoring/nicheLead.js';
import { leadBucket } from '../src/scoring/leadBuckets.js';
import { NICHE_PROFILES, LEGACY_PROFILE_ALIASES, resolveNicheProfile, listNicheProfiles } from '../server/youtube/nicheProfiles.js';
import { candidateTarget, rankCandidateVideos, selectNicheVideos } from '../server/youtube/videoRanking.js';
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

// Candidate ranking.
assert.equal(candidateTarget(10), 20);
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
