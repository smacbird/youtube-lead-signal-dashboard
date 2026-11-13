import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { JsonImportStore, hydrateOpportunity, RUN_RESULT_LIMIT } from './persistence/store.js';
import { buildRunSummary } from './import/runSummary.js';
import { formatScanTitle, scanNiche } from './scan/scanNiche.js';
import { importYouTubeVideos } from './import/importService.js';
import { YouTubeReadOnlyClient } from './youtube/client.js';
import { listNicheProfiles } from './youtube/nicheProfiles.js';
import { generateReplyDrafts } from './ai/draftGenerator.js';
import { canPrepareReply, safeDraftsForOpportunity } from '../src/scoring/draftSafety.js';
import { createAuth } from './auth.js';
import { lastKnownKeyStatus } from './keyHealth.js';

const PORT = Number(process.env.PORT || 4174);
const store = new JsonImportStore();
const youtubeClient = new YouTubeReadOnlyClient();
const auth = createAuth();
// OAuth web-client ID is public metadata, never an access token or client secret.
const googleClientId = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(process.env.GOOGLE_CLIENT_ID || '')
  ? process.env.GOOGLE_CLIENT_ID : null;
const draftInflight = new Map(); // coalesce duplicate requests for one opportunity
let draftQueue = Promise.resolve(); // serialize paid calls across opportunities
const STATIC_ROOT = join(process.cwd(), 'dist');
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };


