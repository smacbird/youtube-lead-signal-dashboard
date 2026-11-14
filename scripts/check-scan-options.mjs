// Shared scan options used by Step 2 and the sidebar. Pure, offline.
import assert from 'node:assert/strict';
import { estimateScanQuota } from '../src/ui/scanPresets.js';
import { defaultScanOptions, manualImportBody, nicheScanBody, scanOptionsSummary, withCommentCap, withDaysBack, withManualPages, withPreset } from '../src/ui/scanOptions.js';

let options = defaultScanOptions({ defaultScanDepth: 10, defaultFreshnessDays: 30 });
assert.deepEqual(options, { presetId: 'standard', daysBack: 30, commentCap: 200, manualPages: 2 });
assert.equal(defaultScanOptions({ defaultScanDepth: 99, defaultFreshnessDays: 45 }).presetId, 'quick', 'unknown depth falls back to Quick');
assert.equal(defaultScanOptions({ defaultFreshnessDays: 45 }).daysBack, 30, 'unknown age falls back to 30 days');
assert.equal(nicheScanBody(options, 'clicks_no_sales', 'Helpful').daysBack, 30, 'chosen 30 days stays 30; no silent profile override');
assert.equal(nicheScanBody(withDaysBack(options, 90), 'clicks_no_sales', 'Helpful').daysBack, 90, '90 days requires explicit choice');
const focusedQuota = estimateScanQuota({ videos: 10, comments: 200, queryCount: 6, profileId: 'clicks_no_sales' });
assert.deepEqual({ low: focusedQuota.low, high: focusedQuota.high, minSearches: focusedQuota.minSearches, maxSearches: focusedQuota.maxSearches }, { low: 111, high: 632, minSearches: 1, maxSearches: 6 }, 'Standard focused quota estimate accounts for 50 candidates and one metadata call');
assert.equal(estimateScanQuota({ videos: 10, comments: 200, queryCount: 6, profileId: 'work_from_home' }).low, 211, 'ordinary Standard checks two topical query angles before stopping');
assert.equal(estimateScanQuota({ videos: 10, comments: 200, queryCount: 6, profileId: 'work_from_home' }).high, 635, 'thin pool may use all six searches and five metadata batches');
assert.equal(estimateScanQuota({ videos: 5, comments: 100, queryCount: 6, profileId: 'clicks_no_sales' }).minSearches, 3, 'focused Quick can stop after three broad searches while retaining its 10-candidate cap');

// Sidebar "More options" changes are what the Step 2 button sends.
options = withDaysBack(options, 14);
options = withCommentCap(options, 150);
assert.equal(scanOptionsSummary(options), 'Videos from the last 14 days · up to 150 comments');
assert.deepEqual(nicheScanBody(options, 'work_from_home', 'Helpful'), { profileId: 'work_from_home', maxVideos: 10, daysBack: 14, replyTone: 'Helpful', maxCommentsPerRun: 150, maxResultsPerPage: 100 });

assert.equal(withDaysBack(options, 45).daysBack, 14, 'only listed video ages are accepted');
assert.equal(withCommentCap(options, 5000).commentCap, 300, 'cap clamps to 300');
assert.equal(withCommentCap(options, 3).commentCap, 25, 'cap clamps to 25');
assert.equal(withCommentCap(options, 'abc').commentCap, 200, 'bad input falls back to the size default');

const deep = withPreset(options, 'deep');
assert.equal(deep.commentCap, 300, 'choosing a size resets the cap to its default');
assert.equal(deep.daysBack, 14, 'choosing a size keeps the video age');
assert.equal(nicheScanBody(deep, 'side_hustles', 'x').maxVideos, 25);

// Advanced paste-links import uses the same cap and its own page setting.
const paged = withManualPages(options, 9);
assert.equal(paged.manualPages, 3);
const body = manualImportBody(paged, 'https://youtu.be/aaaaaaaaaaa\n https://www.youtube.com/watch?v=bbbbbbbbbbb , \n');
assert.deepEqual(body, { videoUrls: ['https://youtu.be/aaaaaaaaaaa', 'https://www.youtube.com/watch?v=bbbbbbbbbbb'], maxVideos: 2, maxPagesPerVideo: 3, maxCommentsPerRun: 150, maxResultsPerPage: 100 });
assert.equal(manualImportBody(options, Array.from({ length: 14 }, (_, i) => `id${i}`).join('\n')).maxVideos, 10, 'paste import still caps at 10 videos');

console.log('Scan options checks passed: shared options, clamping, niche scan body, paste-links body.');
