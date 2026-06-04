const API_ROOT = 'https://www.googleapis.com/youtube/v3';
const READ_ONLY_METHODS = new Set(['videos', 'commentThreads', 'search']);

function sanitizedError(code, message, status = 500, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function requireApiKey(apiKey = process.env.YOUTUBE_API_KEY) {
  if (!apiKey) throw sanitizedError('youtube_api_key_missing', 'YOUTUBE_API_KEY is not configured on the server.', 500);
  return apiKey;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw sanitizedError('youtube_invalid_json', 'YouTube returned a non-JSON response.', response.status);
  }
}

function youtubeErrorFromResponse(response, body) {
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || 'youtube_request_failed';
  const message = body?.error?.message || `YouTube API request failed with HTTP ${response.status}.`;
  return sanitizedError(reason, message, response.status, {
    httpStatus: response.status,
    youtubeReason: reason,
  });
}

function isRetryableStatus(status) {
  return status === 429 || [500, 502, 503, 504].includes(status);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class YouTubeReadOnlyClient {
  constructor({ apiKey = process.env.YOUTUBE_API_KEY, fetchImpl = globalThis.fetch, maxRetries = 2 } = {}) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.maxRetries = maxRetries;
  }

  async request(resource, params) {
    if (!READ_ONLY_METHODS.has(resource)) {
      throw sanitizedError('unsupported_youtube_resource', 'Only search.list, videos.list, and commentThreads.list are supported by this client.', 400);
    }
    if (typeof this.fetchImpl !== 'function') {
      throw sanitizedError('fetch_unavailable', 'A fetch implementation is required for YouTube imports.', 500);
    }

    const apiKey = requireApiKey(this.apiKey);
    const url = new URL(`${API_ROOT}/${resource}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    url.searchParams.set('key', apiKey);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await this.fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
      const body = await readJson(response);
      if (response.ok) return body;
      if (!isRetryableStatus(response.status) || attempt === this.maxRetries) throw youtubeErrorFromResponse(response, body);
      await sleep(250 * (attempt + 1));
    }
    throw sanitizedError('youtube_retry_exhausted', 'YouTube API retry attempts were exhausted.', 503);
  }


  async searchVideos({ query, publishedAfter, maxResults = 10, order = 'date' }) {
    return this.request('search', {
      part: 'snippet',
      type: 'video',
      q: query,
      order,
      maxResults: clamp(maxResults, 1, 25),
      publishedAfter,
      safeSearch: 'moderate',
      relevanceLanguage: 'en',
    });
  }

  async listVideos(videoIds) {
    const ids = [...new Set(videoIds)].slice(0, 50);
    if (!ids.length) return { items: [] };
    return this.request('videos', {
      part: 'snippet,statistics,status',
      id: ids.join(','),
      maxResults: ids.length,
    });
  }

  async listCommentThreads({ videoId, pageToken, maxResults = 100 }) {
    return this.request('commentThreads', {
      part: 'snippet',
      videoId,
      maxResults: clamp(maxResults, 1, 100),
      order: 'time',
      textFormat: 'plainText',
      pageToken,
    });
  }
}
