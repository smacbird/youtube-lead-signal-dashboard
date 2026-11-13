import assert from 'node:assert/strict';
import { fallbackReplyText, safeFallbackDraft } from '../server/ai/fallbackReplies.js';
import { generateReplyDrafts } from '../server/ai/draftGenerator.js';
import { safeDraftsForOpportunity, canPrepareReply, isRealAIDraft } from '../src/scoring/draftSafety.js';

const comments = {
  clicks_no_sales: 'I get clicks but no sales. How do I start fixing this?',
  traffic_leads: 'How do I start getting leads to my page?',
  affiliate_funnels: 'How do I start building an affiliate opt-in funnel?',
  email_follow_up: 'How do I start a follow up email sequence?',
  organic_traffic: 'How do I start with organic traffic?',
  choosing_offers: 'How do I start choosing an affiliate offer to promote?',
  training_reviews: 'How do I start choosing an affiliate course worth the money?',
  affiliate_marketing: 'How do I start affiliate marketing with no experience?',
  ai_tools: 'How do I start using AI tools for my marketing workflow?',
  biz_opp: 'How do I start comparing online business models?',
  work_from_home: 'How do I start a business from home?',
  side_hustles: 'How do I start a side hustle after work?',
};
for (const [nicheProfileId, comment] of Object.entries(comments)) {
  const opportunity = { id: `opp_${nicheProfileId}`, nicheProfileId, comment: { textOriginal: comment } };
  const draft = safeFallbackDraft(opportunity);
  assert.ok(draft, `${nicheProfileId} has a specific answer`);
  assert.equal(draft.createdBy, 'safe_fallback');
  assert.equal(draft.style, 'fallback_short');
  assert.ok(canPrepareReply([draft], opportunity.id));
  assert.ok(!/helpful angle|a good reply would|you should answer|click here|https?:\/\//i.test(draft.body), 'no meta instruction or link');
}
const affiliate = safeFallbackDraft({ id: 'affiliate_1', nicheProfileId: 'affiliate_marketing', comment: { textOriginal: 'How do I start affiliate marketing?' } });
const ai = safeFallbackDraft({ id: 'ai_1', nicheProfileId: 'ai_tools', comment: { textOriginal: 'How do I start using AI tools?' } });
assert.notEqual(affiliate.body, ai.body, 'different niches get different concrete first steps');
assert.ok(!/affiliate disclosure/i.test(affiliate.body), 'no disclosure for a generic start question');
const linked = safeFallbackDraft({ id: 'affiliate_2', nicheProfileId: 'affiliate_marketing', comment: { textOriginal: 'How do I start with affiliate links?' } });
assert.match(linked.body, /disclose that relationship clearly/i, 'disclosure only for actual link/earnings question');
const regulated = safeFallbackDraft({ id: 'tax_1', nicheProfileId: 'work_from_home', comment: { textOriginal: 'Do I need a business bank account for taxes?' } });
assert.match(regulated.body, /qualified accountant or tax professional/i);
assert.ok(!/guaranteed income|legal advice|medical advice/i.test(regulated.body));
const video = safeFallbackDraft({ id: 'video_1', nicheProfileId: 'side_hustles', comment: { textOriginal: 'Can you make a video on starting a side hustle?' } });
assert.match(video.body, /follow-up video/);
assert.ok(!/TikTok|Instagram/i.test(video.body));
assert.equal(fallbackReplyText({ nicheProfileId: 'affiliate_marketing', summary: 'About a different business (FBA).', comment: { textOriginal: 'How do I start Amazon FBA?' } }), null, 'mismatched business refuses fallback');
assert.equal(fallbackReplyText({ nicheProfileId: 'ai_tools', comment: { textOriginal: 'Great video, thanks!' } }), null, 'praise alone cannot create a postable reply');
assert.equal(fallbackReplyText({ comment: { textOriginal: 'How do I start?' } }), null, 'manual import with no niche cannot assume affiliate marketing');
const old = { id: 'old', opportunityId: affiliate.opportunityId, createdBy: 'server_ai_fallback', style: 'ai_short_helpful', body: 'Helpful angle to review manually: answer the question' };
assert.deepEqual(safeDraftsForOpportunity([old, affiliate], affiliate.opportunityId).map((draft) => draft.id), [affiliate.id], 'old coaching text stays hidden');
assert.equal(isRealAIDraft(affiliate, affiliate.opportunityId), false, 'fallback is clearly not OpenAI');

const previous = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
try {
  const { provider, drafts } = await generateReplyDrafts({ id: 'offline', nicheProfileId: 'ai_tools', comment: { textOriginal: 'How do I start using AI tools?' } });
  assert.equal(provider, 'safe_fallback');
  assert.equal(drafts.length, 1);
  assert.ok(canPrepareReply(drafts, 'offline'));
  await assert.rejects(() => generateReplyDrafts({ id: 'mismatch', nicheProfileId: 'affiliate_marketing', summary: 'About a different business (FBA).', comment: { textOriginal: 'How do I start Amazon FBA?' } }), /Reply ideas need the OpenAI key/);
} finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
console.log('Fallback replies checks passed: twelve niches, regulated caution, provenance, no placeholder/mismatch, no-key path.');
