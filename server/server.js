import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { JsonImportStore, hydrateOpportunity } from './persistence/store.js';
import { importYouTubeVideos } from './import/importService.js';
import { YouTubeReadOnlyClient } from './youtube/client.js';
import { listNicheProfiles, resolveNicheProfile } from './youtube/nicheProfiles.js';
import { generateReplyDrafts } from './ai/draftGenerator.js';

const PORT = Number(process.env.PORT || 4174);
const store = new JsonImportStore();
const youtubeClient = new YouTubeReadOnlyClient();
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
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function routeError(response, error) {
  const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  sendJson(response, status, { error: { code: error?.code || 'server_error', message: error?.message || 'Server error.' } });
}


function daysAgoIso(days) {
  const date = new Date(Date.now() - Math.max(1, Number(days) || 14) * 86400000);
  return date.toISOString();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function scanNiche({ body, store, youtubeClient }) {
  const profileId = body.profileId || body.nicheProfile || 'affiliate_marketing';
  const profile = resolveNicheProfile(profileId);
  const maxVideos = clampNumber(body.maxVideos, 1, 25, 10);
  const daysBack = clampNumber(body.daysBack, 1, 90, 14);
  const queries = Array.isArray(body.queries) && body.queries.length
    ? body.queries.map((value) => String(value).trim()).filter(Boolean).slice(0, 8)
    : profile.queries;
  const perQuery = Math.max(1, Math.ceil(maxVideos / Math.max(1, queries.length)));
  const publishedAfter = daysAgoIso(daysBack);
  const found = [];
  const seen = new Set();
  const searchErrors = [];
  let estimatedSearchQuotaUnits = 0;

  for (const query of queries) {
    if (found.length >= maxVideos) break;
    try {
      estimatedSearchQuotaUnits += 100;
      const response = await youtubeClient.searchVideos({ query, publishedAfter, maxResults: perQuery, order: body.order || 'date' });
      for (const item of response.items || []) {
        const id = item?.id?.videoId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        found.push({
          id,
          url: `https://www.youtube.com/watch?v=${id}`,
          title: item?.snippet?.title || 'YouTube video',
          channelTitle: item?.snippet?.channelTitle || '',
          publishedAt: item?.snippet?.publishedAt || '',
          matchedQuery: query,
        });
        if (found.length >= maxVideos) break;
      }
    } catch (error) {
      searchErrors.push({ query, code: error?.code || 'search_error', message: error?.message || 'YouTube search failed.' });
    }
  }

  const run = await importYouTubeVideos({
    inputs: found.map((video) => video.url),
    options: {
      ...body,
      maxVideos,
      maxPagesPerVideo: body.maxPagesPerVideo || body.maxPages || 1,
      maxCommentsPerRun: body.maxCommentsPerRun || body.maxComments || 250,
      maxResultsPerPage: body.maxResultsPerPage || body.maxCommentsPerVideo || 50,
    },
    store,
    youtubeClient,
  });
  run.estimatedQuotaUnits += estimatedSearchQuotaUnits;
  for (const error of searchErrors) run.errors.push(error);

  return {
    profileId,
    profileLabel: profile.label,
    queries,
    daysBack,
    videosFound: found,
    estimatedSearchQuotaUnits,
    searchErrors,
    run,
  };
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true, youtubeApiKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY), aiDraftsConfigured: Boolean(process.env.OPENAI_API_KEY), aiDraftProvider: process.env.OPENAI_API_KEY ? 'openai' : 'server_fallback' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opportunities') {
      const opportunities = await store.listOpportunities({ limit: url.searchParams.get('limit') || 100 });
      sendJson(response, 200, { items: opportunities });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/import-runs') {
      const runs = await store.listImportRuns({ limit: url.searchParams.get('limit') || 25 });
      sendJson(response, 200, { items: runs });
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
      const run = await importYouTubeVideos({ inputs: body.videoUrls || body.inputs || [], options: body, store, youtubeClient });
      sendJson(response, run.status === 'failed' ? 400 : 200, { run });
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
      let provider = 'server_fallback';
      const item = await store.mutate(async (data) => {
        const opportunity = hydrateOpportunity(data, aiDraftMatch[1]);
        if (!opportunity) throw new Error(`opportunity_not_found:${aiDraftMatch[1]}`);
        const generated = await generateReplyDrafts(opportunity);
        provider = generated.provider;
        for (const draft of generated.drafts) data.replyDrafts[draft.id] = draft;
        const existing = data.opportunities[aiDraftMatch[1]];
        existing.selectedDraftId = generated.drafts[0]?.id || existing.selectedDraftId;
        existing.updatedAt = new Date().toISOString();
        return hydrateOpportunity(data, aiDraftMatch[1]);
      });
      sendJson(response, 200, { item, provider });
      return;
    }

    if (request.method === 'GET') {
      await sendStatic(response, url.pathname);
      return;
    }

    sendJson(response, 404, { error: { code: 'not_found', message: 'Route not found.' } });
  } catch (error) {
    routeError(response, error);
  }
}

createServer(handle).listen(PORT, '0.0.0.0', () => {
  console.log(`Read-only YouTube import backend listening on http://0.0.0.0:${PORT}`);
});
