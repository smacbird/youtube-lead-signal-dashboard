// One shared rule for which review list a comment belongs to.
// Used by the server (scan headline) and the dashboard (Step 3 tabs).

export const DONE_STATUSES = ['replied', 'rejected'];
export const BEST_MIN_SCORE = 45;

/**
 * @param {{ opportunityType?: string, overallScore?: number, riskLevel?: string, status?: string }} item
 * @returns {'best' | 'maybe' | 'not_fit' | 'done'}
 */
export function leadBucket({ opportunityType, overallScore = 0, riskLevel = 'low', status = 'new' } = {}) {
  if (DONE_STATUSES.includes(status)) return 'done';
  if (opportunityType === 'low_fit_comment' || !opportunityType) return 'not_fit';
  if (riskLevel === 'high') return 'maybe';
  if (opportunityType === 'niche_lead' || (Number(overallScore) || 0) >= BEST_MIN_SCORE) return 'best';
  return 'maybe';
}

/** Counts per bucket plus a plain-English headline such as "5 leads + 53 not a fit". */
export function bucketCounts(items) {
  const counts = { best: 0, maybe: 0, not_fit: 0, done: 0 };
  for (const item of items) counts[leadBucket(item)] += 1;
  const parts = [`${counts.best} lead${counts.best === 1 ? '' : 's'}`];
  if (counts.maybe) parts.push(`${counts.maybe} maybe`);
  parts.push(`${counts.not_fit} not a fit`);
  if (counts.done) parts.push(`${counts.done} done`);
  return { ...counts, headline: parts.join(' + ') };
}
