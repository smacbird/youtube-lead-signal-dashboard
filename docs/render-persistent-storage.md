# Render Persistent Storage

The dashboard stores imported YouTube comments and review state in a JSON file.
On Render, the app filesystem can reset on deploy/restart unless a persistent disk is mounted.

## Recommended Render disk

Create a persistent disk on the Web Service:

- Name: `youtube-dashboard-data`
- Mount path: `/var/data`
- Size: `1 GB`

## Required environment variable

Add this environment variable in Render:

```text
IMPORT_STORE_PATH=/var/data/import-store.json
```

The backend creates the file automatically when imports/review actions happen.

## Existing required environment variable

```text
YOUTUBE_API_KEY=<server-side YouTube Data API key>
```

## Optional future AI variable

```text
OPENAI_API_KEY=<server-side OpenAI key>
```

## What persists

- Imported videos
- Imported comments
- Scored opportunities
- Selected draft ID
- Local status changes
- Manual replied state
- Import run history

## What does not happen

The app still does not post, reply, like, delete, or moderate YouTube comments.
