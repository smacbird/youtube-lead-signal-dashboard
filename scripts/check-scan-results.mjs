// Scan result completeness and fair comment budget. Offline: mock YouTube client, temp store.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonImportStore, createEmptyStore } from '../server/persistence/store.js';
import { nicheScanResponseStatus, scanNiche } from '../server/scan/scanNiche.js';
import { summarizeCandidateSelection } from '../server/scan/candidateDiagnostics.js';
import { importYouTubeVideos } from '../server/import/importService.js';
import { buildRunSummary } from '../server/import/runSummary.js';
import { leadBucket, bucketCounts } from '../src/scoring/leadBuckets.js';
import { estimateScanQuota, SCAN_PRESETS } from '../src/ui/scanPresets.js';
import { buildScanSummary } from '../src/ui/helpers.ts';
import { rankCandidateVideos } from '../server/youtube/videoRanking.js';

const NOISE = ['Thnx for help', 'Wrong title', "I can't find the link", 'Great video!', 'First!', 'lol', 'Nice', 'God bless you'];
const LEADS = ["I'm a stay at home mom with no experience, how do I get started?", 'Is this legit? How much does it cost to start?'];

function vid(n) { return `vid${String(n).padStart(8, '0')}`; }

/** Mock read-only client. commentsByVideo: { [videoId]: number of comments available }. */
function mockClient(commentsByVideo, { leadsPerVideo = 1, disabledIds = [] } = {}) {
  const calls = { commentThreads: [], videos: 0, searches: 0 };
  const ids = Object.keys(commentsByVideo);
  let searchOffset = 0;
  return {
    calls,
    async searchVideos({ maxResults }) {
      calls.searches += 1;
      const page = ids.slice(searchOffset, searchOffset + maxResults);
      searchOffset += maxResults;
      return { items: page.map((id) => ({ id: { videoId: id }, snippet: { title: `Home business for beginners ${id}`, channelTitle: 'Ch' } })) };
    },
    async listVideos(videoIds) {
      calls.videos += 1;
      return { items: videoIds.filter((id) => id in commentsByVideo).map((id) => ({ id, snippet: { title: `Home business for beginners ${id}`, channelId: `owner_${id}`, channelTitle: 'Ch', publishedAt: '2026-11-01T00:00:00Z' }, statistics: { commentCount: String(Math.max(commentsByVideo[id], 10)) }, status: { privacyStatus: 'public' } })) };
    },
    async listCommentThreads({ videoId, pageToken, maxResults }) {
      calls.commentThreads.push({ videoId, pageToken, maxResults });
      if (disabledIds.includes(videoId)) throw Object.assign(new Error('Comments are disabled for this video.'), { code: 'commentsDisabled' });
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

// Compact accounting includes every dropped candidate, but never entire metadata
// or commenters; titles are capped and React will render them as ordinary text.
const diagnosticFixture = summarizeCandidateSelection({
  candidatesConsidered: 7,
  videos: [{ id: 'selected' }],
  droppedVideos: [
    ...Array.from({ length: 4 }, (_, i) => ({ reason: 'off_topic', title: i === 0 ? '<script>alert(1)</script>' : `Off topic ${i}`, commenter: 'private commenter' })),
    { reason: 'too_few_comments', title: 'A'.repeat(300) },
    { reason: 'ranked_below_cutoff', title: 'Qualified but below limit' },
  ],
});
assert.deepEqual([diagnosticFixture.considered, diagnosticFixture.selected, diagnosticFixture.dropped], [7, 1, 6]);
assert.deepEqual(diagnosticFixture.reasons.map(({ reason, count }) => [reason, count]), [['off_topic', 4], ['too_few_comments', 1], ['ranked_below_cutoff', 1]]);
assert.equal(diagnosticFixture.reasons[0].titles.length, 3, 'no more than three sample titles per reason');
assert.equal(diagnosticFixture.reasons[1].titles[0].length, 140, 'saved titles are bounded');
assert.equal(diagnosticFixture.reasons[0].titles[0], '<script>alert(1)</script>', 'title is text, not HTML markup');
assert.ok(!JSON.stringify(diagnosticFixture).includes('private commenter'), 'never store commenter fields in diagnostics');
assert.equal(summarizeCandidateSelection({ candidatesConsidered: 0, videos: [], droppedVideos: [] }).dropped, 0, 'zero candidates are recorded, not missing');
assert.throws(() => summarizeCandidateSelection({ candidatesConsidered: 2, videos: [], droppedVideos: [] }), /candidate_accounting_mismatch/, 'no silent missing candidate counts');
const manyReasons = summarizeCandidateSelection({ candidatesConsidered: 20, videos: [], droppedVideos: Array.from({ length: 20 }, (_, i) => ({ reason: `reason_${i}`, title: `Example ${i}` })) });
assert.ok(manyReasons.reasons.length <= 9, 'run-level groups remain bounded');
assert.equal(manyReasons.reasons.reduce((sum, group) => sum + group.count, 0), 20, 'overflow still counted');
const noStatsCandidates = Array.from({ length: 4 }, (_, i) => ({ id: `v${i}`, title: `Video ${i}` }));
const noStatsRanking = rankCandidateVideos(noStatsCandidates, null, { maxVideos: 2, profileId: 'work_from_home' });
assert.deepEqual(noStatsRanking.selected.map(({ id }) => id), ['v0', 'v1'], 'other-profile search-order fallback unchanged');
assert.deepEqual(noStatsRanking.dropped.map(({ reason }) => reason), ['search_order_limit', 'search_order_limit'], 'unselected fallback candidates accounted for');

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
    assert.equal(result.summary.headline, '5 leads + 95 not a fit');
    assert.equal(result.summary.perVideo.length, 5);
    assert.equal(client.calls.videos, 1, 'ranking metadata reused for import: one videos.list call');
    assert.equal(result.run.estimatedQuotaUnits, client.calls.searches * 100 + client.calls.videos + client.calls.commentThreads.length, 'quota equals searches x 100 + video metadata + comment pages');
    const quickEstimate = estimateScanQuota({ videos: SCAN_PRESETS[0].videos, comments: SCAN_PRESETS[0].comments, queryCount: 6 });
    assert.ok(result.run.estimatedQuotaUnits >= quickEstimate.low && result.run.estimatedQuotaUnits <= quickEstimate.high, 'UI estimate brackets the actual one-lookup scan');
    assert.ok(result.summary.perVideo.every((v) => v.fetched === 20 && v.kept === 20), 'fair share of 20 each');

    // Saved-scan list carries this run's own lead counts (old runs without ids get null).
    const runs = await store.listImportRuns({ limit: 10 });
    const listed = runs.find((run) => run.id === result.run.id);
    assert.deepEqual(listed.leadCounts, { best: 5, maybe: 0, not_fit: 95, done: 0 }, 'saved-scan list shows this run’s lead counts');

    // The saved run reloads with the same items (Previous Scans path) and full quota.
    const reloaded = await store.listOpportunitiesForRun(result.run.id);
    assert.equal(reloaded.items.length, 100);
    assert.equal(reloaded.run.estimatedQuotaUnits, result.run.estimatedQuotaUnits, 'scan-level quota persisted');
    assert.ok(reloaded.run.title, 'scan title persisted');
  }

  // A niche scan persists bounded candidate diagnostics even with zero readable
  // comments; reopening the run uses those exact counts without another API call.
  {
    const store = new JsonImportStore({ filePath: join(tempDir, 'diagnostics-store.json') });
    const candidates = [
      [vid(71), 'Affiliate links get clicks but no sales', 3],
      [vid(72), 'Improve affiliate conversion rate', 5],
      [vid(73), 'Affiliate links not converting: zero commissions', 3],
      [vid(74), 'Affiliate sales funnel conversion rate', 5],
      [vid(75), 'Why Your Affiliate Links Get No Clicks (The Fix)', 9000],
      [vid(76), 'Affiliate links not converting', 2],
    ];
    const calls = { searches: 0, videos: 0, comments: 0 };
    const client = {
      async searchVideos() { calls.searches += 1; return { items: candidates.map(([id, title]) => ({ id: { videoId: id }, snippet: { title } })) }; },
      async listVideos(ids) {
        calls.videos += 1;
        return { items: ids.map((id) => { const row = candidates.find(([candidateId]) => candidateId === id); return { id, snippet: { title: row[1] }, statistics: { commentCount: String(row[2]) } }; }) };
      },
      async listCommentThreads() { calls.comments += 1; return { items: [] }; },
    };
    const result = await scanNiche({ body: { profileId: 'clicks_no_sales', queries: ['affiliate conversion'], maxVideos: 3, maxCommentsPerRun: 25 }, store, youtubeClient: client });
    const diag = result.summary.candidateDiagnostics;
    assert.deepEqual([diag.considered, diag.selected, diag.dropped], [6, 3, 3]);
    assert.deepEqual(diag.reasons.map(({ reason, count }) => [reason, count]), [['off_topic', 1], ['too_few_comments', 1], ['ranked_below_cutoff', 1]]);
    assert.equal(diag.reasons.reduce((sum, group) => sum + group.count, 0) + diag.selected, diag.considered);
    assert.deepEqual(calls, { searches: 1, videos: 1, comments: 3 }, 'diagnostics add no YouTube calls');
    assert.equal(result.run.estimatedQuotaUnits, 104, 'quota remains search + one metadata lookup + selected comment pages');
    const beforeRead = await readFile(store.filePath, 'utf8');
    const saved = await store.listOpportunitiesForRun(result.run.id);
    assert.deepEqual(saved.run.candidateDiagnostics, diag, 'small diagnostics persisted on the run');
    assert.deepEqual(buildScanSummary('previous', [], { run: saved.run, summary: buildRunSummary(saved.run, saved.items) }).candidateDiagnostics, diag, 'saved-scan UI recovers diagnostic counts');
    assert.equal(await readFile(store.filePath, 'utf8'), beforeRead, 'opening saved run does not rewrite history');
  }

  // A no-qualified-video scan reports zero and its drop reason, not fabricated
  // zero counts or a generic importer error; no comment pages are requested.
  {
    const store = new JsonImportStore({ filePath: join(tempDir, 'empty-diagnostics-store.json') });
    const client = {
      async searchVideos() { return { items: [{ id: { videoId: vid(81) }, snippet: { title: 'Why Your Affiliate Links Get No Clicks (The Fix)' } }] }; },
      async listVideos() { return { items: [{ id: vid(81), snippet: { title: 'Why Your Affiliate Links Get No Clicks (The Fix)' }, statistics: { commentCount: '9000' } }] }; },
      async listCommentThreads() { throw new Error('no comments should be requested'); },
    };
    const result = await scanNiche({ body: { profileId: 'clicks_no_sales', queries: ['affiliate conversion'], maxVideos: 1 }, store, youtubeClient: client });
    assert.deepEqual(result.summary.candidateDiagnostics, { considered: 1, selected: 0, dropped: 1, reasons: [{ reason: 'off_topic', count: 1, titles: ['Why Your Affiliate Links Get No Clicks (The Fix)'] }] });
    assert.equal(nicheScanResponseStatus(result), 200, 'expected zero-result scan renders diagnostics rather than a generic error');
    assert.equal(result.run.status, 'succeeded', 'healthy search with no qualified videos is not mislabelled Failed');
    assert.ok(!result.run.errors.some(({ code }) => code === 'no_valid_video_ids'), 'empty importer detail does not masquerade as scan error');
    const saved = await store.listOpportunitiesForRun(result.run.id);
    assert.deepEqual(saved.run.candidateDiagnostics, result.summary.candidateDiagnostics);
    assert.equal(saved.run.status, 'succeeded', 'saved empty scan shows Finished');
    assert.equal(buildScanSummary('previous', [], { run: saved.run, summary: buildRunSummary(saved.run, []) }).candidateDiagnostics?.selected, 0, 'saved zero is distinct from not recorded');
    const oldRun = { metadata: { scanType: 'niche' }, title: 'Old scan' };
    const oldSummary = buildScanSummary('previous', [], { run: oldRun, summary: buildRunSummary(oldRun, []) });
    assert.equal(oldSummary.candidateDiagnostics, null);
    assert.equal(oldSummary.candidateDiagnosticsNotRecorded, true, 'historical scan shows not recorded rather than false zeros');
    assert.equal(buildScanSummary('previous', [], { run: { metadata: { scanType: 'manual' } } }).candidateDiagnosticsNotRecorded, false, 'manual import has no candidate selection');
  }

  // Ranking's commentCount can include replies or be stale: ten videos can all report
  // 10+ comments while only four return readable top-level threads. Backfill earlier
  // readable videos, but do not claim the scan reached 200 when only 157 exist.
  {
    const store = new JsonImportStore({ filePath: join(tempDir, 'sparse-store.json') });
    const counts = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [vid(40 + i), i < 4 ? (i === 0 ? 40 : 39) : 0]));
    const client = mockClient(counts, { disabledIds: [vid(49)] });
    const result = await scanNiche({ body: { profileId: 'work_from_home', maxVideos: 10, maxCommentsPerRun: 200 }, store, youtubeClient: client });
    assert.equal(result.videosFound.length, 10);
    assert.equal(result.run.commentsFetched, 157, 'reads every available comment after returning unused budget to four readable videos');
    assert.equal(result.summary.perVideo.filter((video) => video.fetched > 0).length, 4, 'reports four readable videos out of ten selected');
    assert.equal(result.summary.perVideo.filter((video) => video.fetched === 0).length, 6);
    assert.ok(result.summary.perVideo.filter((video) => video.fetched === 0).every((video) => video.stoppedBy === 'no_more_comments' || video.error === 'commentsDisabled'), 'zero-comment videos have an explicit stop reason');
    assert.equal(result.run.status, 'completed_with_errors', 'comments disabled is reported without losing other videos');
    assert.equal(client.calls.videos, 1);
    assert.ok(result.run.videoResults.every((video) => video.pages <= 3), 'backfill never exceeds three pages per video');
    assert.equal(result.run.estimatedQuotaUnits, client.calls.searches * 100 + client.calls.videos + client.calls.commentThreads.length);
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

  // Exact run membership: overlapping imports of one video share old comments, while
  // new comments belong only to the second run. Deleting one never removes the other.
  {
    const store = new JsonImportStore({ filePath: join(tempDir, 'overlap-store.json') });
    const videoId = vid(51);
    const first = await importYouTubeVideos({ inputs: [videoId], options: { maxCommentsPerRun: 20 }, store, youtubeClient: mockClient({ [videoId]: 10 }) });
    const second = await importYouTubeVideos({ inputs: [videoId], options: { maxCommentsPerRun: 20 }, store, youtubeClient: mockClient({ [videoId]: 15 }) });
    assert.deepEqual([first.opportunityIds.length, first.commentIds.length, first.videoIds.length], [10, 10, 1]);
    assert.deepEqual([second.opportunityIds.length, second.commentIds.length, second.videoIds.length], [15, 15, 1]);
    const removedFirst = await store.deleteImportRun(first.id);
    assert.equal(removedFirst.deleted, true);
    assert.equal(removedFirst.removed.opportunities, 0, 'the second run still references all first-run comments');
    assert.equal((await store.listOpportunitiesForRun(second.id)).items.length, 15);
    const removedSecond = await store.deleteImportRun(second.id);
    assert.deepEqual([removedSecond.removed.opportunities, removedSecond.removed.comments, removedSecond.removed.videos], [15, 15, 1]);
    assert.equal((await store.listOpportunities()).length, 0);
  }

  // Legacy runs cannot be deleted by guessing all records on a video; if an exact new run
  // shares a legacy video's id, preserve its data and explicitly report incomplete cleanup.
  {
    const store = new JsonImportStore({ filePath: join(tempDir, 'legacy-store.json') });
    const videoId = vid(61);
    const current = await importYouTubeVideos({ inputs: [videoId], store, youtubeClient: mockClient({ [videoId]: 3 }) });
    await store.mutate((data) => { data.importRuns.legacy = { id: 'legacy', requestedVideoIds: [videoId], startedAt: '2025-01-01' }; });
    const legacy = await store.deleteImportRun('legacy');
    assert.equal(legacy.deleted, false);
    assert.equal(legacy.code, 'legacy_run_membership_unknown');
    assert.equal((await store.getImportRun('legacy')).id, 'legacy');
    const removedCurrent = await store.deleteImportRun(current.id);
    assert.equal(removedCurrent.deleted, true);
    assert.equal(removedCurrent.incomplete, true);
    assert.equal(removedCurrent.removed.opportunities, 0, 'legacy overlap leaves shared records intact');
    assert.equal((await store.listOpportunities()).length, 3);
  }

  // Shared bucket rule.
  assert.equal(leadBucket({ opportunityType: 'niche_lead', overallScore: 50 }), 'maybe');
  assert.equal(leadBucket({ opportunityType: 'niche_lead', overallScore: 85, leadFit: 'best' }), 'best');
  assert.equal(leadBucket({ opportunityType: 'niche_lead', overallScore: 70, riskLevel: 'high' }), 'maybe');
  assert.equal(leadBucket({ opportunityType: 'consumer_buyer_question', overallScore: 30 }), 'maybe');
  assert.equal(leadBucket({ opportunityType: 'low_fit_comment', overallScore: 10 }), 'not_fit');
  assert.equal(leadBucket({ opportunityType: 'niche_lead', status: 'replied' }), 'done');
  assert.equal(bucketCounts([{ opportunityType: 'niche_lead', overallScore: 85, leadFit: 'best' }, { opportunityType: 'low_fit_comment' }]).headline, '1 lead + 1 not a fit');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Scan result checks passed: no cut-off with a 600-item store, fair per-video budget with roll-forward, duplicate accounting, honest summary.');
