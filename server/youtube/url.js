const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function cleanCandidate(value) {
  return String(value || '').trim();
}

export function isYouTubeVideoId(value) {
  return VIDEO_ID_PATTERN.test(cleanCandidate(value));
}

function firstPathSegment(pathname) {
  return pathname.split('/').filter(Boolean)[0] || '';
}

function pathSegmentAfter(pathname, marker) {
  const parts = pathname.split('/').filter(Boolean);
  const index = parts.indexOf(marker);
  return index >= 0 ? parts[index + 1] || '' : '';
}

export function parseYouTubeVideoInput(input) {
  const value = cleanCandidate(input);
  if (!value) {
    return { ok: false, code: 'empty_input', message: 'Paste a YouTube video URL or video ID.' };
  }

  if (isYouTubeVideoId(value)) {
    return { ok: true, videoId: value, source: 'bare_video_id' };
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: 'invalid_url', message: 'Input is not a valid URL or 11-character YouTube video ID.' };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') {
    const id = firstPathSegment(url.pathname);
    return isYouTubeVideoId(id)
      ? { ok: true, videoId: id, source: 'youtu.be' }
      : { ok: false, code: 'invalid_video_id', message: 'The youtu.be URL does not contain a valid video ID.' };
  }

  if (!['youtube.com', 'youtube-nocookie.com'].includes(host)) {
    return { ok: false, code: 'unsupported_host', message: 'Only youtube.com and youtu.be video URLs are supported.' };
  }

  const watchId = url.searchParams.get('v');
  if (isYouTubeVideoId(watchId)) {
    return { ok: true, videoId: watchId, source: 'watch_url' };
  }

  const pathId = pathSegmentAfter(url.pathname, 'shorts')
    || pathSegmentAfter(url.pathname, 'embed')
    || pathSegmentAfter(url.pathname, 'live')
    || pathSegmentAfter(url.pathname, 'v');
  if (isYouTubeVideoId(pathId)) {
    return { ok: true, videoId: pathId, source: 'path_url' };
  }

  return { ok: false, code: 'unsupported_url_shape', message: 'Supported YouTube URL shapes are watch, youtu.be, shorts, embed, live, or bare video IDs.' };
}

export function parseManyYouTubeVideoInputs(inputs, maxVideos = 5) {
  const rawInputs = Array.isArray(inputs) ? inputs : String(inputs || '').split(/[\n,]/);
  const seen = new Set();
  const videoIds = [];
  const rejected = [];

  for (const rawInput of rawInputs) {
    const parsed = parseYouTubeVideoInput(rawInput);
    if (!parsed.ok) {
      if (String(rawInput || '').trim()) rejected.push({ input: String(rawInput).trim(), ...parsed });
      continue;
    }
    if (!seen.has(parsed.videoId)) {
      seen.add(parsed.videoId);
      videoIds.push(parsed.videoId);
    }
  }

  return {
    videoIds: videoIds.slice(0, maxVideos),
    rejected,
    capped: videoIds.length > maxVideos,
    originalUniqueCount: videoIds.length,
  };
}

export function normalizeVideoUrl(videoId) {
  if (!isYouTubeVideoId(videoId)) throw new Error('invalid_video_id');
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function normalizeCommentUrl(videoId, commentId) {
  const baseUrl = normalizeVideoUrl(videoId);
  if (!commentId) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('lc', String(commentId));
  return url.toString();
}
