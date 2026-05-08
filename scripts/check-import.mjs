import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importYouTubeVideos } from '../server/import/importService.js';
import { JsonImportStore } from '../server/persistence/store.js';
import { YouTubeReadOnlyClient } from '../server/youtube/client.js';
import { normalizeCommentUrl, normalizeVideoUrl, parseManyYouTubeVideoInputs, parseYouTubeVideoInput } from '../server/youtube/url.js';

assert.equal(parseYouTubeVideoInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
assert.equal(parseYouTubeVideoInput('https://youtu.be/dQw4w9WgXcQ?t=30').videoId, 'dQw4w9WgXcQ');
assert.equal(parseYouTubeVideoInput('https://www.youtube.com/shorts/dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
assert.equal(parseYouTubeVideoInput('dQw4w9WgXcQ').videoId, 'dQw4w9WgXcQ');
assert.equal(parseYouTubeVideoInput('https://example.com/watch?v=dQw4w9WgXcQ').ok, false);
assert.equal(normalizeVideoUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
assert.equal(normalizeCommentUrl('dQw4w9WgXcQ', 'Ugw-comment.abc'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=Ugw-comment.abc');

const parsed = parseManyYouTubeVideoInputs([
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=BaW_jenozKc',
], 1);
assert.deepEqual(parsed.videoIds, ['dQw4w9WgXcQ']);
assert.equal(parsed.capped, true);
assert.equal(parsed.originalUniqueCount, 2);

let retryCalls = 0;
const retryClient = new YouTubeReadOnlyClient({
  apiKey: 'test_api_key_not_real',
  maxRetries: 1,
  fetchImpl: async () => {
    retryCalls += 1;
    if (retryCalls === 1) {
      return new Response(JSON.stringify({ error: { message: 'rate limited', errors: [{ reason: 'rateLimitExceeded' }] } }), { status: 429 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  },
});
await retryClient.listVideos(['dQw4w9WgXcQ']);
assert.equal(retryCalls, 2, 'read-only client retries retryable YouTube failures once with backoff');

const tempDir = await mkdtemp(join(tmpdir(), 'youtube-import-store-'));
try {
  const store = new JsonImportStore({ filePath: join(tempDir, 'store.json') });
  const youtubeClient = {
    async listVideos(ids) {
      assert.deepEqual(ids, ['dQw4w9WgXcQ']);
      return {
        items: [{
          id: 'dQw4w9WgXcQ',
          etag: 'video-etag',
          snippet: {
            title: 'Affiliate review checklist for camera buyer guides',
            channelId: 'chan_owner',
            channelTitle: 'Partner Revenue Notes',
            publishedAt: '2026-05-01T12:00:00.000Z',
          },
          statistics: { viewCount: '1000', likeCount: '50', commentCount: '1' },
          status: { privacyStatus: 'public' },
        }],
      };
    },
    async listCommentThreads({ videoId, maxResults }) {
      assert.equal(videoId, 'dQw4w9WgXcQ');
      assert.equal(maxResults, 100);
      return {
        items: [{
          id: 'thread_001',
          etag: 'thread-etag',
          snippet: {
            videoId,
            totalReplyCount: 3,
            topLevelComment: {
              id: 'Ugw-comment.abc',
              etag: 'comment-etag',
              snippet: {
                authorDisplayName: 'Camera Site Owner',
                authorChannelId: { value: 'chan_commenter' },
                textOriginal: 'I have traffic to my camera comparison posts but no affiliate commissions. Which checklist should I add before the Amazon click?',
                likeCount: 12,
                publishedAt: '2026-05-02T12:00:00.000Z',
                updatedAt: '2026-05-02T12:30:00.000Z',
              },
            },
          },
        }],
      };
    },
  };

  const run = await importYouTubeVideos({ inputs: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'], store, youtubeClient });
  assert.equal(run.status, 'succeeded');
  assert.equal(run.pagesFetched, 1);
  assert.equal(run.commentsFetched, 1);
  assert.equal(run.commentsInserted, 1);
  assert.equal(run.estimatedQuotaUnits, 2);

  const opportunities = await store.listOpportunities();
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].comment.youtubeCommentId, 'Ugw-comment.abc');
  assert.ok(opportunities[0].overallScore >= 0 && opportunities[0].overallScore <= 100);
  assert.ok(opportunities[0].scoreDimensions.length > 0);
  assert.equal(opportunities[0].status, 'new');
  assert.equal(opportunities[0].selectedDraftId, opportunities[0].replyDrafts[0].id);

  const replied = await store.markManuallyReplied(opportunities[0].id, 'Operator replied directly on YouTube.');
  assert.equal(replied.status, 'replied');
  assert.ok(replied.manuallyRepliedAt);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Import parsing, capping, persistence, and scoring checks passed.');
