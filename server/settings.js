import { NICHE_PROFILES } from './youtube/nicheProfiles.js';

export const DEFAULT_SETTINGS = Object.freeze({
  defaultScanDepth: 5,
  defaultFreshnessDays: 30,
  replyTone: 'Helpful, concise, practical',
  enabledNiches: Object.keys(NICHE_PROFILES),
});

const FIELDS = new Set(Object.keys(DEFAULT_SETTINGS));
const DEPTHS = new Set([5, 10, 25]);
const DAYS = new Set([7, 14, 30, 90]);
const NICHES = new Set(Object.keys(NICHE_PROFILES));

function bad(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'invalid_settings';
  return error;
}

/** Accept the defined preferences only: never spread untrusted input into persistent state. */
export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('Settings must be an object.');
  if (Object.keys(input).some((key) => !FIELDS.has(key))) throw bad('Unknown settings field.');
  if (!DEPTHS.has(input.defaultScanDepth)) throw bad('Choose Quick, Standard or Deep for default scan size.');
  if (!DAYS.has(input.defaultFreshnessDays)) throw bad('Choose a listed video age.');
  if (typeof input.replyTone !== 'string' || !input.replyTone.trim() || input.replyTone.length > 160 || /[\u0000-\u001f\u007f]/.test(input.replyTone))
    throw bad('Reply tone must be 1–160 plain characters.');
  if (!Array.isArray(input.enabledNiches) || input.enabledNiches.length < 1 || input.enabledNiches.length > NICHES.size
    || input.enabledNiches.some((id) => typeof id !== 'string' || !NICHES.has(id))
    || new Set(input.enabledNiches).size !== input.enabledNiches.length) throw bad('Choose at least one valid niche.');
  return {
    defaultScanDepth: input.defaultScanDepth,
    defaultFreshnessDays: input.defaultFreshnessDays,
    replyTone: input.replyTone.trim(),
    enabledNiches: [...input.enabledNiches],
  };
}

/** Older stores without preferences receive defaults; corrupt fields never reach the UI. */
export function settingsFromStore(saved) {
  try { return validateSettings(saved); } catch { return { ...DEFAULT_SETTINGS, enabledNiches: [...DEFAULT_SETTINGS.enabledNiches] }; }
}
