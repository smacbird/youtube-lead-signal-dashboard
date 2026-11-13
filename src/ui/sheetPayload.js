// Pure Sheets payload helpers. RAW values plus formula-prefix escaping prevent
// comment text such as =IMPORTXML(...) from becoming a spreadsheet formula.
export const SHEETS_CREATE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
export function sheetsValuesWriteUrl(id) {
  return `${SHEETS_CREATE_URL}/${encodeURIComponent(id)}/values/${encodeURIComponent('Leads!A1')}?valueInputOption=RAW`;
}

export const SHEET_HEADERS = [
  'Score', 'Type', 'Lead strength', 'Reputation risk', 'Status', 'Video',
  'Commenter', 'Comment', 'Why', 'Niche', 'Comment URL',
];

export function safeSheetCell(value) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 49000);
  return /^[\s\u200b]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function sheetRows(items, statuses = {}) {
  return [SHEET_HEADERS, ...items.map((item) => {
    const video = item.video || {};
    const comment = item.comment || {};
    const score = item.score || {};
    const videoId = video.youtubeVideoId;
    const commentId = comment.youtubeCommentId;
    const url = videoId && commentId && !String(videoId).includes('FIX') && !String(commentId).includes('FIX')
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(commentId)}`
      : video.url || '';
    return [score.overallScore, score.opportunityTypeLabel, score.priority, score.riskLevel,
      statuses[item.id] || item.opportunity?.status, video.title, comment.authorDisplayName,
      comment.textOriginal, score.summary, score.nicheProfileLabel, url].map(safeSheetCell);
  })];
}

export function spreadsheetTitle(now = new Date()) {
  return `Best Leads System AI - Leads - ${now.toISOString().slice(0, 10)}`;
}

/** First click loads GIS; a second explicit click authorizes, preserving the popup gesture. */
export function sheetExportStage({ clientId, count, gisReady }) {
  if (!clientId) return 'needs_client_id';
  if (!count) return 'empty';
  return gisReady ? 'authorize' : 'load_gis';
}
