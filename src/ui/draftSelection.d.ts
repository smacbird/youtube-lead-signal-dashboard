export declare function pickSelectedItem<T extends { id: string }>(items: T[], selectedId?: string): T | undefined;
export declare function pickDraftForLead<T extends { id: string; opportunityId?: string }>(drafts: T[], selectedDraftId: string | undefined, opportunityId: string): T | undefined;

export declare function uniqueDraftStyles<T extends { id: string; style: string; createdAt?: string }>(drafts: T[], selectedDraftId?: string): T[];
