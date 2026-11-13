# Best Leads System AI

Best Leads System AI finds people asking for help in public YouTube comments, scores them as leads and helps you write replies you post yourself. YouTube access is read-only.

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
- Optional for browser-only Google Sheets export: `GOOGLE_CLIENT_ID` (public OAuth **Web application** client ID; never a client secret)

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
- **Best leads** hides comments marked not a fit; browse them in **Not a fit**, with the reason shown. CSV exports include the reason.
- `scanNiche` asks search for up to 2x `maxVideos` candidates (cap 50), makes one batched `videos.list` call (~1 quota unit) for comment counts and reuses its video metadata during import (no second lookup on normal scans), drops videos under 10 comments, prefers well-commented videos with beginner / legit / honest titles, and keeps the top `maxVideos`. If `videos.list` fails it keeps search order, retries a metadata lookup during import, and records a `video_ranking_failed` entry in `searchErrors`.
- Scan results are loaded by the scan's own opportunity ids (`run.opportunityIds`, up to 1000), never by a store-wide top-N, so every comment a scan reads is listed.
- The comment budget (`maxCommentsPerRun`, max 300) is shared fairly: each video gets `ceil(remaining / videos left)`. For niche scans the server chooses the page count from that allowance (one page when <=100, max three). Unused allowance rolls forward and a bounded second pass can return remaining slots to earlier videos that still have comments. Each run records `videoResults` per video (read, listed, repeats, capped, why it stopped), and the scan response includes a `summary` (`headline` such as "5 leads + 53 not a fit", `notShown`, per-video breakdown). A video's public commentCount can include replies or become stale, so some ranked videos can return no readable top-level comments.
- Tests: `npm run check:niche`, `npm run check:scan`, and `npm run check:drafts` (offline; mock YouTube client, temp store, no paid calls).

## Dashboard layout

**Sidebar:** a left tools sidebar (a Menu button on phones; Escape closes it) holds Open a saved scan, Advanced: scan specific videos, Export CSV, Export to Google Sheets, and More options (video age, most comments to read, inline). Open a saved scan and Advanced open in a shared accessible pop-up (`src/ui/modal.tsx`: focus trap, Escape / Close / backdrop close, scroll lock, full screen on phones). Saved scans are listed newest first as cards (title, comments / YouTube units / status, lead counts for newer scans, Open this scan, Delete with confirm); formatting lives in `src/ui/scanFormat.js`, tested by `scripts/check-scan-format.mjs` (part of `check:scan`). Step 2 keeps only the scan sizes, the main button and a one-line options summary that opens More options. The options live in one shared object (`src/ui/scanOptions.js`, tested by `scripts/check-scan-options.mjs`, part of `check:scan`), so the scan always uses what the sidebar shows. The header keeps Settings, Reset for new scan and Sign out.

**Reply drafts:** Imports never create copyable template replies. Older `template_import` and `server_ai_fallback` coaching drafts remain hidden. Opening an open Best/Maybe lead requests OpenAI once after a short pause when configured; an existing safe draft is reused. If the key is missing or OpenAI fails, only a deterministic, niche-specific answer that matches the actual comment can appear, labelled **Suggested draft (automatic fallback)**. If no safe reply fits, Copy reply, Copy full summary and Reply ready stay disabled. Video ideas are not copyable as comment replies. Steve reviews and posts every draft himself.

The first screen is a guided 4-step flow: 1) choose what you are looking for, 2) run the scan (Quick / Standard / Deep, with More options, Advanced video links and saved scans), 3) review your leads (Best leads, Maybe, Not a fit, Done; Buyer and Site-owner tabs only appear when those comments exist; status, strength and type filters live under More filters), 4) reply (OpenAI-written Short answer / Detailed answer / Video idea, copy an answer, open the comment, mark done). Finished steps collapse to a summary with Change; the last saved run and selected lead restore from this browser tab's session storage after a reload. Settings, Export CSV and Sign out are in the header. Quota shown before a niche scan is an estimate from search calls × 100 + one video lookup + the bounded comment-page calls; actual units and per-video reasons are shown after a scan in its breakdown. Video comment counts can include replies or be stale, so a ranked video may have no readable threads; a bounded second pass gives unused comment allowance back to earlier readable videos. The YouTube AI prompt stays grounded in that comment and only mentions affiliate disclosure for affiliate-link or earnings questions. YouTube links open through normal anchors in a new tab. UI code lives in `src/ui/`; `src/scoring/leadBuckets.js` is the shared rule for which tab a comment belongs to.

## Settings, scan deletion and API key status

- Settings (default scan size, video age, reply tone and enabled niches) load before the dashboard renders and save to the same JSON store as scans. Authenticated `GET /api/settings` and CSRF-protected `PUT /api/settings` accept only validated fields; an unknown field or niche is rejected. Keep the existing `IMPORT_STORE_PATH` persistent disk when deploying.
- New scans record exact opportunity, comment and video IDs. Deleting a scan removes a record only after its last run reference is gone. A scan saved before exact membership existed returns HTTP 409 and is **not** deleted rather than guessing what it owned. If a newer scan overlaps a legacy scan, some records are kept with an explicit warning.
- Public `/api/health` returns only `{ "ok": true | false }`. Authenticated `/api/config` reports whether keys are configured and the last known YouTube/OpenAI outcome from real requests. No paid health checks are made; a server restart resets the outcome to unknown. Error responses never contain upstream messages or API key fragments.

## Google Sheets export (optional)

1. In Google Cloud Console, create or select a project, enable **Google Sheets API**, and configure an OAuth consent screen. Add Steve's Google account as a test user if the app remains in Testing mode.
2. Create an **OAuth client ID** of type **Web application**. Set its **Authorized JavaScript origin** to exactly `https://youtube-lead-signal-dashboard.onrender.com` (no trailing slash). For this GIS token/popup flow, no redirect URI is needed. Keep the OAuth client secret out of the app.
3. Set the public OAuth client ID as `GOOGLE_CLIENT_ID` in Render environment settings; do not set a client secret. Deploy only when ready; setting a Render variable may trigger a deploy, so confirm the service's deploy settings first.
4. Sign in to the dashboard. Under the sidebar, click **Export to Google Sheets** once to load the Google Identity Services library, then click it again to open Google's consent popup. It requests only `https://www.googleapis.com/auth/spreadsheets` at that click, creates a new spreadsheet and writes the **currently filtered** comments. The access token stays only in the browser's memory for that request, never in app storage, a URL, a server log or a server request. If the second write fails, the app links the newly created (possibly empty) sheet rather than claiming success. CSV export still works without Google setup.

The Content Security Policy permits only the GIS script (`accounts.google.com/gsi/client`), GIS auth/frame endpoints, the exact Sheets create endpoint (`/v4/spreadsheets`) and its slash-terminated subpath (`/v4/spreadsheets/`) for values writes in addition to same-origin resources; `Cross-Origin-Opener-Policy: same-origin-allow-popups` allows Google's popup to return its token. The `spreadsheets` scope grants the browser session broad spreadsheet access, so click Export only when you intend to use it. No Google API call runs in offline tests.

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
