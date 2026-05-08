# YouTube Data API Next Steps

## MVP boundary: read-only planning only

This MVP must stay disconnected from YouTube.

- No YouTube API credentials are required for the MVP.
- No live API calls should be made by the dashboard, scoring engine, tests, or build scripts.
- No comments, replies, messages, notifications, or other external communications should be posted.
- The approval workflow in the MVP is local/mock only: an `Approved` state means Steve approved the draft inside the prototype, not that anything was sent.
- The `Replied` state, if shown, must be manual/mock until a later explicitly approved integration phase.

The goal of this document is to define the safe next-step plan for connecting read-only YouTube data after MVP validation.

## Integration goals after MVP validation

After Steve validates the sample-data MVP, the first live integration should import YouTube video and comment context into the same data model already used by the dashboard.

Initial live integration scope:

1. Read public or owner-authorized video metadata.
2. Read comment threads for selected videos or channels.
3. Normalize API responses into the MVP entities.
4. Score imported comments with the existing scoring engine.
5. Store import metadata, errors, and quota usage for auditability.
6. Keep all posting features disabled until a separate approval phase.

Out of scope for the first API integration:

- Posting replies.
- Updating, moderating, deleting, or liking comments.
- Sending messages outside the system.
- Automatically marking anything as replied.
- Running broad channel-wide imports without quota and rate-limit controls.

## Credentials and access model

### API key for public read-only data

Use a Google Cloud project with the YouTube Data API v3 enabled. For public video/comment reads, an API key may be enough for endpoints that allow unauthenticated public access.

Expected uses:

- `videos.list` for public metadata and statistics.
- `commentThreads.list` for published comments on public videos where comments are enabled.

Storage requirement:

- Store the key only in gateway `env.vars`, for example `YOUTUBE_API_KEY`.
- Do not commit keys to files, fixtures, docs, logs, screenshots, or browser-visible bundles.
- Backend/server code should call YouTube; the frontend should call the app backend, not Google directly with a secret key.

### OAuth for owner-authorized data

OAuth is required when the integration needs access to data that depends on a channel owner or authenticated user, such as moderation states, private/owner-only fields, or any future write operation.

Expected future needs:

- Reading owner-only held-for-review or likely-spam queues in a separately approved OAuth phase.
- Accessing owner-only video parts where applicable.
- Any future reply insertion, update, or moderation action.

Storage requirement:

- Store OAuth client secrets and refresh tokens only in gateway `env.vars` or the platform-approved secret store.
- Never store refresh tokens in workspace files or frontend-accessible state.
- Token refresh must happen server-side with masked logs.

Recommended environment variable names:

- `YOUTUBE_API_KEY`
- `YOUTUBE_OAUTH_CLIENT_ID`
- `YOUTUBE_OAUTH_CLIENT_SECRET`
- `YOUTUBE_OAUTH_REFRESH_TOKEN`
- `YOUTUBE_CHANNEL_ID` or a per-workspace/channel configuration record

## Read endpoints

### `commentThreads.list`

Official endpoint:

```http
GET https://www.googleapis.com/youtube/v3/commentThreads
```

Purpose:

- Fetch top-level comment threads for a video or channel.
- Use `part=snippet` for top-level comment context.
- Add `replies` only when nested replies are needed, because response size and processing cost increase.

Recommended first request shape:

```http
GET /youtube/v3/commentThreads
  ?part=snippet
  &videoId={videoId}
  &maxResults=100
  &order=time
  &textFormat=plainText
  &pageToken={nextPageToken?}
```

Key parameters:

- `videoId`: fetch comments for one validated video at a time.
- `allThreadsRelatedToChannelId`: later option for channel-wide reads, only after quota planning.
- `maxResults`: 1-100; use 100 for batch imports, lower for interactive refreshes.
- `order=time`: default and best for incremental polling.
- `order=relevance`: useful for exploratory review, not for deterministic incremental sync.
- `textFormat=plainText`: preferred for scoring and display safety.
- `pageToken`: used for pagination through `nextPageToken`.
- `moderationStatus`: requires OAuth; do not use in the public read-only API-key phase.

Important response fields:

- `items[].id`: comment thread ID.
- `items[].snippet.videoId`: source video ID.
- `items[].snippet.channelId`: channel associated with the thread.
- `items[].snippet.topLevelComment.id`: top-level comment ID.
- `items[].snippet.topLevelComment.snippet.authorDisplayName`: display name for context.
- `items[].snippet.topLevelComment.snippet.authorChannelId.value`: stable author channel ID when present.
- `items[].snippet.topLevelComment.snippet.textDisplay` / `textOriginal`: comment text. Prefer plain text responses for scoring.
- `items[].snippet.topLevelComment.snippet.likeCount`: engagement context.
- `items[].snippet.topLevelComment.snippet.publishedAt`: original publish timestamp.
- `items[].snippet.topLevelComment.snippet.updatedAt`: edit timestamp.
- `items[].snippet.totalReplyCount`: reply activity signal.
- `nextPageToken`: fetch next page.
- `etag`: cache/change detection helper.

