# YouTube Lead Signal Dashboard

Read-only YouTube comment import and review dashboard for affiliate marketing opportunities.

## Safety boundary

- Imports public YouTube comments read-only.
- Does not post replies.
- Does not moderate, like, delete, or submit YouTube comments.
- Steve reviews, copies, edits, and posts manually.

## Render settings

- Runtime: Node
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Required before deploying this protected version: `AUTH_ORIGIN`, `OWNER_PASSWORD`, `SESSION_SECRET` (see below)
- Required for YouTube imports: `YOUTUBE_API_KEY`
- Optional for live AI drafts: `OPENAI_API_KEY`

## Owner-only access

Set `AUTH_ORIGIN` to the exact HTTPS origin that appears in the browser (for example `https://your-service.onrender.com`, without a trailing slash). Use a unique password of at least 16 characters in `OWNER_PASSWORD` and a separate randomly generated secret of at least 32 characters in `SESSION_SECRET`. Keep all three in Render environment settings, never in source, frontend code, screenshots, or logs. If any is missing or invalid, the app returns 503 instead of serving the dashboard. The only public endpoint is minimal `/api/health`; the sign-in form is public only after configuration.

Sessions use a secure HttpOnly SameSite=Strict cookie for 8 hours and are held in one server process: restart or redeploy signs everyone out. POST and DELETE calls require both same-origin checks and a per-session CSRF token; sign-in attempts are limited per process. This design is for a single instance and one owner, not a multi-user service or horizontally scaled replicas. Log out using **Sign out**. A public URL remains a public login surface: use additional network-level access controls if the deployment needs to be hidden entirely.

For local browser testing only, `AUTH_ORIGIN=http://127.0.0.1:4174` (or localhost) permits an insecure cookie. Do not use HTTP or a localhost origin for a publicly reachable deployment. Run `npm run check:security` to verify the access boundary using isolated temporary data; it does not call YouTube or a live service.

**Deployment order for the currently public service:** restrict access or pause the service first if exposure must stop immediately. Add the three auth environment variables in Render before deploying this code, checking whether saving settings triggers a deploy; keep automatic deployment off while preparing. Preserve `IMPORT_STORE_PATH` and its persistent disk. Deploy only after the settings are present, then verify anonymous access is denied and an owner can sign in using a browser. Do not expose or paste the password during verification. Setting variables alone does **not** protect the old running code.

## Local development

```bash
npm install
npm run build
AUTH_ORIGIN=http://127.0.0.1:4174 OWNER_PASSWORD='local-dev-password-at-least-16-chars' SESSION_SECRET='local-dev-random-secret-at-least-32-chars' YOUTUBE_API_KEY=your_key npm start
```


## Niche scans: lead scoring and video picks

- Niche scans (imports with a `profileId`) score each comment with `server/scoring/nicheLead.js`: `niche_lead` ("Niche lead") or `low_fit_comment` with a machine `lowFitReason` (`praise_only`, `video_housekeeping`, `self_promotion`, `links_only`, `greeting_only`, `too_short`, `off_topic`, `generic_question`, `channel_owner`) and a plain-English `summary`. Manual URL imports still use `src/scoring/scoring.js` unchanged.
- Best Comments hides low-fit items; browse them in the **Low fit** tab. CSV exports include the reason.
- `scanNiche` asks search for up to 2x `maxVideos` candidates (cap 50), makes one batched `videos.list` call (~1 quota unit) for comment counts, drops videos under 10 comments, prefers well-commented videos with beginner / legit / honest titles, and keeps the top `maxVideos`. If `videos.list` fails it keeps search order and records a `video_ranking_failed` entry in `searchErrors`.
- Tests: `npm run check:niche` (offline; mock YouTube client, no paid calls).

## Persistent storage on Render

For deployed use, add a Render persistent disk and set:

```text
IMPORT_STORE_PATH=/var/data/import-store.json
```

Recommended disk:

```text
Name: youtube-dashboard-data
Mount path: /var/data
Size: 1 GB
```

See `docs/render-persistent-storage.md`.
