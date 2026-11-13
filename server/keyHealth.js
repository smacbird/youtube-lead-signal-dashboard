// In-memory last-known outcomes from real API calls; never perform health probes.
// No key, upstream body, endpoint or token is stored here.
const statuses = {
  youtube: { state: 'unknown', checkedAt: null },
  openai: { state: 'unknown', checkedAt: null },
};
const VALID_STATES = new Set(['unknown', 'ok', 'invalid_key', 'quota_exceeded']);

export function recordKeyOutcome(service, state) {
  if (!Object.hasOwn(statuses, service) || !VALID_STATES.has(state)) return;
  statuses[service] = { state, checkedAt: new Date().toISOString() };
}

export function lastKnownKeyStatus() {
  return { youtube: { ...statuses.youtube }, openai: { ...statuses.openai } };
}

export function classifyYouTubeKeyFailure(status, reason = '') {
  const code = String(reason).toLowerCase();
  if (/quot(a|e)|dailylimit|ratelimit/.test(code) || status === 429) return 'quota_exceeded';
  if (code === 'commentsdisabled' || code === 'videonotfound') return null;
  if (status === 401 || status === 403 || /keyinvalid|invalidkey|accessnotconfigured/.test(code)) return 'invalid_key';
  return null;
}
