import { canPrepareReply } from '../scoring/draftSafety.js';

/** Only an open, real lead with no cached AI draft needs automatic generation. */
export function shouldAutoDraft(item, status, { hasKey, isDemo, attempted = false } = {}) {
  if (!hasKey || isDemo || attempted || !item) return false;
  if (status === 'replied' || status === 'rejected' || item.score?.opportunityType === 'low_fit_comment') return false;
  return !canPrepareReply(item.opportunity?.replyDrafts || [], item.opportunity?.id);
}
