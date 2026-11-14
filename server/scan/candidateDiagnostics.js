// Bounded, run-level accounting of VIDEO candidates (never comments or identities).
// Keep only counts and a few short example titles, not the full search response.
const MAX_TITLE_LENGTH = 140;
const MAX_EXAMPLES_PER_REASON = 3;
const MAX_NAMED_REASONS = 8;

export function summarizeCandidateSelection(selection) {
  const considered = selection.candidatesConsidered;
  const selected = selection.videos.length;
  const dropped = selection.droppedVideos.length;
  if (considered !== selected + dropped) {
    throw new Error(`candidate_accounting_mismatch:${considered}:${selected}:${dropped}`);
  }
  const reasons = new Map();
  for (const video of selection.droppedVideos) {
    const named = video.reason || 'other';
    const reason = reasons.has(named) || reasons.size < MAX_NAMED_REASONS ? named : 'other';
    if (!reasons.has(reason)) reasons.set(reason, { reason, count: 0, titles: [] });
    const group = reasons.get(reason);
    group.count += 1;
    if (group.titles.length < MAX_EXAMPLES_PER_REASON) {
      const title = String(video.title || 'Untitled video').trim();
      group.titles.push(Array.from(title).slice(0, MAX_TITLE_LENGTH).join(''));
    }
  }
  return { considered, selected, dropped, reasons: [...reasons.values()] };
}
