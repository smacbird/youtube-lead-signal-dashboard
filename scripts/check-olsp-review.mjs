import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { olspVideoMatch, olspCommentMatch, olspReviewFor } from '../server/youtube/olspReview.js';
import { JsonImportStore, createEmptyStore } from '../server/persistence/store.js';
import { importYouTubeVideos } from '../server/import/importService.js';
import { scanNiche } from '../server/scan/scanNiche.js';
import { exportOpportunitiesCsv, getOlspReview, normaliseImportedOpportunity } from '../src/ui/helpers.ts';

for (const domain of ['olspacademy.com', 'olsplink.com', 'olspsystem.com']) {
  for (const text of [`https://${domain}/join?src=yt`, `HTTPS://go.${domain.toUpperCase()}:443/path?x=y`, `More at ${domain}`]) {
    assert.equal(olspVideoMatch({ description: text })?.indicator, domain, text);
  }
  for (const text of [`not${domain}`, `${domain}.evil.com`, `${domain.replace('.com', '.community')}`, `my-${domain}`]) {
    assert.equal(olspVideoMatch({ description: text }), null, `lookalike: ${text}`);
  }
}
for (const phrase of ['OLSP Academy', 'olsp system', 'OlSp Link', 'See OLSP today'])
  assert.equal(olspVideoMatch({ title: phrase })?.kind, 'brand', phrase);
assert.equal(olspVideoMatch({ title: 'HOLSP and OLSPacademy' }), null, 'no substring brand match');
assert.equal(olspVideoMatch({ channelName: 'OLSP Academy' })?.scope, 'source');
assert.equal(olspCommentMatch({ textOriginal: 'Is OLSP for beginners?' })?.scope, 'comment');
const combined = olspReviewFor({ description: 'https://go.olsplink.com/start' }, { textOriginal: 'I joined OLSP Academy' });
assert.equal(combined.flagged, true);
assert.match(combined.reason, /Source video description: go\.olsplink\.com/);
assert.match(combined.reason, /Comment text: OLSP Academy/);
assert.equal(olspReviewFor({ title: 'Not a brand' }, { textOriginal: 'Getting started?' }), null);

const tempDir = await mkdtemp(join(tmpdir(), 'olsp-review-'));
try {
  const store = new JsonImportStore({ filePath: join(tempDir, 'store.json') });
  const videos = {
    abcdefghijk: { id: 'abcdefghijk', snippet: { title: 'Getting started in affiliate marketing', channelTitle: 'Market Research', description: 'See https://go.olspacademy.com/join?campaign=a', channelId: 'owner' }, statistics: { commentCount: '2' } },
    lmnopqrstuv: { id: 'lmnopqrstuv', snippet: { title: 'Getting started in affiliate marketing', channelTitle: 'Market Research', description: '', channelId: 'owner' }, statistics: { commentCount: '2' } },
  };
  const texts = ["How do I get started? I have no experience.", 'How does OLSP System work for beginners?'];
  const client = {
    async listVideos(ids) { return { items: ids.map((id) => videos[id]) }; },
    async listCommentThreads({ videoId }) { return { items: texts.map((text, index) => ({ id: `thread-${videoId}-${index}`, snippet: { topLevelComment: { id: `${videoId}-${index}`, snippet: { textOriginal: text, authorDisplayName: `User ${index}`, publishedAt: '2026-11-10T00:00:00Z' } } } })) }; },
    async searchVideos() { return { items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: videos.abcdefghijk.snippet.title } }] }; },
  };
  const cleanRun = await importYouTubeVideos({ inputs: ['lmnopqrstuv'], store, youtubeClient: client, options: { maxCommentsPerRun: 2 } });
  const flaggedRun = await importYouTubeVideos({ inputs: ['abcdefghijk'], store, youtubeClient: client, options: { maxCommentsPerRun: 2 } });
  assert.equal(cleanRun.commentsFetched, 2);
  assert.equal(flaggedRun.commentsFetched, 2, 'source match must not suppress comments');
  assert.equal(flaggedRun.opportunityIds.length, 2);
  const [cleanItems, flaggedItems] = await Promise.all([store.listOpportunitiesForRun(cleanRun.id), store.listOpportunitiesForRun(flaggedRun.id)]);
  for (const flagged of flaggedItems.items) {
    const baseline = cleanItems.items.find((item) => item.comment.textOriginal === flagged.comment.textOriginal);
    assert.ok(baseline);
    for (const key of ['overallScore', 'priority', 'riskLevel', 'recommendedAction', 'leadFit', 'opportunityType'])
      assert.deepEqual(flagged[key], baseline[key], `OLSP must not change ${key}`);
    assert.equal(flagged.olspReview.flagged, true);
    assert.ok(flagged.olspReview.source);
    assert.equal(Boolean(flagged.olspReview.comment), flagged.comment.textOriginal.includes('OLSP'));
    assert.equal(getOlspReview(normaliseImportedOpportunity(flagged)).flagged, true, 'saved API result renders flag');
  }
  const persisted = await store.load();
  assert.ok(persisted.videos.yt_video_abcdefghijk.olspReview);
  assert.ok(persisted.comments['yt_comment_abcdefghijk-1'].olspReview);
  assert.ok(persisted.opportunities['opp_yt_comment_abcdefghijk-0'].olspReview);
  const legacyStore = createEmptyStore();
  legacyStore.videos.legacyVideo = { id: 'legacyVideo', title: 'OLSP Link launch' };
  legacyStore.comments.legacyComment = { id: 'legacyComment', textOriginal: 'How do I start?' };
  legacyStore.opportunities.legacyOpportunity = { id: 'legacyOpportunity', videoId: 'legacyVideo', commentId: 'legacyComment', overallScore: 77, recommendedAction: 'reply' };
  legacyStore.importRuns.legacyRun = { id: 'legacyRun', opportunityIds: ['legacyOpportunity'] };
  await store.save(legacyStore);
  const before = await readFile(store.filePath, 'utf8');
  const legacy = (await store.listOpportunitiesForRun('legacyRun')).items[0];
  assert.equal(legacy.olspReview?.source?.indicator, 'OLSP Link');
  assert.equal(legacy.overallScore, 77);
  assert.equal(legacy.recommendedAction, 'reply');
  assert.equal((await readFile(store.filePath, 'utf8')), before, 'hydration leaves historical records untouched');
  assert.match(getOlspReview(normaliseImportedOpportunity(legacy)).reason, /Source video title: OLSP Link/);
  const blobCalls = [];
  URL.createObjectURL = (blob) => { blobCalls.push(blob); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) };
  exportOpportunitiesCsv([normaliseImportedOpportunity(legacy)], {});
  const csv = await blobCalls[0].text();
  assert.match(csv, /olsp_review,olsp_reason/);
  assert.match(csv, /OLSP: review,Source video title: OLSP Link/);
  const scanStore = new JsonImportStore({ filePath: join(tempDir, 'scan.json') });
  const scanned = await scanNiche({ body: { profileId: 'affiliate_marketing', queries: ['affiliate'], maxVideos: 1, maxCommentsPerRun: 2 }, store: scanStore, youtubeClient: client });
  assert.equal(scanned.items.length, 2, 'normal niche scan keeps both comments');
  assert.ok(scanned.items.every((item) => item.olspReview?.source));
  console.log('OLSP review checks passed: exact domains, lookalikes, source/comment evidence, unchanged scores/actions, imports, scans, legacy reload and CSV.');
} finally { await rm(tempDir, { recursive: true, force: true }); }
