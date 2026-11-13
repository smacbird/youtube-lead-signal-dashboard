import assert from 'node:assert/strict';
import { safeSheetCell, sheetRows, spreadsheetTitle, sheetExportStage, SHEET_HEADERS, SHEETS_CREATE_URL, sheetsValuesWriteUrl } from '../src/ui/sheetPayload.js';

for (const value of ['=IMPORTXML("https://evil.example")', ' +SUM(1,2)', '-1+2', '@cmd']) {
  assert.ok(safeSheetCell(value).startsWith("'"), `${value} cannot become a spreadsheet formula`);
}
assert.equal(safeSheetCell('ordinary text'), 'ordinary text');
assert.equal(safeSheetCell('hello\nworld'), 'hello world', 'control characters stay inside one cell');
assert.equal(spreadsheetTitle(new Date('2026-11-12T20:00:00Z')), 'Best Leads System AI - Leads - 2026-11-12');
const item = {
  id: 'opp_1', video: { youtubeVideoId: 'dQw4w9WgXcQ', title: '=bad title' },
  comment: { youtubeCommentId: 'Ugxabc', authorDisplayName: '+username', textOriginal: '=IMPORTXML("x")' },
  score: { overallScore: 81, opportunityTypeLabel: 'Niche lead', priority: 'high', riskLevel: 'low', summary: '@danger', nicheProfileLabel: 'Work at/from home business' },
  opportunity: { status: 'new' },
};
const rows = sheetRows([item], { opp_1: 'reviewed' });
assert.deepEqual(rows[0], SHEET_HEADERS);
assert.equal(rows.length, 2);
assert.equal(rows[1].length, SHEET_HEADERS.length);
assert.equal(rows[1][4], 'reviewed', 'current local status is exported');
assert.equal(rows[1][5], "'=bad title");
assert.equal(rows[1][6], "'+username");
assert.equal(rows[1][7], "'=IMPORTXML(\"x\")");
assert.equal(rows[1][8], "'@danger");
assert.match(rows[1][10], /youtube\.com\/watch\?v=dQw4w9WgXcQ&lc=Ugxabc/);
assert.equal(sheetRows([], {}).length, 1, 'zero comments makes only a header row');
assert.equal(sheetExportStage({ clientId: null, count: 1, gisReady: false }), 'needs_client_id');
assert.equal(sheetExportStage({ clientId: 'public-id', count: 0, gisReady: false }), 'empty');
assert.equal(sheetExportStage({ clientId: 'public-id', count: 1, gisReady: false }), 'load_gis');
assert.equal(sheetExportStage({ clientId: 'public-id', count: 1, gisReady: true }), 'authorize');
assert.equal(SHEETS_CREATE_URL, 'https://sheets.googleapis.com/v4/spreadsheets');
assert.equal(sheetsValuesWriteUrl('spreadsheet_id_123456'), 'https://sheets.googleapis.com/v4/spreadsheets/spreadsheet_id_123456/values/Leads!A1?valueInputOption=RAW');
console.log('Sheets payload checks passed: quoted cells, current filtered rows, title, click-only authorization stages.');
