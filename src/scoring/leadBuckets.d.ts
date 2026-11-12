export type LeadBucket = 'best' | 'maybe' | 'not_fit' | 'done';
export declare const DONE_STATUSES: string[];
export declare const BEST_MIN_SCORE: number;
export declare function leadBucket(item: { opportunityType?: string; overallScore?: number; riskLevel?: string; status?: string; leadFit?: 'best' | 'maybe' | null }): LeadBucket;
export declare function bucketCounts(items: Array<{ opportunityType?: string; overallScore?: number; riskLevel?: string; status?: string; leadFit?: 'best' | 'maybe' | null }>): Record<LeadBucket, number> & { headline: string };
