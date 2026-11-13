import { canPrepareReply } from '../scoring/draftSafety.js';

/** An open lead with no safe draft gets AI or a niche-safe fallback (if no key). */
export function shouldAutoDraft(item, status, { hasKey, isDemo, attempted = false } = {}) {
  if (isDemo || attempted || !item) return false;
  if (!hasKey && !item.score?.nicheProfileId) return false; // no niche-safe fallback for manual imports
  if (status === 'replied' || status === 'rejected' || item.score?.opportunityType === 'low_fit_comment') return false;
  return !canPrepareReply(item.opportunity?.replyDrafts || [], item.opportunity?.id);
}
