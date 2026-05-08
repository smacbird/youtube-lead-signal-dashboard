# Backend Import and Persistence Notes

## Scope

This phase adds a minimal Node server for read-only YouTube imports and durable local review state. It does not add any YouTube write operation, OAuth flow, comment posting, moderation, liking, or automatic replied state.

The frontend must never receive `YOUTUBE_API_KEY`. The only reference is server-side code reading `process.env.YOUTUBE_API_KEY`.

## Runtime

```bash
npm install
npm run dev:server
```

Default server port: `4174`.

Configure the API key outside the workspace, for example through gateway `env.vars`:

```text
YOUTUBE_API_KEY=<stored in platform env, not in files>
```

Optional store path override:

```text
IMPORT_STORE_PATH=/path/to/import-store.json
```

By default the app stores normalized data in `data/import-store.json`.

## Local API

### Health

```http
GET /api/health
```

Returns whether the server sees a configured YouTube API key, without returning the key.

### Manual YouTube import

```http
POST /api/import/youtube
Content-Type: application/json

{
  "videoUrls": ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  "maxPagesPerVideo": 1,
  "maxResultsPerPage": 100,
  "maxCommentsPerRun": 100
}
```

Server-side YouTube methods used:

- `videos.list`
- `commentThreads.list`

No other YouTube endpoint is implemented by `server/youtube/client.js`.

### Read imported opportunities

```http
GET /api/opportunities?limit=100
```

Returns hydrated opportunities with video, comment, score dimensions, reply drafts, and local status history.

### Read import runs

```http
GET /api/import-runs?limit=25
```

Returns import summaries with non-secret errors only.

### Local review state

These endpoints update only the local app store:

```http
POST /api/opportunities/{opportunityId}/status
POST /api/opportunities/{opportunityId}/selected-draft
POST /api/opportunities/{opportunityId}/manual-replied
```

`manual-replied` means the operator marked a reply as already handled outside the app. It does not call YouTube.

## Import caps

Current hard caps in `server/import/limits.js`:

- 5 videos per run
- 3 pages per video
- 100 comments per page
- 300 comments per run

The YouTube client retries retryable read failures (`429`, `500`, `502`, `503`, `504`) with a bounded backoff before recording a sanitized import error.

Estimated quota units are persisted in each import run: 1 for `videos.list` plus 1 per `commentThreads.list` page.

## URL handling

`server/youtube/url.js` supports:

- `https://www.youtube.com/watch?v={videoId}`
- `https://youtu.be/{videoId}`
- `https://www.youtube.com/shorts/{videoId}`
- `https://www.youtube.com/embed/{videoId}`
- `https://www.youtube.com/live/{videoId}`
- bare 11-character video IDs

Normalized URLs:

- Video: `https://www.youtube.com/watch?v={videoId}`
- Comment: `https://www.youtube.com/watch?v={videoId}&lc={commentId}`

Unsupported hosts and malformed IDs are rejected before any YouTube call.

## Persistence shape

The JSON store mirrors the planned normalized entities:

- `videos`
- `comments`
- `opportunities`
- `scoreDimensions`
- `replyDrafts`
- `statusHistory`
- `importRuns`

Secrets are not stored. Raw API responses are not stored. Stored errors include sanitized code/message/context only.

## Scoring integration

Imported comments are normalized into the existing `scoreSampleItem()` contract. This means the import path automatically uses the expanded scoring model when `src/scoring/scoring.js` exposes it.

The import mapper infers lightweight `signals` and `offerFit` from YouTube text/context so the existing scoring contract has the same shape as fixtures. That inference is intentionally conservative and should be tuned after real import review.

## Verification

```bash
npm run check:import
npm run check:scoring
npm run build
```

`npm run check:import` uses a fake YouTube client. It does not call Google and does not require `YOUTUBE_API_KEY`.