Expected errors to handle:

- `403 commentsDisabled`: mark the video as unavailable for comment ingestion, not a fatal system error.
- `403 forbidden`: permissions problem or insufficient authorization.
- `404 videoNotFound`: invalid or removed video.
- `404 channelNotFound`: invalid channel ID.
- `400 processingFailure`: validate request shape and log request metadata without secrets.

### `videos.list`

Official endpoint:

```http
GET https://www.googleapis.com/youtube/v3/videos
```

Purpose:

- Fetch source video metadata for context in the dashboard.
- Fetch statistics for lead-quality context, such as view/comment counts.
- Validate that requested video IDs exist before comment import.

Recommended first request shape:

```http
GET /youtube/v3/videos
  ?part=snippet,statistics,status
  &id={commaSeparatedVideoIds}
```

Key parameters:

- `id`: comma-separated video IDs. Use batch lookups before comment imports.
- `part=snippet`: title, description, channel, thumbnails, publish time.
- `part=statistics`: view/comment/like counts where available.
- `part=status`: privacy/upload status where available and permitted.
- `chart=mostPopular`: not needed for the MVP path; avoid until there is a discovery feature.

Important response fields:

- `items[].id`: video ID.
- `items[].snippet.channelId`: owning channel ID.
- `items[].snippet.channelTitle`: channel display name.
- `items[].snippet.title`: video title.
- `items[].snippet.description`: video description, if needed for niche/offer context.
- `items[].snippet.publishedAt`: video publish timestamp.
- `items[].snippet.thumbnails`: thumbnail URLs for display.
- `items[].statistics.viewCount`: reach context.
- `items[].statistics.commentCount`: comment volume context.
- `items[].statistics.likeCount`: engagement context, when available.
- `items[].status.privacyStatus`: avoid trying to import unavailable/private videos unless authorized.
- `etag`: cache/change detection helper.

Expected errors to handle:

- `404 videoNotFound`: mark video invalid/removed and skip comment import.
- `403 forbidden`: requested part may require owner authorization; retry with public-safe parts only if appropriate.
- `400 videoChartNotFound`: only relevant if later using `chart`.

## Pagination strategy

`commentThreads.list` returns a `nextPageToken` when more results are available.

Recommended approach:

1. Import one video at a time.
2. Request `maxResults=100` for backfills.
3. Continue while `nextPageToken` exists, quota budget remains, and the operator-approved page limit has not been exceeded.
4. Persist the cursor, last successful page token, run ID, and timestamps after each page.
5. Make imports resumable: a failed page should not discard already imported comments.
6. Stop early when comments are older than the configured lookback window during `order=time` refreshes.

Suggested initial caps:

- Manual test import: 1 video, 1 page.
- Small validation import: 3-5 videos, up to 3 pages each.
- Scheduled read-only import: configured per channel/video after quota review.

## Quota and rate limits

YouTube Data API v3 uses quota units. Google states that projects enabling the API commonly receive a default allocation of 10,000 units per day. The referenced `commentThreads.list` and `videos.list` methods each list a quota cost of 1 unit per call, but actual planning should verify the current quota cost table before implementation.

Budget controls required before live import:

- Define a per-run quota budget.
- Define a per-day quota budget below the Google project limit.
- Track quota units estimated/used per import run.
- Use batch `videos.list?id=...` calls instead of one request per video when possible.
- Avoid channel-wide comment imports until there is a tested cap.
- Use exponential backoff with jitter for retryable errors.
- Stop automatically on quota-related failures instead of retrying in a tight loop.
- Surface quota exhaustion as a visible integration status, not as a silent empty result.

Compliance note:

- If future usage needs more than the default allocation, YouTube may require an API Services compliance audit and quota extension process. Keep the client read-only, explainable, and auditable from the start.

## Refresh cadence

Start with operator-triggered imports, then add scheduling only after manual validation.

Recommended phases:

1. **Manual dry run**: one selected video, one page, no persistence or write behind unless explicitly enabled.
2. **Manual persisted import**: selected video IDs, capped page count, visible run summary.
3. **Light scheduled refresh**: every 6-12 hours for selected videos/channels, capped by lookback window and quota budget.
4. **Higher-frequency refresh**: only if the dashboard proves useful and quota/ops metrics support it.

