// A read-only, deliberately bounded probe. No importer or persistence is involved.
import { NICHE_PROFILES } from './nicheProfiles.js';
import { clicksNoSalesFit, queryTopicFit } from './videoRanking.js';
import { scoreNicheLead } from '../scoring/nicheLead.js';
import { leadBucket } from '../../src/scoring/leadBuckets.js';

const age = (days) => new Date(Date.now() - days * 86400000).toISOString();
const count = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export async function checkVolume({ profileId, daysBack = 30, youtubeClient }) {
  if (!Object.hasOwn(NICHE_PROFILES, profileId)) {
    const error = new Error('Choose one of the 12 available cards.'); error.status = 400; throw error;
  }
  const days = Number(daysBack);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    const error = new Error('Video age must be between 1 and 90 days.'); error.status = 400; throw error;
  }
  const query = NICHE_PROFILES[profileId].queries[0];
  const calls = { search: 0, videos: 0, commentPages: 0 };
  const errors = [];
  const finish = (fields) => ({ profileId, query, daysBack: days, calls, estimatedQuotaUnits: calls.search * 100 + calls.videos + calls.commentPages, ...fields, errors });
  calls.search++;
  let search;
  try { search = await youtubeClient.searchVideos({ query, publishedAfter: age(days), order: 'relevance', maxResults: 50 }); }
  catch (error) {
    errors.push({ code: error?.code || 'search_failed', message: error?.message || 'Search failed.' });
    return finish({ candidates: 0, topical: 0, engaged10: 0, engaged50: 0, commentSupply: 0, sampledVideos: 0, sampledComments: 0, helpRequests: 0, good: 0, best: 0 });
  }
  const seen = new Set();
  const candidates = [];
  for (const item of search.items || []) {
    const id = item?.id?.videoId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    candidates.push({ id, title: item?.snippet?.title || '', description: item?.snippet?.description || '' });
    if (candidates.length === 50) break;
  }
  if (!candidates.length) return finish({ candidates: 0, topical: 0, engaged10: 0, engaged50: 0, commentSupply: 0, sampledVideos: 0, sampledComments: 0, helpRequests: 0, good: 0, best: 0 });
  calls.videos++;
  let metadata;
  try { metadata = await youtubeClient.listVideos(candidates.map(({ id }) => id)); }
  catch (error) {
    errors.push({ code: error?.code || 'metadata_failed', message: error?.message || 'Could not verify video comment counts.' });
    return finish({ candidates: candidates.length, topical: 0, engaged10: 0, engaged50: 0, commentSupply: 0, sampledVideos: 0, sampledComments: 0, helpRequests: 0, good: 0, best: 0 });
  }
  const byId = new Map((metadata.items || []).map((item) => [item.id, item]));
  const topical = candidates.map((video) => {
    const item = byId.get(video.id);
    const title = item?.snippet?.title || video.title;
    const description = item?.snippet?.description || video.description;
    const fit = profileId === 'clicks_no_sales' ? clicksNoSalesFit({ title, description }) !== 'off_topic' : queryTopicFit({ title, description, query });
    return { id: video.id, title, fit, commentCount: count(item?.statistics?.commentCount) };
  }).filter((item) => item.fit);
  const engaged10 = topical.filter((v) => v.commentCount !== null && v.commentCount >= 10).length;
  const engaged50 = topical.filter((v) => v.commentCount !== null && v.commentCount >= 50).length;
  const commentSupply = topical.reduce((sum, v) => sum + (v.commentCount || 0), 0);
  const sampleVideos = topical.filter((v) => v.commentCount !== null && v.commentCount >= 10).sort((a, b) => b.commentCount - a.commentCount).slice(0, 2);
  let sampledComments = 0;
  let helpRequests = 0;
  let good = 0;
  let best = 0;
  for (const video of sampleVideos) {
    calls.commentPages++;
    try {
      const page = await youtubeClient.listCommentThreads({ videoId: video.id, maxResults: 100 });
      for (const thread of page.items || []) {
        const snippet = thread?.snippet?.topLevelComment?.snippet;
        if (!snippet?.textOriginal) continue;
        sampledComments++;
        const score = scoreNicheLead({ text: snippet.textOriginal, profileId, likeCount: snippet.likeCount || 0, replyCount: thread?.snippet?.totalReplyCount || 0, isChannelOwner: snippet.authorChannelId?.value === byId.get(video.id)?.snippet?.channelId });
        const bucket = leadBucket(score);
        if (score.opportunityType === 'niche_lead') helpRequests++;
        if (bucket === 'maybe') good++;
        if (bucket === 'best') best++;
      }
    } catch (error) {
      errors.push({ videoId: video.id, code: error?.code || 'comments_unavailable', message: error?.message || 'Could not read comments.' });
    }
  }
  return finish({ candidates: candidates.length, topical: topical.length, engaged10, engaged50, commentSupply, sampledVideos: sampleVideos.length, sampledComments, helpRequests, good, best });
}
