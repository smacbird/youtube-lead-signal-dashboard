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
- Required env var: `YOUTUBE_API_KEY`
- Optional env var for live AI drafts: `OPENAI_API_KEY`

## Local development

```bash
npm install
npm run build
YOUTUBE_API_KEY=your_key npm start
```
