// Never silently show another person's reply when a selection moves or disappears.
export function pickSelectedItem(items, selectedId) {
  return selectedId ? items.find((item) => item.id === selectedId) : undefined;
}
export function pickDraftForLead(drafts, selectedDraftId, opportunityId) {
  const owned = drafts.filter((draft) => !draft.opportunityId || draft.opportunityId === opportunityId);
  return owned.find((draft) => draft.id === selectedDraftId) || owned[0];
}
