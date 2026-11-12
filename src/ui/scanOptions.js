// One shared scan-options object. App owns it; the Step 2 scan button and the
// sidebar ("More options", "Advanced: scan specific videos") both read and change it.
import { SCAN_PRESETS, presetForVideos } from './scanPresets.js';

export const VIDEO_AGE_CHOICES = [7, 14, 30, 90];
export const MIN_COMMENTS = 25;
export const MAX_COMMENTS = 300;

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function defaultScanOptions(settings = {}) {
  const preset = presetForVideos(settings.defaultScanDepth);
  const daysBack = VIDEO_AGE_CHOICES.includes(Number(settings.defaultFreshnessDays)) ? Number(settings.defaultFreshnessDays) : 30;
  return { presetId: preset.id, daysBack, commentCap: preset.comments, manualPages: 2 };
}

export function presetFor(options) {
  return SCAN_PRESETS.find((preset) => preset.id === options.presetId) || SCAN_PRESETS[0];
}

/** Choosing a size resets the comment cap to that size's default. */
export function withPreset(options, presetId) {
  const preset = SCAN_PRESETS.find((p) => p.id === presetId) || SCAN_PRESETS[0];
  return { ...options, presetId: preset.id, commentCap: preset.comments };
}

export function withDaysBack(options, days) {
  return VIDEO_AGE_CHOICES.includes(Number(days)) ? { ...options, daysBack: Number(days) } : options;
}

export function withCommentCap(options, cap) {
  return { ...options, commentCap: clampInt(cap, MIN_COMMENTS, MAX_COMMENTS, presetFor(options).comments) };
}

export function withManualPages(options, pages) {
  return { ...options, manualPages: clampInt(pages, 1, 3, 2) };
}

export function scanOptionsSummary(options) {
  return `Videos from the last ${options.daysBack} days · up to ${options.commentCap} comments`;
}

export function nicheScanBody(options, profileId, replyTone) {
  return { profileId, maxVideos: presetFor(options).videos, daysBack: options.daysBack, replyTone, maxCommentsPerRun: options.commentCap, maxResultsPerPage: 100 };
}

export function parseVideoLinks(text) {
  return String(text || '').split(/\n|,/).map((value) => value.trim()).filter(Boolean);
}

export function manualImportBody(options, text) {
  const videoUrls = parseVideoLinks(text);
  return { videoUrls, maxVideos: Math.min(10, videoUrls.length), maxPagesPerVideo: options.manualPages, maxCommentsPerRun: options.commentCap, maxResultsPerPage: 100 };
}