Initial refresh rules:

- For new videos: poll more frequently during the first 24-72 hours if Steve approves, because comments arrive quickly after publish.
- For older evergreen videos: daily or weekly refresh is usually enough.
- For channel-wide monitoring: require a configured allowlist of channel IDs and quota budget.

## Error handling and observability

Every import run should have a run record with:

- `runId`
- trigger type: manual, scheduled, dry-run
- requested channel/video IDs
- started/finished timestamps
- status: dry-run, running, completed, partial, failed, stopped-quota, stopped-safety
- pages fetched
- comments fetched
- comments inserted/updated/skipped
- quota units estimated/used
- non-secret request metadata
- error codes and normalized messages

Error handling requirements:

- Treat disabled comments as a per-video skip.
- Treat removed/private videos as a per-video skip unless OAuth authorization is expected.
- Treat 401/403 auth errors as integration failures requiring credential review.
- Treat 429/quota/rate-limit errors as stop conditions with backoff, not as unlimited retries.
- Deduplicate imported comments by YouTube comment ID.
- Preserve prior scoring results unless source text or relevant metadata changed.
- Store raw API payloads only if necessary and only after reviewing privacy/data retention requirements; prefer normalized records plus import metadata.
- Logs must never include API keys, OAuth tokens, refresh tokens, or full credential-bearing URLs.

## Field mapping into the MVP data model

The final names should follow `docs/data-model.md` once that task exists. Until then, use this mapping as the ingestion contract.

### Video

| MVP field | YouTube source | Notes |
| --- | --- | --- |
| `video.id` | `videos.items[].id` | Stable external ID; prefix internally if needed, e.g. `yt_video:{id}`. |
| `video.platform` | constant `youtube` | Supports future multi-platform extension. |
| `video.url` | derived from ID | `https://www.youtube.com/watch?v={id}`. |
| `video.title` | `videos.items[].snippet.title` | Display and scoring context. |
| `video.description` | `videos.items[].snippet.description` | Optional; may be long, so truncate for scoring prompts/rules. |
| `video.channelId` | `videos.items[].snippet.channelId` | Stable channel ID. |
| `video.channelTitle` | `videos.items[].snippet.channelTitle` | Display only; can change. |
| `video.publishedAt` | `videos.items[].snippet.publishedAt` | ISO timestamp. |
| `video.thumbnailUrl` | `videos.items[].snippet.thumbnails.*.url` | Choose best fit for UI size. |
| `video.viewCount` | `videos.items[].statistics.viewCount` | Parse numeric string to number when safe. |
| `video.commentCount` | `videos.items[].statistics.commentCount` | Parse numeric string to number when safe. |
| `video.likeCount` | `videos.items[].statistics.likeCount` | May be absent. |
| `video.privacyStatus` | `videos.items[].status.privacyStatus` | Optional; may require authorization. |
| `video.etag` | `videos.items[].etag` | Cache/change detection. |
| `video.importedAt` | import runtime | System timestamp. |

### Comment / comment thread

| MVP field | YouTube source | Notes |
| --- | --- | --- |
| `comment.id` | `topLevelComment.id` | Stable external comment ID; dedupe key. |
| `comment.threadId` | `commentThreads.items[].id` | Thread-level grouping. |
| `comment.platform` | constant `youtube` | Supports future multi-platform extension. |
| `comment.videoId` | `commentThreads.items[].snippet.videoId` | Foreign key to video. |
| `comment.authorName` | `topLevelComment.snippet.authorDisplayName` | Display only; do not treat as stable identity. |
| `comment.authorChannelId` | `topLevelComment.snippet.authorChannelId.value` | Stable when present. |
| `comment.text` | `topLevelComment.snippet.textDisplay` or plain-text response | Use `textFormat=plainText` for safer scoring/display. |
| `comment.likeCount` | `topLevelComment.snippet.likeCount` | Engagement signal. |
| `comment.replyCount` | `commentThreads.items[].snippet.totalReplyCount` | Reply activity signal. |
| `comment.publishedAt` | `topLevelComment.snippet.publishedAt` | Original comment time. |
| `comment.updatedAt` | `topLevelComment.snippet.updatedAt` | Detect edits. |
| `comment.moderationStatus` | request context / OAuth-only filter | Avoid until OAuth phase. |
| `comment.url` | derived from video/comment IDs | Use YouTube comment anchor format only if verified in implementation. |
| `comment.rawEtag` | `topLevelComment.etag` or thread `etag` | Cache/change detection. |
| `comment.importedAt` | import runtime | System timestamp. |

