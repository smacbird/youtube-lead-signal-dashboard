import assert from 'node:assert/strict';
import { buildDraftPrompt, generateReplyDrafts } from '../server/ai/draftGenerator.js';
const opportunity = {
  id: 'opp_test', nicheProfileLabel: 'Work-from-home business', nicheReplyStyle: 'practical',
  video: { title: 'Home business for beginners', channelName: 'Creator' },
  comment: { authorDisplayName: 'Alex', textOriginal: 'Could you make a beginner video for someone with no experience?' },
  scoreDimensions: [{ dimension: 'nicheSituation', evidence: ['no experience'] }],
};
const prompt = buildDraftPrompt(opportunity);
for (const phrase of ['Platform: YouTube', 'YouTube video title: Home business for beginners', 'Commenter situation: no experience', 'Comment text: Could you make', 'ONLY when the comment is about affiliate links or affiliate earnings', 'Never mention other platforms', '2-4 sentences', 'asks the creator to make a video', 'Black Friday plans', 'No filler closers', 'qualified professional', 'Never give personalised regulated advice']) assert.ok(prompt.includes(phrase), phrase);
assert.ok(!prompt.includes('Mention affiliate disclosures when relevant'));
// Missing key must never create a copyable fallback. No network call occurs.
const previous = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
try {
  await assert.rejects(() => generateReplyDrafts(opportunity), /Reply ideas need the OpenAI key/);
} finally { if (previous) process.env.OPENAI_API_KEY = previous; }
console.log('Draft prompt and missing-key safety checks passed.');
