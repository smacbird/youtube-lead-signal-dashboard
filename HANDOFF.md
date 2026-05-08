# Handoff: Affiliate YouTube Data Dashboard

## Completed

The dashboard now supports both opportunity types Steve requested:

1. **Affiliate publisher opportunities**: site owners/publishers with traffic, tracking, commissions, disclosure, outdated review/comparison content, or affiliate funnel problems.
2. **Consumer buyer questions**: random consumers asking product-decision questions such as “which product should I buy?”, “best X under $Y”, “X vs Y”, and “is X worth it”.

The app has been copied into this job workspace under `app/` and expanded into a read-only import + persisted review MVP.

## Key features

- Expanded scoring taxonomy for publisher opportunities and consumer buyer questions.
- Sample fixtures covering both opportunity types.
- Opportunity type filter in the dashboard.
- Read-only backend foundation for YouTube imports.
- Backend-only `YOUTUBE_API_KEY` boundary: no key in frontend/files/chat.
- Persistent JSON store for imported videos, comments, scored opportunities, score dimensions, reply drafts, status history, selected draft, manual replied state, and import runs.
- Dashboard import panel for operator-provided YouTube video URLs.
- Persisted imported queue loading.
- Persisted local review actions for imported opportunities:
  - status transitions
  - selected draft
  - manual replied state
- Manual reply actions retained:
  - Open video
  - Open exact comment
  - Copy draft reply
  - Mark replied manually
- No YouTube posting/write/moderation endpoints.

## Run commands

From `app/`:

```bash
npm install
npm run check:scoring
npm run check:import
npm run build
```

Frontend only:

```bash
npm run dev
```

Backend API:

```bash
YOUTUBE_API_KEY=<stored securely in env> npm run dev:server
```

For local testing without live YouTube import, the self-contained preview is available at:

- `app/preview.html`

## API routes

Backend runs on `PORT` or `4174` by default.

- `GET /api/health`
- `GET /api/opportunities?limit=250`
- `GET /api/import-runs?limit=25`
- `POST /api/import/youtube`
- `POST /api/opportunities/:id/status`
- `POST /api/opportunities/:id/selected-draft`
- `POST /api/opportunities/:id/manual-replied`

## Verification

Passed:

```text
npm run check:scoring
npm run check:import
npm run build
```

Safety scan passed: no YouTube write/comment insert/update/delete/moderation endpoints and no literal API key values were found in the app source/docs, excluding generated dependency/build folders.

## Safety boundary

This is still a **manual-reply system**:

- The dashboard may import public YouTube comments if the backend has a server-side API key.
- The dashboard does not post replies.
- “Approved” is local review state only.
- “Replied” means Steve manually replied on YouTube and marked the dashboard item accordingly.
- Write-capable YouTube OAuth scopes are not part of this phase.

## Known limitations

- JSON-file persistence is MVP-grade. Use SQLite or a platform store before concurrent use or scheduled production imports.
- The frontend calls relative `/api/*` routes, so in production the frontend and backend need to be served behind the same origin/proxy.
- The self-contained `preview.html` uses fixture data only; live import requires the backend server.
- Real comment-anchor links use YouTube `lc=` format and should be spot-tested on the first live import.
