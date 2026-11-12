import assert from 'node:assert/strict';
import { buildDraftPrompt, generateReplyDrafts } from '../server/ai/draftGenerator.js';
const opportunity = {
  id: 'opp_test', nicheProfileLabel: 'Work-from-home business', nicheReplyStyle: 'practical',
  video: { title: 'Home business for beginners', channelName: 'Creator' },
  comment: { authorDisplayName: 'Alex', textOriginal: 'Could you make a beginner video for someone with no experience?' },
  scoreDimensions: [{ dimension: 'nicheSituation', evidence: ['no experience'] }],
};
const prompt = buildDraftPrompt(opportunity);
for (const phrase of ['Platform: YouTube', 'YouTube video title: Home business for beginners', 'Commenter situation: no experience', 'Comment text: Could you make', 'ONLY when the comment is about affiliate links or affiliate earnings', 'Never mention other platforms', '2-4 natural sentences', 'asks the creator to make a video']) assert.ok(prompt.includes(phrase), phrase);
assert.ok(!prompt.includes('Mention affiliate disclosures when relevant'));
// Force local fallback, never network. Existing environment has no key in this test by design.
const previous = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
try {
  const { drafts } = await generateReplyDrafts(opportunity);
  assert.equal(drafts.length, 1);
  assert.ok(drafts[0].body.includes('follow-up'));
  assert.ok(!/TikTok|affiliate disclosure/.test(drafts[0].body));
} finally { if (previous) process.env.OPENAI_API_KEY = previous; }
console.log('Draft prompt and offline fallback checks passed.');
