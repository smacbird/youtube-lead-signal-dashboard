// Only server-generated AI replies are postable. Old template/coaching drafts stay
// in saved scans for history, but must never reach a copy or approval action.
const AI_STYLES = new Set(['ai_short_helpful', 'ai_consultative', 'ai_content_angle']);
const PLACEHOLDER = /helpful angle to review manually|a good reply would|a safe reply would|short version: point them to|this could become a short video or post|use careful wording: acknowledge/i;

export function isRealAIDraft(draft, opportunityId) {
  return Boolean(draft && draft.opportunityId === opportunityId && draft.createdBy === 'openai'
    && AI_STYLES.has(draft.style) && typeof draft.body === 'string'
    && draft.body.trim().length > 0 && !PLACEHOLDER.test(draft.body));
}

export function safeDraftsForOpportunity(drafts = [], opportunityId) {
  return drafts.filter((draft) => isRealAIDraft(draft, opportunityId));
}

export function canPrepareReply(drafts, opportunityId) {
  return safeDraftsForOpportunity(drafts, opportunityId)
    .some((draft) => draft.style === 'ai_short_helpful' || draft.style === 'ai_consultative');
}
