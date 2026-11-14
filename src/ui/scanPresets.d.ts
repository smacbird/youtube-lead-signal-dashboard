export type ScanPreset = { id: 'quick' | 'standard' | 'deep'; label: string; videos: number; comments: number; time: string; blurb: string };
export declare const DAILY_QUOTA: number;
export declare const SEARCH_UNITS: number;
export declare const SCAN_PRESETS: ScanPreset[];
export declare function presetForVideos(videos: number): ScanPreset;
export declare function estimateScanQuota(input: { videos: number; comments: number; queryCount?: number; profileId?: string }): { low: number; high: number; minSearches: number; maxSearches: number; typicalCommentPages: number; maxCommentPages: number };