async function sendStatic(response, pathname) {
  const clean = normalize(pathname).replace(/^\/+/, '');
  const filePath = join(STATIC_ROOT, clean || 'index.html');
  if (!filePath.startsWith(STATIC_ROOT)) {
    sendJson(response, 403, { error: { code: 'forbidden', message: 'Forbidden.' } });
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    if (pathname.includes('.')) {
      sendJson(response, 404, { error: { code: 'not_found', message: 'File not found.' } });
      return;
    }
    const body = await readFile(join(STATIC_ROOT, 'index.html'));
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(body);
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64 * 1024) {
      const error = new Error('Request too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function routeError(response, error) {
  const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  sendJson(response, status, { error: { code: error?.code || 'server_error', message: error?.message || 'Server error.' } });
}



function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function opportunitiesToCsv(items) {
  const rows = [
    ['score', 'type', 'priority', 'risk', 'status', 'reason', 'low_fit_reason', 'olsp_review', 'olsp_reason', 'video', 'commenter', 'comment', 'url', 'niche'],
    ...items.map((item) => [
      item.overallScore,
      item.opportunityTypeLabel,
      item.priority,
      item.riskLevel,
      item.status,
      item.summary,
      item.lowFitReason || '',
      item.olspReview?.flagged ? 'OLSP: review' : '',
      item.olspReview?.reason || '',
      item.video?.title,
      item.comment?.authorDisplayName,
      item.comment?.textOriginal,
      item.comment?.url,
      item.nicheProfileLabel,
    ]),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

const LOGIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#071024"><title>Best Leads System AI sign in</title><link rel="icon" type="image/png" href="/favicon.png"><link rel="stylesheet" href="/login.css"></head><body><main class="login-card"><img class="login-logo" src="/brand-logo.png" width="320" height="128" alt="Best Leads System AI"><div class="login-copy"><p class="login-kicker">PRIVATE WORKSPACE</p><h1>Welcome back</h1><p class="login-description">Sign in to review your YouTube leads</p></div><form action="/login" method="post"><label for="owner-password">Owner password</label><input id="owner-password" type="password" name="password" required autocomplete="current-password" autofocus><button type="submit">Sign in securely <span aria-hidden="true">→</span></button></form><p class="login-footnote">Your scans and reply drafts are private to your account.</p></main></body></html>`;

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'same-origin');
  response.setHeader('content-security-policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    + (googleClientId ? "; script-src 'self' https://accounts.google.com/gsi/client; connect-src 'self' https://accounts.google.com/gsi/ https://sheets.googleapis.com/v4/spreadsheets https://sheets.googleapis.com/v4/spreadsheets/; frame-src https://accounts.google.com/gsi/; style-src 'self' https://accounts.google.com/gsi/style" : ''));
  if (googleClientId) response.setHeader('cross-origin-opener-policy', 'same-origin-allow-popups');

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, auth.configured ? 200 : 503, { ok: auth.configured });
      return;
    }
    if (!auth.configured) {
      sendJson(response, 503, { error: { code: 'auth_not_configured', message: 'Service unavailable.' } });
      return;
    }
    if (!auth.sameHost(request)) {
      sendJson(response, 403, { error: { code: 'invalid_host', message: 'Forbidden.' } });
      return;
    }
    if (request.method === 'GET' && ['/brand-logo.png', '/favicon.png', '/login.css'].includes(url.pathname)) {
      // Only sign-in branding assets are public; everything else stays behind the login.
      const file = { '/brand-logo.png': 'logo.png', '/favicon.png': 'favicon.png', '/login.css': 'login.css' }[url.pathname];
      try {
        const body = await readFile(join(STATIC_ROOT, file));
        const contentType = url.pathname === '/login.css' ? 'text/css; charset=utf-8' : 'image/png';
        response.writeHead(200, { 'content-type': contentType, 'cache-control': 'public, max-age=3600' });
        response.end(body);
      } catch {
        sendJson(response, 404, { error: { code: 'not_found', message: 'File not found.' } });
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/login') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(LOGIN_PAGE);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/login') {
      if (!auth.sameOrigin(request)) {
        sendJson(response, 403, { error: { code: 'invalid_origin', message: 'Forbidden.' } });
        return;
      }
      if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
        sendJson(response, 415, { error: { code: 'invalid_content_type', message: 'Invalid request.' } });
        return;
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 4096) { sendJson(response, 413, { error: { code: 'too_large', message: 'Invalid request.' } }); return; }
        chunks.push(chunk);
      }
      const password = new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('password') || '';
      const result = auth.login(request, password);
      if (result.status === 303) {
        response.writeHead(303, { location: '/', 'set-cookie': result.cookie });
        response.end();
      } else {
        response.writeHead(result.status, { 'content-type': 'text/html; charset=utf-8' });
        response.end(`${LOGIN_PAGE}<p>Sign in failed or temporarily limited. Please try again later.</p>`);
      }
      return;
    }
    const session = auth.currentSession(request);
    if (!session) {
      if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
        response.writeHead(303, { location: '/login' });
        response.end();
      } else {
        sendJson(response, 401, { error: { code: 'unauthorized', message: 'Sign in required.' } });
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/session') {
      sendJson(response, 200, { csrfToken: session.csrf });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/config') {
      sendJson(response, 200, { ok: true, youtubeApiKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY), aiDraftsConfigured: Boolean(process.env.OPENAI_API_KEY), aiDraftProvider: process.env.OPENAI_API_KEY ? 'openai' : 'none', googleClientId, apiHealth: lastKnownKeyStatus() });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/settings') {
      sendJson(response, 200, { settings: await store.getSettings() });
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!auth.sameOrigin(request) || request.headers['x-csrf-token'] !== session.csrf) {
        sendJson(response, 403, { error: { code: 'csrf_failed', message: 'Forbidden.' } });
        return;
      }
    }
    if (request.method === 'PUT' && url.pathname === '/api/settings') {
      const body = await readJson(request);
      sendJson(response, 200, { settings: await store.updateSettings(body) });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/logout') {
      auth.logout(response, session);
      response.writeHead(303, { location: '/login' });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/export/opportunities.csv') {
      const items = await store.listOpportunities({ limit: url.searchParams.get('limit') || 500 });
      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="best-lead-system-opportunities.csv"',
        'cache-control': 'no-store',
      });
      response.end(opportunitiesToCsv(items));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opportunities') {
      const opportunities = await store.listOpportunities({ limit: url.searchParams.get('limit') || 100 });
      sendJson(response, 200, { items: opportunities });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/import-runs') {
      const runs = await store.listImportRuns({ limit: url.searchParams.get('limit') || 25 });
      sendJson(response, 200, { items: runs.map((run) => ({ ...run, title: run.title || formatScanTitle({ profileLabel: run.metadata?.profileLabel || (run.metadata?.scanType === 'manual' ? 'Manual URLs' : 'Previous scan'), daysBack: run.metadata?.daysBack || 'manual', maxVideos: run.metadata?.maxVideos || run.requestedVideoIds?.length || 'manual', commentsFetched: run.commentsFetched, startedAt: run.startedAt }) })) });
      return;
    }



    const importRunMatch = url.pathname.match(/^\/api\/import-runs\/([^/]+)$/);
    if (request.method === 'GET' && importRunMatch) {
      const result = await store.listOpportunitiesForRun(importRunMatch[1], { limit: url.searchParams.get('limit') || RUN_RESULT_LIMIT });
      if (!result.run) {
        sendJson(response, 404, { error: { code: 'scan_not_found', message: 'Previous scan not found.' } });
        return;
      }
      const run = { ...result.run, title: result.run.title || formatScanTitle({ profileLabel: result.run.metadata?.profileLabel || (result.run.metadata?.scanType === 'manual' ? 'Manual URLs' : 'Previous scan'), daysBack: result.run.metadata?.daysBack || 'manual', maxVideos: result.run.metadata?.maxVideos || result.run.requestedVideoIds?.length || 'manual', commentsFetched: result.run.commentsFetched, startedAt: result.run.startedAt }) };
      sendJson(response, 200, { run, items: result.items, summary: buildRunSummary(run, result.items, { total: result.total }) });
      return;
    }

    if (request.method === 'DELETE' && importRunMatch) {
      const result = await store.deleteImportRun(importRunMatch[1]);
      sendJson(response, result.code === 'legacy_run_membership_unknown' ? 409 : 200, result);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/niche-profiles') {
      sendJson(response, 200, { items: listNicheProfiles() });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/scan/youtube-niche') {
      const body = await readJson(request);
      const result = await scanNiche({ body, store, youtubeClient });
      sendJson(response, result.run.status === 'failed' && !result.videosFound.length ? 400 : 200, result);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/import/youtube') {
      const body = await readJson(request);
      const run = await importYouTubeVideos({ inputs: body.videoUrls || body.inputs || [], options: body, store, youtubeClient, metadata: { scanType: 'manual', profileLabel: 'Manual URLs', maxVideos: body.maxVideos || body.videoUrls?.length || body.inputs?.length || 'manual' } });
      run.title = formatScanTitle({ profileLabel: 'Manual URLs', daysBack: 'manual', maxVideos: run.requestedVideoIds?.length || 'manual', commentsFetched: run.commentsFetched, startedAt: run.startedAt });
      const runResult = await store.listOpportunitiesForRun(run.id, { limit: RUN_RESULT_LIMIT });
      sendJson(response, run.status === 'failed' ? 400 : 200, { run, items: runResult.items, summary: buildRunSummary(run, runResult.items, { total: runResult.total }) });
      return;
    }

    const statusMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/status$/);
    if (request.method === 'POST' && statusMatch) {
      const body = await readJson(request);
      const opportunity = await store.transitionStatus(statusMatch[1], body.toStatus, { note: body.note || '' });
      sendJson(response, 200, { item: opportunity });
      return;
    }

    const draftMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/selected-draft$/);
    if (request.method === 'POST' && draftMatch) {
      const body = await readJson(request);
      const opportunity = await store.setSelectedDraft(draftMatch[1], body.draftId);
      sendJson(response, 200, { item: opportunity });
      return;
    }

    const repliedMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/manual-replied$/);
    if (request.method === 'POST' && repliedMatch) {
      const body = await readJson(request);
      const opportunity = await store.markManuallyReplied(repliedMatch[1], body.note || undefined);
      sendJson(response, 200, { item: opportunity });
      return;
    }

    const aiDraftMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/ai-drafts$/);
    if (request.method === 'POST' && aiDraftMatch) {
      const body = await readJson(request);
      const id = aiDraftMatch[1];
      if (draftInflight.has(id)) {
        await draftInflight.get(id);
        const saved = await store.load();
        sendJson(response, 200, { item: hydrateOpportunity(saved, id), provider: 'cached' });
        return;
      }
      const work = draftQueue.then(() => store.mutate(async (data) => {
        const opportunity = hydrateOpportunity(data, id);
        if (!opportunity) throw new Error(`opportunity_not_found:${id}`);
        if (opportunity.opportunityType === 'low_fit_comment' || ['replied', 'rejected'].includes(opportunity.status)) {
          const error = new Error('Reply ideas are only for open leads.');
          error.status = 400;
          throw error;
        }
        const cached = safeDraftsForOpportunity(opportunity.replyDrafts, id);
        if (canPrepareReply(cached, id) && !body.force) return { item: opportunity, provider: 'cached' };
        const generated = await generateReplyDrafts(opportunity);
        for (const draft of generated.drafts) data.replyDrafts[draft.id] = draft;
        const answer = generated.drafts.find((draft) => draft.style === 'ai_short_helpful')
          || generated.drafts.find((draft) => draft.style === 'ai_consultative')
          || generated.drafts.find((draft) => draft.style === 'fallback_short') || generated.drafts[0];
        data.opportunities[id].selectedDraftId = answer.id;
        data.opportunities[id].updatedAt = new Date().toISOString();
        return { item: hydrateOpportunity(data, id), provider: generated.provider };
      }));
      draftQueue = work.catch(() => {});
      draftInflight.set(id, work);
      try {
        const result = await work;
        sendJson(response, 200, result);
      } finally { draftInflight.delete(id); }
      return;
    }

    if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
      await sendStatic(response, url.pathname);
      return;
    }

    sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found.' } });
  } catch (error) {
    routeError(response, error);
  }
}

createServer(handle).listen(PORT, '0.0.0.0', () => {
  console.log(`Best Leads System AI listening on port ${PORT}`);
});
