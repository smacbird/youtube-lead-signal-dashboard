import assert from 'node:assert/strict';
import { pickSelectedItem, pickDraftForLead } from '../src/ui/draftSelection.js';
const leads = [{ id: 'lead_a' }, { id: 'lead_b' }];
assert.equal(pickSelectedItem(leads, 'lead_a')?.id, 'lead_a');
assert.equal(pickSelectedItem(leads, 'lead_b')?.id, 'lead_b');
assert.equal(pickSelectedItem(leads, 'missing'), undefined, 'never silently uses the first item');
assert.equal(pickSelectedItem(leads), undefined, 'no lead selected means no draft panel');
const drafts = [
  { id: 'draft_a', opportunityId: 'lead_a', body: 'A topic' },
  { id: 'draft_b', opportunityId: 'lead_b', body: 'B topic' },
];
assert.equal(pickDraftForLead(drafts, 'draft_a', 'lead_b')?.body, 'B topic', 'old selected draft cannot bleed into another lead');
assert.equal(pickDraftForLead(drafts, 'draft_b', 'lead_a')?.body, 'A topic');
assert.equal(pickDraftForLead(drafts, undefined, 'lead_b')?.body, 'B topic');
console.log('Lead/draft selection checks passed.');