### Scored opportunity

| MVP field | Source | Notes |
| --- | --- | --- |
| `opportunity.commentId` | normalized comment | One scored opportunity per relevant top-level comment. |
| `opportunity.videoId` | normalized comment/video | Join for source context. |
| `opportunity.status` | local workflow | Default `New`; never set `Replied` from API import. |
| `opportunity.score.total` | scoring engine | Deterministic score from MVP scoring model. |
| `opportunity.score.dimensions.painUrgency` | scoring engine + comment text | Uses Steve's pain-point framework once defined. |
| `opportunity.score.dimensions.buyerIntent` | scoring engine + comment text | Detects intent language. |
| `opportunity.score.dimensions.offerFit` | scoring engine + video/comment context | Requires configured affiliate niche/offer assumptions. |
| `opportunity.score.dimensions.replyability` | scoring engine | Rewards comments where a helpful reply is appropriate. |
| `opportunity.score.dimensions.spamComplianceRisk` | scoring engine | Conservative defaults; high risk should suppress posting suggestions. |
| `opportunity.score.dimensions.contentOpportunity` | scoring engine | Captures ideas for future content, not only direct replies. |
| `opportunity.explanations[]` | scoring engine | Evidence snippets and reasons. |
| `opportunity.replyDrafts[]` | local draft generator | Local/mock until posting is separately approved. |
| `opportunity.approvalHistory[]` | local workflow | Steve/operator approvals only. |

## Safety gates before any posting

Posting is a separate future phase. It must not be bundled with read-only ingestion.

Before any external communication is possible, require all of the following:

1. **Explicit operator approval for the posting feature**
   - The operator must approve adding write-capable YouTube scopes and posting code.
   - Approval must name the channel/account and the allowed action type.

2. **Separate approval per external communication**
   - Each individual reply must require a clear operator approval action before it is sent.
   - Bulk approve/send should remain disabled unless a future policy explicitly allows it.

3. **Credential storage in `env.vars`**
   - OAuth client secrets and refresh tokens must be stored only in gateway `env.vars` or the platform-approved secret store.
   - No credentials in source files, workspace docs, browser bundles, logs, or test fixtures.

4. **Least-privilege OAuth scopes**
   - Start with read-only scopes where possible.
   - Add write scopes only after explicit approval.
   - Document scope purpose and risk before enabling.

5. **Dry-run tests**
   - Run posting logic in dry-run mode first.
   - Dry-run output must show the target video/comment, exact reply body, account/channel, and expected API request without sending it.
   - Automated tests should assert that dry-run mode cannot call write endpoints.

6. **Audit logs**
   - Record who approved, what was approved, when, target comment/video, final reply text, request ID, response status, and resulting YouTube comment/reply ID if sent.
   - Audit logs must mask secrets and avoid storing unnecessary personal data.

7. **Policy and compliance review**
   - Replies must avoid spammy, deceptive, repetitive, or undisclosed affiliate behavior.
   - The system should flag high-risk drafts and block posting when compliance risk exceeds the configured threshold.
   - Include a manual review checklist for platform policy and affiliate disclosure requirements.

8. **Kill switch and rollback plan**
   - Provide an environment/config kill switch that disables all write calls.
   - Provide operator instructions for revoking OAuth credentials.
   - Treat unexpected posting behavior as an incident.

## Implementation sequence after MVP

1. Finalize `docs/data-model.md` and align this mapping with the actual types.
2. Add a server-side YouTube client wrapper with no frontend-exposed secrets.
3. Implement `videos.list` lookup for an operator-provided allowlist of video IDs.
4. Implement `commentThreads.list` import for one video, one page, dry-run only.
5. Add persisted import run records and normalized comment/video records.
6. Add quota budget checks and retry/backoff handling.
7. Add manual import UI with visible dry-run summary.
8. Enable persisted read-only imports after Steve validates the dry run.
9. Add scheduled refresh only after manual imports are stable.
10. Revisit posting as a separate, explicitly approved project phase.

## References checked

- YouTube Data API `commentThreads.list`: `GET https://www.googleapis.com/youtube/v3/commentThreads`, quota cost listed as 1 unit, supports `videoId`, `allThreadsRelatedToChannelId`, `maxResults`, `order`, `pageToken`, and `textFormat`.
- YouTube Data API `videos.list`: `GET https://www.googleapis.com/youtube/v3/videos`, quota cost listed as 1 unit, supports `id`, `part=snippet,statistics,status`, and pagination for supported filters.
- YouTube API quota/compliance guidance: default project allocation commonly listed as 10,000 units/day; quota extensions may require a compliance audit.
