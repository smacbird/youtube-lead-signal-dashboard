import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonImportStore, createEmptyStore } from '../server/persistence/store.js';
import { createAuth } from '../server/auth.js';

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
  sample.comments[`comment_${id}`] = { id: `comment_${id}`, textOriginal: id };
  sample.opportunities[`opp_${id}`] = { id: `opp_${id}`, videoId: id, commentId: `comment_${id}`, overallScore: 50, status: 'new' };
  sample.replyDrafts[`draft_${id}`] = { id: `draft_${id}`, opportunityId: `opp_${id}` };
  sample.statusHistory[`history_${id}`] = { id: `history_${id}`, opportunityId: `opp_${id}` };
  sample.scoreDimensions[`opp_${id}`] = [{ opportunityId: `opp_${id}`, score: 50 }];
}
sample.importRuns.run_one = { id: 'run_one', startedAt: '2026-05-01', requestedVideoIds: ['shared', 'unique'] };
sample.importRuns.run_two = { id: 'run_two', startedAt: '2026-05-02', requestedVideoIds: ['shared'] };
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
  if (configured) Object.assign(env, { OWNER_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, AUTH_ORIGIN: origin });
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
      ['/api/export/opportunities.csv', 'GET'], ['/api/config', 'GET'],
      ['/api/opportunities/opp_shared/ai-drafts', 'POST'],
      ['/api/scan/youtube-niche', 'POST'], ['/api/import/youtube', 'POST'],
      ['/api/opportunities/opp_shared/status', 'POST'], ['/api/import-runs/run_one', 'DELETE'],
    ];
    for (const [path, method] of unauthenticated) {
      const response = await fetch(`${origin}${path}`, { method, redirect: 'manual', headers: { origin } });
      assert.equal(response.status, method === 'GET' && !path.startsWith('/api/') ? 303 : 401, `${method} ${path} must reject strangers`);
    }
    assert.equal((await fetch(`${origin}/api/health`)).status, 200);
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
    assert.equal((await fetch(`${origin}/api/export/opportunities.csv`, { headers })).status, 200);
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
