// Review annotation only: OLSP matches never affect collection, scoring, ranking or actions.
export const OLSP_DOMAINS = Object.freeze(['olspacademy.com', 'olsplink.com', 'olspsystem.com']);
const DOMAIN_MATCHERS = OLSP_DOMAINS.map((domain) => ({
  kind: 'domain', indicator: domain,
  // A host label may precede the exact domain; a different suffix or lookalike may not.
  regex: new RegExp(`(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*${domain.replaceAll('.', '\\.')}(?=$|[^a-z0-9.-])`, 'i'),
}));
const PHRASES = ['OLSP Academy', 'OLSP System', 'OLSP Link'];
const BRAND_MATCHERS = PHRASES.map((indicator) => ({
  kind: 'brand', indicator,
  regex: new RegExp(`\\b${indicator.replace(' ', '\\s+')}\\b`, 'i'),
}));
const MATCHERS = [...DOMAIN_MATCHERS, ...BRAND_MATCHERS, { kind: 'brand', indicator: 'OLSP', regex: /\bOLSP\b/i }];

function matchField(value, scope, field) {
  if (typeof value !== 'string' || !value) return null;
  const variants = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) variants.push(decoded);
  } catch { /* Keep matching the original if URL encoding is malformed. */ }
  for (const text of variants) {
    for (const { kind, indicator, regex } of MATCHERS) {
      const match = regex.exec(text);
      if (match) return { scope, field, kind, indicator, evidence: match[0] };
    }
  }
  return null;
}

export function olspVideoMatch(video = {}) {
  video = video || {};
  for (const [field, value] of Object.entries({
    'channel name': video.channelName || video.channelTitle,
    'video title': video.title,
    'video description': video.description,
    'video URL': video.url,
  })) {
    const found = matchField(value, 'source', field);
    if (found) return found;
  }
  return null;
}

export function olspCommentMatch(comment = {}) {
  return matchField(comment?.textOriginal || comment?.text, 'comment', 'text');
}

export function olspReviewFor(video, comment) {
  const source = olspVideoMatch(video);
  const commentMatch = olspCommentMatch(comment);
  if (!source && !commentMatch) return null;
  const reason = [source, commentMatch].filter(Boolean)
    .map(({ scope, field, evidence }) => `${scope === 'source' ? 'Source' : 'Comment'} ${field}: ${evidence}`)
    .join('; ');
  return { flagged: true, source, comment: commentMatch, reason };
}
