// Copyable replies must be server-generated OpenAI answers or explicit vetted
// automatic fallbacks. Old template/coaching drafts remain hidden in saved scans.
const AI_STYLES = new Set(['ai_short_helpful', 'ai_consultative', 'ai_content_angle']);
const PLACEHOLDER = /helpful angle to review manually|a good reply would|a safe reply would|short version: point them to|this could become a short video or post|use careful wording: acknowledge/i;

export function isRealAIDraft(draft, opportunityId) {
  return Boolean(draft && draft.opportunityId === opportunityId && draft.createdBy === 'openai'
    && AI_STYLES.has(draft.style) && typeof draft.body === 'string'
    && draft.body.trim().length > 0 && !PLACEHOLDER.test(draft.body));
}

export function isSafeReplyDraft(draft, opportunityId) {
  if (isRealAIDraft(draft, opportunityId)) return true;
  return Boolean(draft && draft.opportunityId === opportunityId && draft.createdBy === 'safe_fallback'
    && draft.style === 'fallback_short' && typeof draft.body === 'string' && draft.body.trim().length >= 30
    && !PLACEHOLDER.test(draft.body) && !/https?:\/\/|www\.|guaranteed\s+(income|profit|earnings)/i.test(draft.body));
}

export function safeDraftsForOpportunity(drafts = [], opportunityId) {
  return drafts.filter((draft) => isSafeReplyDraft(draft, opportunityId));
}

export function canPrepareReply(drafts, opportunityId) {
  return safeDraftsForOpportunity(drafts, opportunityId)
    .some((draft) => draft.style === 'ai_short_helpful' || draft.style === 'ai_consultative' || draft.style === 'fallback_short');
}
