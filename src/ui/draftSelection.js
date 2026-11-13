// Never silently show another person's reply when a selection moves or disappears.
export function pickSelectedItem(items, selectedId) {
  return selectedId ? items.find((item) => item.id === selectedId) : undefined;
}
export function pickDraftForLead(drafts, selectedDraftId, opportunityId) {
  const owned = drafts.filter((draft) => !draft.opportunityId || draft.opportunityId === opportunityId);
  return owned.find((draft) => draft.id === selectedDraftId)
    || owned.find((draft) => draft.style === 'ai_short_helpful')
    || owned.find((draft) => draft.style === 'ai_consultative')
    || owned[0];
}


// Regeneration appends new AI drafts. Show only one chip per style; preserve the
// selected version, otherwise keep the newest version of that style.
export function uniqueDraftStyles(drafts, selectedDraftId) {
  const byStyle = new Map();
  for (const draft of drafts) {
    const previous = byStyle.get(draft.style);
    if (!previous) { byStyle.set(draft.style, draft); continue; }
    if (draft.id === selectedDraftId) { byStyle.set(draft.style, draft); continue; }
    if (previous.id === selectedDraftId) continue;
    const nextTime = Date.parse(draft.createdAt || '') || 0;
    const previousTime = Date.parse(previous.createdAt || '') || 0;
    if (nextTime >= previousTime) byStyle.set(draft.style, draft);
  }
  const order = ['ai_short_helpful', 'ai_consultative', 'ai_content_angle'];
  return [...byStyle.values()].sort((a, b) => order.indexOf(a.style) - order.indexOf(b.style));
}
