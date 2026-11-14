// Focused affiliate traffic selection checks. Only local mocks and a temporary store.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NICHE_PROFILES, listNicheProfiles } from '../server/youtube/nicheProfiles.js';
import { trafficLeadsFit, rankCandidateVideos, selectNicheVideos } from '../server/youtube/videoRanking.js';
import { checkVolume } from '../server/youtube/volumeCheck.js';
import { JsonImportStore } from '../server/persistence/store.js';
import { nicheScanResponseStatus, scanNiche } from '../server/scan/scanNiche.js';
import { estimateScanQuota } from '../src/ui/scanPresets.js';

const lineup = listNicheProfiles().map(({ id, label }) => [id, label]);
assert.equal(lineup.length, 12);
assert.deepEqual(lineup.find(([id]) => id === 'ai_tools'), ['ai_tools', 'AI Tools for Marketing']);
assert.equal(NICHE_PROFILES.traffic_leads.queries.length, 3);
assert.ok(NICHE_PROFILES.traffic_leads.queries.every((query) => /affiliate/.test(query)));
for (const title of [
  'How to get free traffic to your affiliate links as a beginner',
  'Affiliate marketing: grow your email list with organic traffic',
  'Affiliate link clicks and website visitors without paid ads',
]) assert.equal(trafficLeadsFit({ title }), true, title);
for (const title of [
  'n8n lead generation for agencies',
  'How to get agency clients for affiliate marketing lead gen',
  'How to find affiliate leads for B2B clients',
  'Affiliate marketing for businesses without websites: lead generation',
  'Businesses without websites: easy leads',
  'ChatGPT lead generation tutorial for beginners',
  'How to get traffic for a small business',
  'Affiliate marketing for beginners',
]) assert.equal(trafficLeadsFit({ title, description: 'Affiliate links in description' }), false, title);
const offAudience = { id: 'agency', title: 'Affiliate marketing lead generation for agency clients' };
const eligible = { id: 'publisher', title: 'Get traffic to affiliate links' };
const ranked = rankCandidateVideos([offAudience, eligible], new Map([
  ['agency', { title: offAudience.title, commentCount: 9000 }],
  ['publisher', { title: eligible.title, commentCount: 12 }],
]), { maxVideos: 2, profileId: 'traffic_leads' });
assert.deepEqual(ranked.selected.map(({ id }) => id), ['publisher'], 'metadata-stage gate rejects popular agency content');
assert.ok(ranked.dropped.some(({ reason }) => reason === 'off_topic'));
assert.equal(rankCandidateVideos([eligible], null, { maxVideos: 1, profileId: 'traffic_leads' }).selected.length, 0, 'without stats do not bypass comment floor');

let searchCount = 0; let metaCount = 0; let commentsCount = 0;
const thinClient = {
  async searchVideos({ query, maxResults }) {
    searchCount++;
    assert.equal(maxResults, 50);
    return { items: Array.from({ length: 20 }, (_, index) => ({ id: { videoId: `t${searchCount}${String(index).padStart(9, '0')}` }, snippet: {
      title: index % 2 ? `Affiliate marketing free traffic to affiliate links ${query}` : 'Agency clients with ChatGPT lead generation',
      description: 'Affiliate links in the description',
    } })) };
  },
  async listVideos(ids) {
    metaCount++;
    assert.ok(ids.length <= 50);
    return { items: ids.map((id) => ({ id, snippet: { title: 'Affiliate marketing free traffic to affiliate links' }, statistics: { commentCount: '4' } })) };
  },
  async listCommentThreads() { commentsCount++; throw new Error('must not read weak comments'); },
};
const selection = await selectNicheVideos({ youtubeClient: thinClient, queries: [...NICHE_PROFILES.traffic_leads.queries, 'extra ignored'], maxVideos: 10, profileId: 'traffic_leads' });
assert.equal(searchCount, 3, 'traffic scan cannot run fourth expensive search');
assert.ok(metaCount <= 2, 'metadata batches only after first two, then third query');
assert.equal(selection.estimatedSearchQuotaUnits, 300);
assert.ok(selection.estimatedSearchQuotaUnits + selection.estimatedRankingQuotaUnits <= 302);
assert.deepEqual(selection.videos, [], 'no sub-10-comment fallback');
assert.ok(selection.droppedVideos.some(({ reason }) => reason === 'too_few_comments'));
assert.ok(selection.droppedVideos.some(({ reason }) => reason === 'off_topic'));
assert.deepEqual(selection.searchErrors.map(({ code }) => code), ['no_eligible_traffic_videos']);
assert.equal(commentsCount, 0);
const estimate = estimateScanQuota({ videos: 10, comments: 200, profileId: 'traffic_leads', queryCount: 99 });
assert.equal(estimate.maxSearches, 3);
assert.equal(estimate.low, 211);
assert.equal(estimate.high, 332);

