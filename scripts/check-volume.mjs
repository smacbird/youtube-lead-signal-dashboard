import assert from 'node:assert/strict';
import { NICHE_PROFILES } from '../server/youtube/nicheProfiles.js';
import { checkVolume } from '../server/youtube/volumeCheck.js';
import { selectNicheVideos, queryTopicFit } from '../server/youtube/videoRanking.js';
import { YouTubeReadOnlyClient } from '../server/youtube/client.js';

const requests = [];
const httpClient = new YouTubeReadOnlyClient({ apiKey: 'local-mock', maxRetries: 0, fetchImpl: async (url, init) => {
  requests.push({ url: new URL(url), method: init.method });
  return { ok: true, text: async () => JSON.stringify({ items: [] }) };
} });
await httpClient.searchVideos({ query: 'local test', maxResults: 1000 });
assert.equal(requests[0].url.searchParams.get('maxResults'), '50', 'YouTube permits 50 results per search');
assert.equal(requests[0].method, 'GET');
await httpClient.searchVideos({ query: 'local test', maxResults: -5 });
assert.equal(requests[1].url.searchParams.get('maxResults'), '1');
let attempts = 0;
const noRetry = new YouTubeReadOnlyClient({ apiKey: 'local-mock', maxRetries: 0, fetchImpl: async () => {
  attempts++;
  return { ok: false, status: 503, text: async () => JSON.stringify({ error: {} }) };
} });
await assert.rejects(() => noRetry.searchVideos({ query: 'test', maxResults: 50 }));
assert.equal(attempts, 1, 'strict volume budget needs one HTTP attempt per requested call');

const sampleTexts = [
  'How do I start affiliate marketing with no website and no money?',
  'Great video, thanks!',
  'Which affiliate offer should I choose? Any tips?',
];
for (const profileId of Object.keys(NICHE_PROFILES)) {
  const calls = { search: [], videos: [], comments: [] };
  const client = {
    async searchVideos(arg) {
      calls.search.push(arg);
      return { items: Array.from({ length: 50 }, (_, i) => ({ id: { videoId: `v${String(i).padStart(10, '0')}` }, snippet: { title: NICHE_PROFILES[profileId].queries[0] } })) };
    },
    async listVideos(ids) {
      calls.videos.push(ids);
      return { items: ids.map((id) => ({ id, snippet: { title: NICHE_PROFILES[profileId].queries[0] }, statistics: { commentCount: '50' } })) };
    },
    async listCommentThreads({ videoId, maxResults, pageToken }) {
      calls.comments.push({ videoId, maxResults, pageToken });
      return { items: sampleTexts.map((text, i) => ({ id: `${videoId}-${i}`, snippet: { topLevelComment: { snippet: { textOriginal: text } } } })) };
    },
  };
  const result = await checkVolume({ profileId, daysBack: 30, youtubeClient: client });
  assert.equal(calls.search.length, 1, profileId);
  assert.equal(calls.search[0].maxResults, 50, profileId);
  assert.match(calls.search[0].publishedAfter, /^\d{4}-/);
  assert.equal(calls.videos.length, 1, profileId);
  assert.equal(calls.videos[0].length, 50, profileId);
  assert.ok(calls.comments.length <= 2, profileId);
  assert.ok(calls.comments.every(({ maxResults, pageToken }) => maxResults === 100 && !pageToken), 'only newest first page');
  assert.ok(result.estimatedQuotaUnits <= 103, profileId);
  assert.equal(result.estimatedQuotaUnits, 101 + calls.comments.length, profileId);
  assert.equal(result.candidates, 50, profileId);
  assert.ok(result.topical >= 0 && result.topical <= 50, profileId);
  assert.ok(result.helpRequests <= result.sampledComments && result.good + result.best <= result.sampledComments);
}
await assert.rejects(() => checkVolume({ profileId: 'not_a_card', youtubeClient: {} }), { status: 400 });
await assert.rejects(() => checkVolume({ profileId: 'ai_tools', daysBack: 10000, youtubeClient: {} }), { status: 400 });
let failedCalls = 0;
const failure = await checkVolume({ profileId: 'ai_tools', youtubeClient: { async searchVideos() { failedCalls++; throw new Error('local failure'); } } });
assert.equal(failedCalls, 1);
assert.equal(failure.estimatedQuotaUnits, 100);
assert.equal(failure.errors.length, 1);
assert.equal(queryTopicFit({ title: 'Guitar pedals beginners', query: 'best AI tools for affiliate marketing' }), false, 'unrelated popular video is not topically fit');
assert.equal(queryTopicFit({ title: 'Paid traffic tools', query: 'best AI tools for affiliate marketing' }), false, 'AI does not substring-match paid');
for (const [id, profile] of Object.entries(NICHE_PROFILES)) {
  assert.equal(queryTopicFit({ title: 'Guitar pedals beginners', description: 'Affiliate marketing links below', query: profile.queries[0] }), false, `${id} first query rejects unrelated video despite affiliate boilerplate`);
  assert.equal(queryTopicFit({ title: profile.queries[0], query: profile.queries[0] }), true, `${id} first query accepts on-topic video`);
}
assert.equal(queryTopicFit({ title: 'Affiliate marketing for beginners', query: NICHE_PROFILES.affiliate_marketing.queries[0] }), true, 'broad affiliate query still accepts relevant guide');
assert.equal(queryTopicFit({ title: 'Guitar pedals beginners', query: NICHE_PROFILES.affiliate_marketing.queries[0] }), false, 'broad affiliate query cannot match unrelated high-comment videos');

