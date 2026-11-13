export declare const SHEETS_CREATE_URL: string;
export declare function sheetsValuesWriteUrl(id: string): string;
export declare const SHEET_HEADERS: string[];
export declare function safeSheetCell(value: unknown): string;
export declare function sheetRows(items: Array<{ id: string; video?: { youtubeVideoId?: string; title?: string; url?: string }; comment?: { youtubeCommentId?: string; authorDisplayName?: string; textOriginal?: string }; score?: { overallScore?: number; opportunityTypeLabel?: string; priority?: string; riskLevel?: string; summary?: string; nicheProfileLabel?: string | null }; opportunity?: { status?: string } }>, statuses?: Record<string, string>): string[][];
export declare function spreadsheetTitle(now?: Date): string;
export declare function sheetExportStage(input: { clientId?: string | null; count: number; gisReady: boolean }): 'needs_client_id' | 'empty' | 'authorize' | 'load_gis';