const tempDir = await mkdtemp(join(tmpdir(), 'traffic-leads-local-'));
try {
  const store = new JsonImportStore({ filePath: join(tempDir, 'store.json') });
  searchCount = 0; metaCount = 0;
  const result = await scanNiche({ body: { profileId: 'traffic_leads', maxVideos: 10, maxCommentsPerRun: 200 }, store, youtubeClient: thinClient });
  assert.equal(nicheScanResponseStatus(result), 200, 'healthy empty shortlist is not an API failure');
  assert.equal(result.run.status, 'succeeded', 'empty scan is finished, not failed');
  assert.ok(!result.run.errors.some(({ code }) => code === 'no_valid_video_ids'));
  assert.equal(result.run.errors.at(-1).code, 'no_eligible_traffic_videos');
  assert.deepEqual(result.videosFound, []);
  assert.deepEqual(result.items, []);
  assert.equal(result.run.commentsFetched, 0);
  assert.equal(commentsCount, 0, 'empty result must never import comments');
  assert.equal(result.estimatedSearchQuotaUnits, 300);
  assert.ok(result.run.estimatedQuotaUnits <= 302);
  assert.equal(result.candidateDiagnostics.selected, 0);
  assert.equal(result.candidateDiagnostics.considered, result.candidateDiagnostics.dropped);
  const saved = await store.listOpportunitiesForRun(result.run.id);
  assert.equal(saved.run.status, 'succeeded');
  assert.deepEqual(saved.items, []);
  assert.deepEqual(saved.run.candidateDiagnostics, result.candidateDiagnostics);

  const failedStore = new JsonImportStore({ filePath: join(tempDir, 'failed.json') });
  const badMetadata = {
    ...thinClient,
    async listVideos() { throw Object.assign(new Error('metadata unavailable'), { code: 'quotaExceeded' }); },
  };
  const failed = await scanNiche({ body: { profileId: 'traffic_leads', maxVideos: 10 }, store: failedStore, youtubeClient: badMetadata });
  assert.equal(failed.run.status, 'failed', 'metadata failure must not masquerade as a healthy empty pool');
  assert.equal(nicheScanResponseStatus(failed), 400);
  assert.ok(failed.searchErrors.some(({ code }) => code === 'video_ranking_failed'));
  assert.equal(commentsCount, 0);
} finally { await rm(tempDir, { recursive: true, force: true }); }

// Step-1 volume probe must use the same audience gate, not the generic query proxy.
const volume = await checkVolume({ profileId: 'traffic_leads', youtubeClient: {
  async searchVideos() { return { items: [{ id: { videoId: 'notaffiliate' }, snippet: { title: 'ChatGPT lead generation for agencies' } }] }; },
  async listVideos() { return { items: [{ id: 'notaffiliate', snippet: { title: 'ChatGPT lead generation for agencies' }, statistics: { commentCount: 9000 } }] }; },
  async listCommentThreads() { throw new Error('off-audience video must not be sampled'); },
} });
assert.equal(volume.topical, 0);
assert.equal(volume.sampledComments, 0);
console.log('Traffic lead checks passed: affiliate audience gate, 3-search/302-unit discovery cap, zero weak imports, persisted 200 diagnostics, metadata error 400 and volume alignment.');