// Two diverse searches, dedupe, topical filter, one metadata lookup and early stop.
const efficiency = { searches: [], lookups: [] };
const client = {
  async searchVideos({ query, maxResults }) {
    efficiency.searches.push({ query, maxResults });
    const start = query === 'affiliate funnel setup' ? 0 : 15;
    return { items: Array.from({ length: 50 }, (_, i) => ({ id: { videoId: `x${String(start + i).padStart(10, '0')}` }, snippet: { title: i < 3 ? 'Guitar pedals for beginners' : query } })) };
  },
  async listVideos(ids) {
    efficiency.lookups.push(ids);
    return { items: ids.map((id) => ({ id, snippet: { title: 'Affiliate funnel setup for beginners' }, statistics: { commentCount: '80' } })) };
  },
};
const picked = await selectNicheVideos({ youtubeClient: client, queries: ['affiliate funnel setup', 'affiliate funnel ideas', 'third query', 'fourth query', 'fifth query'], maxVideos: 10, profileId: 'affiliate_funnels' });
assert.equal(efficiency.searches.length, 2, 'enough quality candidates stop after two query angles');
assert.ok(efficiency.searches.every((call) => call.maxResults === 50));
assert.equal(efficiency.lookups.length, 1, 'one metadata batch for sufficient pool');
assert.ok(efficiency.lookups[0].length <= 50);
assert.equal(picked.videos.length, 10);
assert.ok(picked.videos.every(({ title }) => !title.includes('Guitar')));
assert.equal(picked.estimatedSearchQuotaUnits + picked.estimatedRankingQuotaUnits, 201);
assert.ok(picked.droppedVideos.some(({ reason }) => reason === 'off_topic'));
const thinCalls = { search: [], videos: [] };
const thinClient = {
  async searchVideos({ query, maxResults }) {
    thinCalls.search.push({ query, maxResults });
    return { items: Array.from({ length: 50 }, (_, i) => ({ id: { videoId: `${query}-${i}` }, snippet: { title: `${query} tutorial` } })) };
  },
  async listVideos(ids) {
    thinCalls.videos.push(ids);
    return { items: ids.map((id) => ({ id, snippet: { title: id }, statistics: { commentCount: id.startsWith('third') ? '80' : '3' } })) };
  },
};
const recovered = await selectNicheVideos({ youtubeClient: thinClient, queries: ['first topic', 'second topic', 'third topic', 'fourth topic'], maxVideos: 10, profileId: 'traffic_leads' });
assert.equal(thinCalls.search.length, 3, 'thin engagement triggers a third topical query');
assert.equal(thinCalls.videos.length, 2, 'thin pool requires a second cheap lookup');
assert.ok(thinCalls.videos.every((ids) => ids.length <= 50));
assert.equal(recovered.videos.length, 10);
assert.ok(recovered.videos.every(({ id }) => id.startsWith('third')));
assert.equal(recovered.estimatedSearchQuotaUnits + recovered.estimatedRankingQuotaUnits, 302);
console.log('Volume checks passed: 12 cards, 103-unit ceiling, read-only requests, failure diagnostics and two-angle search efficiency.');
