// Pure formatting for saved-scan cards. Kept separate so it can be tested offline.

const STATUS_LABELS = {
  succeeded: 'Finished',
  completed_with_errors: 'Finished with notes',
  failed: 'Failed',
  running: 'Still running',
};

export function scanCardTitle(scan) {
  const title = String(scan?.title || '').trim();
  return title || (scan?.id ? `Saved scan ${scan.id}` : 'Saved scan');
}

export function scanStatusLabel(status) {
  return STATUS_LABELS[status] || (status ? String(status).replaceAll('_', ' ') : 'Unknown status');
}

export function scanCardMeta(scan) {
  const comments = Number(scan?.commentsFetched) || 0;
  const units = Number(scan?.estimatedQuotaUnits) || 0;
  return [
    `${comments} comment${comments === 1 ? '' : 's'}`,
    `${units} YouTube unit${units === 1 ? '' : 's'}`,
    scanStatusLabel(scan?.status),
  ].join(' · ');
}

/** "5 best leads · 2 maybe · 93 not a fit", or null when the server sent no counts (older scans). */
export function scanLeadLine(scan) {
  const counts = scan?.leadCounts;
  if (!counts) return null;
  const best = Number(counts.best) || 0;
  const parts = [`${best} best lead${best === 1 ? '' : 's'}`, `${Number(counts.maybe) || 0} maybe`, `${Number(counts.not_fit) || 0} not a fit`];
  if (Number(counts.done)) parts.push(`${Number(counts.done)} done`);
  return parts.join(' · ');
}

export function sortScansNewestFirst(scans) {
  return [...(scans || [])].sort((a, b) => String(b?.startedAt || '').localeCompare(String(a?.startedAt || '')));
}
