import assert from 'node:assert/strict';
import { pickSelectedItem, pickDraftForLead } from '../src/ui/draftSelection.js';
import { safeDraftsForOpportunity, canPrepareReply } from '../src/scoring/draftSafety.js';
import { shouldAutoDraft } from '../src/ui/autoDraft.js';
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
const saved = [
  { id: 'old_template', opportunityId: 'lead_a', createdBy: 'template_import', style: 'helpful_consultative', body: 'Helpful angle to review manually: answer the question' },
  { id: 'old_fallback', opportunityId: 'lead_a', createdBy: 'server_ai_fallback', style: 'ai_short_helpful', body: 'A generic fallback' },
  { id: 'old_generated', opportunityId: 'lead_a', style: 'concise_resource', body: 'Short version: point them to a checklist' },
  { id: 'other_person', opportunityId: 'lead_b', createdBy: 'openai', style: 'ai_short_helpful', body: 'Wrong person' },
  { id: 'video_idea', opportunityId: 'lead_a', createdBy: 'openai', style: 'ai_content_angle', body: 'Make a useful video.' },
];
assert.deepEqual(safeDraftsForOpportunity(saved, 'lead_a').map((draft) => draft.id), ['video_idea'], 'legacy placeholders and other people’s drafts never show');
assert.equal(canPrepareReply(saved, 'lead_a'), false, 'video idea alone cannot make a reply ready');
const answer = { id: 'real_answer', opportunityId: 'lead_a', createdBy: 'openai', style: 'ai_short_helpful', body: 'Start with a separate business account and check your local requirements.' };
assert.equal(canPrepareReply([...saved, answer], 'lead_a'), true);
assert.equal(pickDraftForLead([saved[4], answer], undefined, 'lead_a')?.id, 'real_answer', 'first answer chosen ahead of video idea');
const lead = { id: 'lead_a', opportunity: { id: 'lead_a', replyDrafts: saved }, score: { opportunityType: 'niche_lead' } };
assert.equal(shouldAutoDraft(lead, 'new', { hasKey: true }), true, 'old template and video idea do not suppress an answer request');
assert.equal(shouldAutoDraft(lead, 'replied', { hasKey: true }), false);
assert.equal(shouldAutoDraft(lead, 'new', { hasKey: false }), false);
assert.equal(shouldAutoDraft(lead, 'new', { hasKey: true, attempted: true }), false);
assert.equal(shouldAutoDraft({ ...lead, score: { opportunityType: 'low_fit_comment' } }, 'new', { hasKey: true }), false);
assert.equal(shouldAutoDraft({ ...lead, opportunity: { ...lead.opportunity, replyDrafts: [...saved, answer] } }, 'new', { hasKey: true }), false);
console.log('Lead/draft ownership, legacy placeholder filtering and auto-draft eligibility checks passed.');
