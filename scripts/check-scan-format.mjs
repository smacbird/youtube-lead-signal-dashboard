// Saved-scan card formatting. Pure, offline.
import assert from 'node:assert/strict';
import { scanCardMeta, scanCardTitle, scanLeadLine, scanStatusLabel, sortScansNewestFirst } from '../src/ui/scanFormat.js';

const long = 'Nov 12, 2026, 9:45 PM UTC · Affiliate marketing · 30 days · 10 videos · 200 comments';
assert.equal(scanCardTitle({ id: 'run_1', title: long }), long, 'long titles are kept whole (CSS wraps them)');
assert.equal(scanCardTitle({ id: 'run_2', title: '   ' }), 'Saved scan run_2');
assert.equal(scanCardTitle({}), 'Saved scan');

assert.equal(scanCardMeta({ commentsFetched: 200, estimatedQuotaUnits: 611, status: 'succeeded' }), '200 comments · 611 YouTube units · Finished');
assert.equal(scanCardMeta({ commentsFetched: 1, estimatedQuotaUnits: 1, status: 'completed_with_errors' }), '1 comment · 1 YouTube unit · Finished with notes');
assert.equal(scanCardMeta({ status: 'failed' }), '0 comments · 0 YouTube units · Failed');
assert.equal(scanStatusLabel('something_new'), 'something new');
assert.equal(scanStatusLabel(undefined), 'Unknown status');

assert.equal(scanLeadLine({ leadCounts: { best: 5, maybe: 2, not_fit: 93, done: 0 } }), '5 best leads · 2 maybe · 93 not a fit');
assert.equal(scanLeadLine({ leadCounts: { best: 1, maybe: 0, not_fit: 0, done: 3 } }), '1 best lead · 0 maybe · 0 not a fit · 3 done');
assert.equal(scanLeadLine({}), null, 'older scans without counts show no lead line');

const sorted = sortScansNewestFirst([
  { id: 'old', startedAt: '2026-11-10T10:00:00Z' },
  { id: 'new', startedAt: '2026-11-12T21:45:00Z' },
  { id: 'mid', startedAt: '2026-11-11T08:00:00Z' },
]);
assert.deepEqual(sorted.map((scan) => scan.id), ['new', 'mid', 'old']);

console.log('Scan format checks passed: card title, meta line, lead line, newest-first order.');
