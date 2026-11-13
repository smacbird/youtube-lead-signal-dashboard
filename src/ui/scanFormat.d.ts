type ScanLike = { id?: string; title?: string; status?: string; commentsFetched?: number; estimatedQuotaUnits?: number; startedAt?: string; leadCounts?: { best?: number; maybe?: number; not_fit?: number; done?: number } | null };
export declare function scanCardTitle(scan: ScanLike): string;
export declare function scanStatusLabel(status?: string): string;
export declare function scanCardMeta(scan: ScanLike): string;
export declare function scanLeadLine(scan: ScanLike): string | null;
export declare function sortScansNewestFirst<T extends ScanLike>(scans: T[]): T[];
