// Scan result completeness and fair comment budget. Offline: mock YouTube client, temp store.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonImportStore, createEmptyStore } from '../server/persistence/store.js';
import { scanNiche } from '../server/scan/scanNiche.js';
import { importYouTubeVideos } from '../server/import/importService.js';
import { buildRunSummary } from '../server/import/runSummary.js';
import { leadBucket, bucketCounts } from '../src/scoring/leadBuckets.js';

const NOISE = ['Thnx for help', 'Wrong title', "I can't find the link", 'Great video!', 'First!', 'lol', 'Nice', 'God bless you'];
const LEADS = ["I'm a stay at home mom with no experience, how do I get started?", 'Is this legit? How much does it cost to start?'];

function vid(n) { return `vid${String(n).padStart(8, '0')}`; }

/** Mock read-only client. commentsByVideo: { [videoId]: number of comments available }. */
function mockClient(commentsByVideo, { leadsPerVideo = 1 } = {}) {
  const calls = { commentThreads: [] };
  const ids = Object.keys(commentsByVideo);
  let searchOffset = 0;
  return {
    calls,
    async searchVideos({ maxResults }) {
      const page = ids.slice(searchOffset, searchOffset + maxResults);
      searchOffset += maxResults;
      return { items: page.map((id) => ({ id: { videoId: id }, snippet: { title: `Home business for beginners ${id}`, channelTitle: 'Ch' } })) };
    },
    async listVideos(videoIds) {
      return { items: videoIds.filter((id) => id in commentsByVideo).map((id) => ({ id, snippet: { title: `Home business for beginners ${id}`, channelId: `owner_${id}`, channelTitle: 'Ch', publishedAt: '2026-11-01T00:00:00Z' }, statistics: { commentCount: String(Math.max(commentsByVideo[id], 10)) }, status: { privacyStatus: 'public' } })) };
    },
    async listCommentThreads({ videoId, pageToken, maxResults }) {
      calls.commentThreads.push({ videoId, pageToken, maxResults });
      const total = commentsByVideo[videoId];
      const start = Number(pageToken || 0);
      const end = Math.min(total, start + maxResults);
      const items = [];
      for (let i = start; i < end; i += 1) {
        const text = i < leadsPerVideo ? LEADS[i % LEADS.length] : NOISE[i % NOISE.length];
        items.push({ id: `t_${videoId}_${i}`, snippet: { videoId, totalReplyCount: 0, topLevelComment: { id: `c_${videoId}_${i}`, snippet: { authorDisplayName: `User ${i}`, authorChannelId: { value: `u${i}` }, textOriginal: text, likeCount: 0, publishedAt: '2026-11-10T00:00:00Z' } } } });
      }
      return { items, nextPageToken: end < total ? String(end) : undefined };
    },
  };
}

