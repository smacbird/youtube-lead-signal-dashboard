export interface SafeDraft { id: string; opportunityId?: string; createdBy?: string; style: string; body: string }
export declare function isRealAIDraft(draft: SafeDraft | null | undefined, opportunityId: string): boolean;
export declare function isSafeReplyDraft(draft: SafeDraft | null | undefined, opportunityId: string): boolean;
export declare function safeDraftsForOpportunity<T extends SafeDraft>(drafts: T[], opportunityId: string): T[];
export declare function canPrepareReply(drafts: SafeDraft[], opportunityId: string): boolean;
