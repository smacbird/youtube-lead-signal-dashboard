import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonImportStore, createEmptyStore } from '../server/persistence/store.js';
import { createAuth } from '../server/auth.js';
import { SHEETS_CREATE_URL, sheetsValuesWriteUrl } from '../src/ui/sheetPayload.js';

// CSP source paths without a trailing slash match exactly; with a slash they
// match a subpath. Check the actual header against the app's actual URLs.
function cspAllowsConnect(csp, url) {
  const directive = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src '));
  const target = new URL(url);
  return Boolean(directive?.split(/\s+/).slice(1).some((source) => {
    if (!source.startsWith('https://')) return false;
    const allowed = new URL(source);
    return allowed.origin === target.origin && (allowed.pathname.endsWith('/')
      ? target.pathname.startsWith(allowed.pathname) : target.pathname === allowed.pathname);
  }));
}

const tempDir = await mkdtemp(join(tmpdir(), 'bls-security-'));
const storePath = join(tempDir, 'store.json');
const PASSWORD = 'a-strong-local-test-password-only';
const SECRET = 'local-test-secret-not-for-deployment-1234567890';
const productionEnv = { OWNER_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, AUTH_ORIGIN: 'https://example.com' };
for (const key of Object.keys(productionEnv)) {
  assert.equal(createAuth({ ...productionEnv, [key]: undefined }).configured, false, `missing ${key} must fail closed`);
}
assert.equal(createAuth({ ...productionEnv, AUTH_ORIGIN: 'http://example.com' }).configured, false);
const productionAuth = createAuth(productionEnv);
assert.equal(productionAuth.configured, true);
const productionRequest = { headers: { host: 'example.com', origin: 'https://example.com' } };
const productionLogin = productionAuth.login(productionRequest, PASSWORD);
assert.match(productionLogin.cookie, /^__Host-bls_session=/);
assert.match(productionLogin.cookie, /; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=/);
const sample = createEmptyStore();
for (const id of ['shared', 'unique']) {
  sample.videos[id] = { id, youtubeVideoId: id, title: id };
  sample.comments[`comment_${id}`] = { id: `comment_${id}`, videoId: id, textOriginal: id };
  sample.opportunities[`opp_${id}`] = { id: `opp_${id}`, videoId: id, commentId: `comment_${id}`, overallScore: 50, status: 'new' };
  sample.replyDrafts[`draft_${id}`] = { id: `draft_${id}`, opportunityId: `opp_${id}` };
  sample.statusHistory[`history_${id}`] = { id: `history_${id}`, opportunityId: `opp_${id}` };
  sample.scoreDimensions[`opp_${id}`] = [{ opportunityId: `opp_${id}`, score: 50 }];
}
sample.importRuns.run_one = { id: 'run_one', startedAt: '2026-05-01', requestedVideoIds: ['shared', 'unique'], opportunityIds: ['opp_shared', 'opp_unique'], commentIds: ['comment_shared', 'comment_unique'], videoIds: ['shared', 'unique'] };
sample.importRuns.run_two = { id: 'run_two', startedAt: '2026-05-02', requestedVideoIds: ['shared'], opportunityIds: ['opp_shared'], commentIds: ['comment_shared'], videoIds: ['shared'] };
await new JsonImportStore({ filePath: storePath }).save(sample);

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function withServer(configured, run) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), IMPORT_STORE_PATH: storePath };
  delete env.OWNER_PASSWORD;
  delete env.SESSION_SECRET;
  delete env.AUTH_ORIGIN;
  delete env.YOUTUBE_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.GOOGLE_CLIENT_ID;
  if (configured) Object.assign(env, { OWNER_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, AUTH_ORIGIN: origin, GOOGLE_CLIENT_ID: '1234567890-test.apps.googleusercontent.com' });
  const child = spawn(process.execPath, ['server/server.js'], { cwd: process.cwd(), env, stdio: 'ignore' });
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${child.exitCode}`);
      try { await fetch(`${origin}/api/health`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
      if (attempt === 49) throw new Error('Local test server did not start');
    }
    await run(origin);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

try {
  await withServer(false, async (origin) => {
    for (const path of ['/', '/login', '/assets/index.js', '/api/session', '/api/opportunities', '/api/import-runs', '/api/export/opportunities.csv']) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
      assert.equal(response.status, 503, `${path} must fail closed without credentials`);
    }
    const response = await fetch(`${origin}/api/import-runs/run_one`, { method: 'DELETE', headers: { origin } });
    assert.equal(response.status, 503);
  });
  await withServer(true, async (origin) => {
    const unauthenticated = [
      ['/', 'GET'], ['/assets/index.js', 'GET'], ['/api/opportunities', 'GET'],
      ['/api/import-runs', 'GET'], ['/api/import-runs/run_one', 'GET'],
      ['/api/export/opportunities.csv', 'GET'], ['/api/config', 'GET'], ['/api/settings', 'GET'], ['/api/settings', 'PUT'],
      ['/api/opportunities/opp_shared/ai-drafts', 'POST'],
      ['/api/scan/youtube-niche', 'POST'], ['/api/import/youtube', 'POST'],
      ['/api/opportunities/opp_shared/status', 'POST'], ['/api/import-runs/run_one', 'DELETE'],
    ];
    for (const [path, method] of unauthenticated) {
      const response = await fetch(`${origin}${path}`, { method, redirect: 'manual', headers: { origin } });
      assert.equal(response.status, method === 'GET' && !path.startsWith('/api/') ? 303 : 401, `${method} ${path} must reject strangers`);
    }
    const loginPage = await fetch(`${origin}/login`);
    assert.equal(loginPage.headers.get('referrer-policy'), 'same-origin', 'browsers must still send a real Origin on form posts');
    const csp = loginPage.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client/);
    assert.match(csp, /connect-src 'self' https:\/\/accounts\.google\.com\/gsi\/ https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\//);
    assert.equal(cspAllowsConnect(csp, SHEETS_CREATE_URL), true, 'CSP allows the exact spreadsheet-create endpoint');
    assert.equal(cspAllowsConnect(csp, sheetsValuesWriteUrl('spreadsheet_id_123456')), true, 'CSP allows the actual values/write endpoint');
    assert.equal(cspAllowsConnect(csp, 'https://sheets.googleapis.com/v4/spreadsheetsOther'), false, 'CSP does not allow sibling API paths');
    assert.equal(cspAllowsConnect(csp, 'https://sheets.googleapis.com/v4/drive'), false, 'CSP does not allow other Google APIs');
    assert.equal(cspAllowsConnect(csp, 'https://evil.example/v4/spreadsheets/a/values/Leads!A1'), false, 'CSP is host-scoped');
    assert.match(csp, /frame-src https:\/\/accounts\.google\.com\/gsi\//);
    for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"]) assert.ok(csp.includes(directive));
    assert.equal(loginPage.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
    for (const brand of ['/brand-logo.png', '/favicon.png']) {
      const image = await fetch(`${origin}${brand}`);
      assert.equal(image.status, 200, `${brand} is public so the sign-in page can show it`);
      assert.equal(image.headers.get('content-type'), 'image/png');
    }
    const loginCss = await fetch(`${origin}/login.css`);
    assert.equal(loginCss.status, 200, 'login stylesheet is public so sign-in can be styled');
    assert.match(loginCss.headers.get('content-type'), /text\/css/);
    assert.equal((await fetch(`${origin}/login.css.map`, { redirect: 'manual' })).status, 303, 'other files stay behind the login');
    const publicHealth = await fetch(`${origin}/api/health`);
    assert.equal(publicHealth.status, 200);
    assert.deepEqual(await publicHealth.json(), { ok: true }, 'public health reveals no account or key status');
    assert.equal((await fetch(`${origin}/login`)).status, 200);
    const noOrigin = await fetch(`${origin}/login`, { method: 'POST', body: new URLSearchParams({ password: PASSWORD }), redirect: 'manual' });
    assert.equal(noOrigin.status, 403, 'login requires same origin');
    const bad = await fetch(`${origin}/login`, { method: 'POST', body: new URLSearchParams({ password: 'incorrect' }), headers: { origin }, redirect: 'manual' });
    assert.equal(bad.status, 401);
    const login = await fetch(`${origin}/login`, { method: 'POST', body: new URLSearchParams({ password: PASSWORD }), headers: { origin }, redirect: 'manual' });
    assert.equal(login.status, 303);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie, /^bls_session=[a-f0-9]{64}\.[a-f0-9]{64}$/);
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const headers = { cookie };
    const session = await fetch(`${origin}/api/session`, { headers });
    assert.equal(session.status, 200);
    const { csrfToken } = await session.json();
    assert.match(csrfToken, /^[a-f0-9]{64}$/);
    assert.equal((await fetch(origin, { headers })).status, 200);
    assert.equal((await fetch(`${origin}/api/import-runs`, { headers })).status, 200);
    assert.equal((await fetch(`${origin}/api/opportunities`, { headers })).status, 200);
    const privateConfig = await (await fetch(`${origin}/api/config`, { headers })).json();
    assert.equal(privateConfig.googleClientId, '1234567890-test.apps.googleusercontent.com', 'only public OAuth client id is exposed after login');
    assert.deepEqual(privateConfig.apiHealth.youtube, { state: 'unknown', checkedAt: null });
    assert.deepEqual(privateConfig.apiHealth.openai, { state: 'unknown', checkedAt: null });
    assert.ok(!JSON.stringify(privateConfig).includes(PASSWORD) && !JSON.stringify(privateConfig).includes(SECRET), 'config contains status only, never credentials');
    assert.equal((await fetch(`${origin}/api/export/opportunities.csv`, { headers })).status, 200);
    const defaultSettings = await (await fetch(`${origin}/api/settings`, { headers })).json();
    assert.equal(defaultSettings.settings.defaultScanDepth, 5, 'old stores get safe settings defaults');
    const settingsUrl = `${origin}/api/settings`;
    const updatedSettings = { defaultScanDepth: 10, defaultFreshnessDays: 14, replyTone: 'Plain and practical', enabledNiches: ['work_from_home', 'side_hustles'] };
    assert.equal((await fetch(settingsUrl, { method: 'PUT', headers: { ...headers, origin, 'content-type': 'application/json' }, body: JSON.stringify(updatedSettings) })).status, 403, 'settings change requires CSRF');
    const settingsHeaders = { ...headers, origin, 'content-type': 'application/json', 'x-csrf-token': csrfToken };
    assert.equal((await fetch(settingsUrl, { method: 'PUT', headers: settingsHeaders, body: JSON.stringify({ ...updatedSettings, OWNER_PASSWORD: 'do-not-accept' }) })).status, 400, 'unknown settings cannot enter the store');
    assert.equal((await fetch(settingsUrl, { method: 'PUT', headers: settingsHeaders, body: JSON.stringify({ ...updatedSettings, enabledNiches: [] }) })).status, 400, 'at least one niche required');
    const settingsResponse = await fetch(settingsUrl, { method: 'PUT', headers: settingsHeaders, body: JSON.stringify(updatedSettings) });
    assert.equal(settingsResponse.status, 200);
    assert.deepEqual((await settingsResponse.json()).settings, updatedSettings);
    assert.deepEqual((await (await fetch(settingsUrl, { headers })).json()).settings, updatedSettings, 'settings survive a second request');
    assert.deepEqual(await new JsonImportStore({ filePath: storePath }).getSettings(), updatedSettings, 'settings persist in isolated JSON store');
    const route = `${origin}/api/import-runs/run_one`;
    assert.equal((await fetch(route, { method: 'DELETE', headers: { ...headers, origin } })).status, 403, 'missing CSRF');
    assert.equal((await fetch(route, { method: 'DELETE', headers: { ...headers, origin: 'https://evil.example', 'x-csrf-token': csrfToken } })).status, 403, 'wrong origin');
    const failedAi = await fetch(`${origin}/api/opportunities/opp_shared/ai-drafts`, { method: 'POST', headers: { ...headers, origin } });
    assert.equal(failedAi.status, 403, 'AI drafts need CSRF');
    const deletion = await fetch(route, { method: 'DELETE', headers: { ...headers, origin, 'x-csrf-token': csrfToken } });
    assert.equal(deletion.status, 200);
    const result = await deletion.json();
    assert.deepEqual(result.removed, { videos: 1, comments: 1, opportunities: 1, drafts: 1, scoreDimensions: 1, statusHistory: 1 });
    const persisted = await new JsonImportStore({ filePath: storePath }).load();
    assert.ok(persisted.importRuns.run_two && !persisted.importRuns.run_one);
    assert.ok(persisted.videos.shared && persisted.opportunities.opp_shared && persisted.comments.comment_shared);
    assert.ok(!persisted.videos.unique && !persisted.opportunities.opp_unique && !persisted.comments.comment_unique);
    const remaining = await fetch(`${origin}/api/import-runs/run_two`, { headers });
    assert.equal((await remaining.json()).items.length, 1);
    await new JsonImportStore({ filePath: storePath }).mutate((data) => {
      data.importRuns.legacy = { id: 'legacy', startedAt: '2025-01-01', requestedVideoIds: ['shared'] };
    });
    const legacyDelete = await fetch(`${origin}/api/import-runs/legacy`, { method: 'DELETE', headers: { ...headers, origin, 'x-csrf-token': csrfToken } });
    assert.equal(legacyDelete.status, 409, 'old runs without exact membership cannot be destructively deleted');
    assert.equal((await legacyDelete.json()).code, 'legacy_run_membership_unknown');
    assert.ok((await new JsonImportStore({ filePath: storePath }).getImportRun('legacy')), 'failed deletion leaves old scan intact');
    const logout = await fetch(`${origin}/logout`, { method: 'POST', headers: { ...headers, origin, 'x-csrf-token': csrfToken }, redirect: 'manual' });
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await fetch(`${origin}/api/session`, { headers })).status, 401);
    for (let i = 0; i < 8; i++) {
      const attempt = await fetch(`${origin}/login`, { method: 'POST', body: new URLSearchParams({ password: 'incorrect' }), headers: { origin }, redirect: 'manual' });
      assert.equal(attempt.status, 401);
    }
    const throttled = await fetch(`${origin}/login`, { method: 'POST', body: new URLSearchParams({ password: PASSWORD }), headers: { origin }, redirect: 'manual' });
    assert.equal(throttled.status, 429, 'login attempts throttled, even for correct password during lockout');
  });
  console.log('Security regression checks passed: fail-closed, protected routes, login, CSRF, logout, shared-video deletion.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