const tempDir = await mkdtemp(join(tmpdir(), 'scan-results-'));
try {
  // (a) A store already holding 600 high-scoring opportunities from older scans must not
  // crowd out this scan's low-scoring comments.
  {
    const filePath = join(tempDir, 'big-store.json');
    const store = new JsonImportStore({ filePath });
    const seed = createEmptyStore();
    for (let i = 0; i < 600; i += 1) {
      const videoId = `yt_video_old${String(i % 20).padStart(8, '0')}`;
      seed.videos[videoId] = { id: videoId, youtubeVideoId: `old${String(i % 20).padStart(8, '0')}`, title: 'Old video' };
      seed.comments[`old_c_${i}`] = { id: `old_c_${i}`, videoId, textOriginal: 'old high scorer' };
      seed.opportunities[`opp_old_${i}`] = { id: `opp_old_${i}`, videoId, commentId: `old_c_${i}`, overallScore: 90 + (i % 10), opportunityType: 'niche_lead', status: 'new' };
    }
    await store.save(seed);

    const client = mockClient({ [vid(1)]: 25, [vid(2)]: 25, [vid(3)]: 25, [vid(4)]: 25, [vid(5)]: 25 });
    const result = await scanNiche({ body: { profileId: 'work_from_home', maxVideos: 5, maxCommentsPerRun: 100, maxResultsPerPage: 100, maxPagesPerVideo: 1 }, store, youtubeClient: client });
    assert.equal(result.run.commentsFetched, 100, 'scanned 100 comments');
    assert.equal(result.items.length, 100, `all 100 current-scan comments returned, got ${result.items.length}`);
    assert.ok(result.items.every((item) => !item.id.startsWith('opp_old_')), 'no older-scan items leak into this scan');
    assert.equal(result.summary.fetched, 100);
    assert.equal(result.summary.kept, 100);
    assert.equal(result.summary.notShown, 0, 'Not shown is 0');
    assert.equal(result.summary.best + result.summary.maybe + result.summary.notFit + result.summary.done, 100, 'buckets add up');
    assert.equal(result.summary.best, 5, `one lead per video, got ${result.summary.best}`);
    assert.equal(result.summary.notFit, 95);
    assert.equal(result.summary.headline, '5 leads + 95 low fit');
    assert.equal(result.summary.perVideo.length, 5);
    assert.ok(result.summary.perVideo.every((v) => v.fetched === 20 && v.kept === 20), 'fair share of 20 each');

    // The saved run reloads with the same items (Previous Scans path) and full quota.
    const reloaded = await store.listOpportunitiesForRun(result.run.id);
    assert.equal(reloaded.items.length, 100);
    assert.equal(reloaded.run.estimatedQuotaUnits, result.run.estimatedQuotaUnits, 'scan-level quota persisted');
    assert.ok(reloaded.run.title, 'scan title persisted');
  }

  // (b) Uneven comment counts: early videos must not eat the whole budget, and unused
  // share rolls forward.
  {
    const store = new JsonImportStore({ filePath: join(tempDir, 'budget-store.json') });
    const counts = { [vid(11)]: 200, [vid(12)]: 5, [vid(13)]: 200 };
    const client = mockClient(counts);
    const run = await importYouTubeVideos({ inputs: Object.keys(counts), options: { profileId: 'side_hustles', maxCommentsPerRun: 90, maxResultsPerPage: 50, maxPagesPerVideo: 3 }, store, youtubeClient: client, metadata: { scanType: 'niche', profileId: 'side_hustles' } });
    const byVideo = Object.fromEntries(run.videoResults.map((v) => [v.youtubeVideoId, v]));
    assert.equal(byVideo[vid(11)].fetched, 30, `first video gets ceil(90/3)=30, got ${byVideo[vid(11)].fetched}`);
    assert.equal(byVideo[vid(12)].fetched, 5, 'small video uses only what it has');
    assert.equal(byVideo[vid(13)].fetched, 55, `unused share rolls forward to the last video, got ${byVideo[vid(13)].fetched}`);
    assert.equal(run.commentsFetched, 90, 'total respects the run cap');
    assert.equal(run.opportunitiesKept, 90);
    assert.equal(byVideo[vid(11)].moreOnYouTube, true, 'flags that more comments exist');
    assert.ok(client.calls.commentThreads.every((call) => call.maxResults <= 50), 'never asks for more than a page');
    assert.equal(client.calls.commentThreads.filter((call) => call.videoId === vid(11)).length, 1, 'stops paging once the share is filled');
    assert.equal(run.commentsCapped, 0, 'requests are sized to the share, so nothing is fetched and thrown away');

    // Cap above IMPORT_LIMITS is clamped to 300.
    const big = { [vid(21)]: 400, [vid(22)]: 400 };
    const bigRun = await importYouTubeVideos({ inputs: Object.keys(big), options: { profileId: 'side_hustles', maxCommentsPerRun: 5000, maxResultsPerPage: 100, maxPagesPerVideo: 3 }, store, youtubeClient: mockClient(big), metadata: { scanType: 'niche', profileId: 'side_hustles' } });
    assert.equal(bigRun.commentsFetched, 300, 'IMPORT_LIMITS.maxCommentsPerRun still applies');
    assert.deepEqual(bigRun.videoResults.map((v) => v.fetched), [150, 150]);
  }

  // Duplicates within a run (same comment returned twice) are counted, not silently lost.
  {
    const store = new JsonImportStore({ filePath: join(tempDir, 'dup-store.json') });
    const base = mockClient({ [vid(31)]: 10 });
    const dupClient = { ...base, async listCommentThreads(args) { const page = await base.listCommentThreads(args); return { ...page, items: [...page.items, page.items[0]] }; } };
    const run = await importYouTubeVideos({ inputs: [vid(31)], options: { profileId: 'biz_opp', maxCommentsPerRun: 50, maxResultsPerPage: 50 }, store, youtubeClient: dupClient, metadata: { scanType: 'niche', profileId: 'biz_opp' } });
    assert.equal(run.commentsFetched, 11);
    assert.equal(run.commentsDuplicate, 1);
    assert.equal(run.opportunitiesKept, 10);
    const result = await store.listOpportunitiesForRun(run.id);
    const summary = buildRunSummary(run, result.items, { total: result.total });
    assert.equal(summary.notShown, 1, 'one fetched repeat does not become a second result');
    assert.equal(summary.overDisplayLimit, 0, 'all ten unique opportunities are visible');
    assert.equal(summary.skipped, 1, 'duplicate is accounted for as skipped');
  }

  // Shared bucket rule.
  assert.equal(leadBucket({ opportunityType: 'niche_lead', overallScore: 50 }), 'best');
  assert.equal(leadBucket({ opportunityType: 'niche_lead', overallScore: 70, riskLevel: 'high' }), 'maybe');
  assert.equal(leadBucket({ opportunityType: 'consumer_buyer_question', overallScore: 30 }), 'maybe');
  assert.equal(leadBucket({ opportunityType: 'low_fit_comment', overallScore: 10 }), 'not_fit');
  assert.equal(leadBucket({ opportunityType: 'niche_lead', status: 'replied' }), 'done');
  assert.equal(bucketCounts([{ opportunityType: 'niche_lead' }, { opportunityType: 'low_fit_comment' }]).headline, '1 lead + 1 low fit');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Scan result checks passed: no cut-off with a 600-item store, fair per-video budget with roll-forward, duplicate accounting, honest summary.');
