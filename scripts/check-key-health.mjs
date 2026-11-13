import assert from 'node:assert/strict';
import { YouTubeReadOnlyClient } from '../server/youtube/client.js';
import { generateReplyDrafts } from '../server/ai/draftGenerator.js';
import { lastKnownKeyStatus } from '../server/keyHealth.js';

const fakeKey = 'SECRET_TEST_KEY_DO_NOT_ECHO';
const youtube = new YouTubeReadOnlyClient({ apiKey: fakeKey, maxRetries: 0, fetchImpl: async () =>
  new Response(JSON.stringify({ error: { errors: [{ reason: 'keyInvalid' }], message: `API key ${fakeKey} invalid` } }), { status: 403 }) });
await assert.rejects(() => youtube.listVideos(['dQw4w9WgXcQ']), (error) => {
  assert.equal(error.code, 'keyInvalid');
  assert.ok(!error.message.includes(fakeKey), 'upstream key fragment is never echoed');
  return true;
});
assert.equal(lastKnownKeyStatus().youtube.state, 'invalid_key');
const quota = new YouTubeReadOnlyClient({ apiKey: fakeKey, maxRetries: 0, fetchImpl: async () =>
  new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }], message: `${fakeKey} quota` } }), { status: 403 }) });
await assert.rejects(() => quota.listVideos(['dQw4w9WgXcQ']), /YouTube quota/);
assert.equal(lastKnownKeyStatus().youtube.state, 'quota_exceeded');
const disabled = new YouTubeReadOnlyClient({ apiKey: fakeKey, maxRetries: 0, fetchImpl: async () =>
  new Response(JSON.stringify({ error: { errors: [{ reason: 'commentsDisabled' }] } }), { status: 403 }) });
await assert.rejects(() => disabled.listCommentThreads({ videoId: 'dQw4w9WgXcQ' }), /Comments are disabled/);
assert.equal(lastKnownKeyStatus().youtube.state, 'quota_exceeded', 'comments off is not a key failure');
const goodYouTube = new YouTubeReadOnlyClient({ apiKey: fakeKey, maxRetries: 0, fetchImpl: async () =>
  new Response(JSON.stringify({ items: [] }), { status: 200 }) });
await goodYouTube.listVideos(['dQw4w9WgXcQ']);
assert.equal(lastKnownKeyStatus().youtube.state, 'ok', 'success clears only YouTube warning');

const savedFetch = globalThis.fetch;
const savedKey = process.env.OPENAI_API_KEY;
const opportunity = { id: 'test_opp', video: { title: 'Home business basics' }, comment: { textOriginal: 'How do I start with no experience?', authorDisplayName: 'Sam' } };
process.env.OPENAI_API_KEY = fakeKey;
try {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: `expired ${fakeKey}` } }), { status: 401 });
  await assert.rejects(() => generateReplyDrafts(opportunity), (error) => {
    assert.ok(!error.message.includes(fakeKey), 'OpenAI error never echoes upstream body');
    return true;
  });
  assert.equal(lastKnownKeyStatus().openai.state, 'invalid_key');
  assert.equal(lastKnownKeyStatus().youtube.state, 'ok', 'OpenAI failure never changes YouTube status');
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([
    { style: 'ai_short_helpful', body: 'Start by choosing one realistic business model and checking its cost. Practice the first small step before paying for extras.', complianceNotes: [] },
  ]) } }] }), { status: 200 });
  await generateReplyDrafts(opportunity);
  assert.equal(lastKnownKeyStatus().openai.state, 'ok');
  assert.ok(!JSON.stringify(lastKnownKeyStatus()).includes(fakeKey), 'status never stores credential values');
} finally {
  globalThis.fetch = savedFetch;
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
}
console.log('Key health checks passed: invalid key, quota, recovery, no secret leakage, service isolation.');
