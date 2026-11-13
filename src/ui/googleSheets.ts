import { sheetExportStage, sheetRows, spreadsheetTitle } from './sheetPayload.js';
import type { ScoredFixture, LocalStatus } from './types';

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
let gisLoad: Promise<void> | null = null;

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (options: { prompt: string }) => void };
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (options: {
      client_id: string; scope: string; callback: (response: TokenResponse) => void;
      error_callback: () => void;
    }) => TokenClient } } };
  }
}

function gisReady() { return Boolean(window.google?.accounts?.oauth2?.initTokenClient); }

function loadGisOnClick(): Promise<void> {
  if (gisReady()) return Promise.resolve();
  if (gisLoad) return gisLoad;
  gisLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (gisReady()) resolve();
      else { gisLoad = null; reject(new Error('Google sign-in could not start. Check browser privacy or script blocking.')); }
    };
    script.onerror = () => {
      gisLoad = null;
      script.remove();
      reject(new Error('Google sign-in could not load. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return gisLoad;
}

/** Called synchronously from a real button click after GIS has loaded: popup-safe. */
function requestToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) { reject(new Error('Google sign-in is not ready. Click export again.')); return; }
    let finished = false;
    const done = (value?: string, error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      if (error) reject(error); else resolve(value || '');
    };
    const timeout = window.setTimeout(() => done(undefined, new Error('Google sign-in did not finish. Check your popup blocker and try again.')), 120000);
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) done(undefined, new Error('Google authorization was cancelled or denied.'));
        else done(response.access_token);
      },
      error_callback: () => done(undefined, new Error('Google sign-in was interrupted. Check your popup blocker and try again.')),
    });
    // This line executes in the initiating click's call stack, before any await.
    client.requestAccessToken({ prompt: 'consent' });
  });
}

async function sheetsRequest(url: string, method: 'POST' | 'PUT', token: string, body: object) {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { throw new Error('Could not reach Google Sheets. Check your connection and try again.'); }
  if (response.status === 401) throw new Error('Google authorization expired or was revoked. Click export again to authorize.');
  if (!response.ok) throw new Error(`Google Sheets did not accept the ${method === 'POST' ? 'create' : 'write'} request (HTTP ${response.status}). Check that the Sheets API is enabled and consent was granted.`);
  return response.json();
}

/**
 * Click 1 loads only the public GIS script. Click 2 opens consent, creates the
 * spreadsheet and writes the currently visible (filtered) items; no token storage.
 */
export async function exportFilteredToGoogleSheets(items: ScoredFixture[], statuses: Record<string, LocalStatus>, clientId: string | null | undefined) {
  const stage = sheetExportStage({ clientId, count: items.length, gisReady: gisReady() });
  if (stage === 'needs_client_id') throw new Error('Set GOOGLE_CLIENT_ID on Render before exporting to Google Sheets. CSV still works.');
  if (stage === 'empty') throw new Error('No comments match the current filters. Choose a tab with comments and try again.');
  if (stage === 'load_gis') {
    await loadGisOnClick();
    return { kind: 'ready' as const, message: 'Google sign-in is ready. Click Export to Google Sheets again to authorize and create the sheet.' };
  }

  const token = await requestToken(clientId!);
  // RAW means Google does not parse formulas; safeSheetCell adds an extra guard.
  const rows = sheetRows(items, statuses);
  const created = await sheetsRequest(SHEETS_API, 'POST', token, {
    properties: { title: spreadsheetTitle() }, sheets: [{ properties: { title: 'Leads' } }],
  });
  const id = created?.spreadsheetId;
  if (typeof id !== 'string' || !/^[\w-]{10,}$/.test(id)) throw new Error('Google created a sheet but did not return its id. Check Google Sheets directly.');
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
  const path = `${SHEETS_API}/${encodeURIComponent(id)}/values/${encodeURIComponent('Leads!A1')}?valueInputOption=RAW`;
  try {
    await sheetsRequest(path, 'PUT', token, { range: 'Leads!A1', majorDimension: 'ROWS', values: rows });
    return { kind: 'created' as const, url, count: items.length, message: `Created a Google Sheet with ${items.length} filtered comment${items.length === 1 ? '' : 's'}.` };
  } catch (error) {
    // The create succeeded; never hide that a possibly empty spreadsheet now exists.
    return { kind: 'partial' as const, url, count: 0, message: `The spreadsheet was created, but writing comments failed: ${error instanceof Error ? error.message : 'unknown error'} Open it to review before retrying.` };
  }
}
