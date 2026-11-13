import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canPrepareReply, isSafeReplyDraft } from '../../src/scoring/draftSafety.js';
import { bucketCounts } from '../../src/scoring/leadBuckets.js';
import { settingsFromStore, validateSettings } from '../settings.js';

const DEFAULT_STORE_PATH = resolve(process.cwd(), 'data/import-store.json');
const VALID_STATUSES = new Set(['new', 'reviewed', 'approved', 'rejected', 'replied']);
// Max opportunities returned for a single scan. Above IMPORT_LIMITS.maxCommentsPerRun (300),
// so a scan's own results are never truncated.
export const RUN_RESULT_LIMIT = 1000;

export function createEmptyStore(now = new Date().toISOString()) {
  return {
    schemaVersion: '0.1.0',
    generatedAt: now,
    videos: {},
    comments: {},
    opportunities: {},
    scoreDimensions: {},
    replyDrafts: {},
    statusHistory: {},
    importRuns: {},
    settings: null,
  };
}

export class JsonImportStore {
  constructor({ filePath = process.env.IMPORT_STORE_PATH || DEFAULT_STORE_PATH } = {}) {
    this.filePath = filePath;
    this.pending = Promise.resolve();
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return { ...createEmptyStore(), ...JSON.parse(raw) };
    } catch (error) {
      if (error.code === 'ENOENT') return createEmptyStore();
      throw error;
    }
  }

  async save(store) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    return store;
  }

  mutate(mutator) {
    // One server process owns this file. Serialize writes so a debounced settings save
    // cannot replace a concurrent scan or generated draft from a stale snapshot.
    const work = this.pending.then(async () => {
      const store = await this.load();
      const result = await mutator(store);
      await this.save(store);
      return result;
    });
    this.pending = work.catch(() => {});
    return work;
  }

  async getSettings() {
    const store = await this.load();
    return settingsFromStore(store.settings);
  }

  async updateSettings(input) {
    const valid = validateSettings(input);
    return this.mutate((store) => { store.settings = valid; return settingsFromStore(store.settings); });
  }

  async listOpportunities({ limit = 100 } = {}) {
    const store = await this.load();
    return Object.values(store.opportunities)
      .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))
      .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)))
      .map((opportunity) => hydrateOpportunity(store, opportunity.id));
  }

  async listImportRuns({ limit = 25 } = {}) {
    const store = await this.load();
    return Object.values(store.importRuns)
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, Math.max(1, Math.min(Number(limit) || 25, 100)))
      .map((run) => {
        // Lead counts only for runs that recorded their own opportunity ids; older runs get null.
        if (!Array.isArray(run.opportunityIds)) return { ...run, leadCounts: null };
        const { headline, ...leadCounts } = bucketCounts(run.opportunityIds.map((id) => store.opportunities[id]).filter(Boolean));
        return { ...run, leadCounts };
      });
  }


  async getImportRun(runId) {
    const store = await this.load();
    return store.importRuns[runId] || null;
  }

  // Opportunities for one scan, looked up directly by the scan's own ids, never by a
  // store-wide top-N (which used to cut off this scan's low scorers when the store was big).
  async listOpportunitiesForRun(runId, { limit = RUN_RESULT_LIMIT } = {}) {
    const store = await this.load();
    const run = store.importRuns[runId];
    if (!run) return { run: null, items: [], total: 0 };
    const cap = Math.max(1, Math.min(Number(limit) || RUN_RESULT_LIMIT, RUN_RESULT_LIMIT));
    let selected;
    if (Array.isArray(run.opportunityIds)) {
      selected = run.opportunityIds.map((id) => store.opportunities[id]).filter(Boolean);
    } else {
      // Scans saved before opportunityIds existed: fall back to the scan's videos.
      const videoIds = new Set(run.requestedVideoIds || []);
      selected = Object.values(store.opportunities).filter((opportunity) => {
        const video = store.videos[opportunity.videoId];
        return videoIds.has(video?.youtubeVideoId || video?.id || opportunity.videoId);
      });
    }
    const items = selected
      .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))
      .slice(0, cap)
      .map((opportunity) => hydrateOpportunity(store, opportunity.id));
    return { run, items, total: selected.length };
  }

  async deleteImportRun(runId, { cascade = true } = {}) {
    return this.mutate((store) => {
      const run = store.importRuns[runId];
      const removed = { videos: 0, comments: 0, opportunities: 0, drafts: 0, scoreDimensions: 0, statusHistory: 0 };
      if (!run) return { deleted: false, removed };

      // The old format records searched video ids but not which comments were fetched.
      // It is unsafe to infer ownership from a whole video, even if no newer run shares it.
      if (![run.opportunityIds, run.commentIds, run.videoIds].every(Array.isArray)) {
        return { deleted: false, code: 'legacy_run_membership_unknown', message: 'This older scan cannot be deleted safely: exact comment membership was not recorded.', removed };
      }
      if (!cascade) { delete store.importRuns[runId]; return { deleted: true, removed }; }

      const otherRuns = Object.values(store.importRuns).filter((other) => other.id !== runId);
      const otherOpportunities = new Set(otherRuns.flatMap((other) => other.opportunityIds || []));
      const otherComments = new Set(otherRuns.flatMap((other) => other.commentIds || []));
      const otherVideos = new Set(otherRuns.flatMap((other) => other.videoIds || []));
      const legacyVideoIds = new Set(otherRuns.filter((other) => ![other.opportunityIds, other.commentIds, other.videoIds].every(Array.isArray))
        .flatMap((other) => other.requestedVideoIds || []));
      const protectedVideos = new Set(Object.entries(store.videos).filter(([id, video]) =>
        legacyVideoIds.has(video.youtubeVideoId || id) || legacyVideoIds.has(id)).map(([id]) => id));

      for (const id of new Set(run.opportunityIds)) {
        const opportunity = store.opportunities[id];
        if (!opportunity || otherOpportunities.has(id) || protectedVideos.has(opportunity.videoId)) continue;
        for (const [draftId, draft] of Object.entries(store.replyDrafts)) {
          if (draft.opportunityId === id) { delete store.replyDrafts[draftId]; removed.drafts += 1; }
        }
        if (store.scoreDimensions[id]) { delete store.scoreDimensions[id]; removed.scoreDimensions += 1; }
        for (const [historyId, history] of Object.entries(store.statusHistory)) {
          if (history.opportunityId === id) { delete store.statusHistory[historyId]; removed.statusHistory += 1; }
        }
        delete store.opportunities[id];
        removed.opportunities += 1;
      }
      for (const id of new Set(run.commentIds)) {
        const comment = store.comments[id];
        if (!comment || otherComments.has(id) || protectedVideos.has(comment.videoId)) continue;
        if (Object.values(store.opportunities).some((opportunity) => opportunity.commentId === id)) continue;
        delete store.comments[id];
        removed.comments += 1;
      }
      for (const id of new Set(run.videoIds)) {
        if (!store.videos[id] || otherVideos.has(id) || protectedVideos.has(id)) continue;
        if (Object.values(store.comments).some((comment) => comment.videoId === id)
          || Object.values(store.opportunities).some((opportunity) => opportunity.videoId === id)) continue;
        delete store.videos[id];
        removed.videos += 1;
      }
      const incomplete = run.videoIds.some((id) => protectedVideos.has(id));
      delete store.importRuns[runId];
      return { deleted: true, incomplete, warning: incomplete ? 'Some records were retained because an older scan may reference them.' : null, removed };
    });
  }

  async transitionStatus(opportunityId, toStatus, { changedBy = 'operator_manual', note = '' } = {}) {
    if (!VALID_STATUSES.has(toStatus)) throw new Error(`invalid_status:${toStatus}`);
    return this.mutate((store) => {
      if (toStatus === 'approved' && store.opportunities[opportunityId]?.sourceType === 'youtube_import') {
        const opportunity = store.opportunities[opportunityId];
        if (opportunity.opportunityType === 'low_fit_comment' || ['replied', 'rejected'].includes(opportunity.status))
          throw new Error('reply_only_for_open_leads');
        if (!canPrepareReply(Object.values(store.replyDrafts), opportunityId))
          throw new Error('reply_ideas_need_openai_key');
      }
      return transitionOpportunityStatus(store, opportunityId, toStatus, { changedBy, note });
    });
  }

  async setSelectedDraft(opportunityId, draftId) {
    return this.mutate((store) => {
      const opportunity = store.opportunities[opportunityId];
      if (!opportunity) throw new Error(`opportunity_not_found:${opportunityId}`);
      const draft = store.replyDrafts[draftId];
      if (!isSafeReplyDraft(draft, opportunityId)) throw new Error(`draft_not_found:${draftId}`);
      opportunity.selectedDraftId = draftId;
      opportunity.updatedAt = new Date().toISOString();
      return hydrateOpportunity(store, opportunityId);
    });
  }

  async markManuallyReplied(opportunityId, note = 'Manual replied state set by operator.') {
    return this.mutate((store) => transitionOpportunityStatus(store, opportunityId, 'replied', { changedBy: 'operator_manual', note }));
  }
}

export function upsertImportedVideo(store, video) {
  const now = new Date().toISOString();
  const existing = store.videos[video.id];
  store.videos[video.id] = {
    ...existing,
    ...video,
    sourceType: 'youtube_import',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  return store.videos[video.id];
}

export function upsertImportedComment(store, comment) {
  const now = new Date().toISOString();
  const existing = store.comments[comment.id];
  store.comments[comment.id] = {
    ...existing,
    ...comment,
    sourceType: 'youtube_import',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  return { record: store.comments[comment.id], inserted: !existing, updated: Boolean(existing) };
}

export function persistScoredOpportunity(store, opportunity, dimensions = [], replyDrafts = []) {
  const now = new Date().toISOString();
  const existing = store.opportunities[opportunity.id];
  const status = existing?.status || opportunity.status || 'new';
  store.opportunities[opportunity.id] = {
    ...existing,
    ...opportunity,
    status,
    selectedDraftId: existing?.selectedDraftId || replyDrafts[0]?.id || null,
    manuallyRepliedAt: existing?.manuallyRepliedAt || null,
    createdAt: existing?.createdAt || opportunity.createdAt || now,
    updatedAt: now,
  };

  store.scoreDimensions[opportunity.id] = dimensions.map((dimension) => ({ ...dimension, opportunityId: opportunity.id }));
  for (const draft of replyDrafts) {
    store.replyDrafts[draft.id] = { ...draft, opportunityId: opportunity.id };
  }

  if (!Object.values(store.statusHistory).some((history) => history.opportunityId === opportunity.id)) {
    const history = makeStatusHistory(opportunity.id, null, status, 'system_import', 'Created from YouTube import.');
    store.statusHistory[history.id] = history;
  }

  return store.opportunities[opportunity.id];
}

export function createImportRun(store, requestedInputs, parsed, metadata = {}) {
  const now = new Date().toISOString();
  const id = `run_${now.replace(/[-:.TZ]/g, '')}_${Math.random().toString(36).slice(2, 8)}`;
  const run = {
    id,
    status: 'running',
    requestedInputs,
    requestedVideoIds: parsed.videoIds,
    // Exact internal ids touched by this run. Deletion never infers membership from a video.
    opportunityIds: [],
    commentIds: [],
    videoIds: [],
    rejectedInputs: parsed.rejected,
    cappedInputs: parsed.capped,
    pagesFetched: 0,
    commentsFetched: 0,
    commentsInserted: 0,
    commentsUpdated: 0,
    commentsSkipped: 0,
    estimatedQuotaUnits: 0,
    errors: [],
    startedAt: now,
    completedAt: null,
    metadata,
  };
  store.importRuns[id] = run;
  return run;
}

export function finishImportRun(run, status = 'succeeded') {
  run.status = status;
  run.completedAt = new Date().toISOString();
  return run;
}

export function recordImportError(run, code, message, context = {}) {
  run.errors.push({
    code: String(code || 'import_error'),
    message: String(message || 'Import error.'),
    context,
    at: new Date().toISOString(),
  });
}

function makeStatusHistory(opportunityId, fromStatus, toStatus, changedBy, note = '') {
  const now = new Date().toISOString();
  return {
    id: `hist_${opportunityId}_${now.replace(/[-:.TZ]/g, '')}_${Math.random().toString(36).slice(2, 8)}`,
    opportunityId,
    fromStatus,
    toStatus,
    changedAt: now,
    changedBy,
    note,
  };
}

function transitionOpportunityStatus(store, opportunityId, toStatus, { changedBy, note }) {
  const opportunity = store.opportunities[opportunityId];
  if (!opportunity) throw new Error(`opportunity_not_found:${opportunityId}`);
  const fromStatus = opportunity.status;
  opportunity.status = toStatus;
  opportunity.updatedAt = new Date().toISOString();
  if (toStatus === 'replied') opportunity.manuallyRepliedAt = opportunity.manuallyRepliedAt || opportunity.updatedAt;
  const history = makeStatusHistory(opportunityId, fromStatus, toStatus, changedBy, note);
  store.statusHistory[history.id] = history;
  return hydrateOpportunity(store, opportunityId);
}

export function hydrateOpportunity(store, opportunityId) {
  const opportunity = store.opportunities[opportunityId];
  if (!opportunity) return null;
  return {
    ...opportunity,
    video: store.videos[opportunity.videoId] || null,
    comment: store.comments[opportunity.commentId] || null,
    scoreDimensions: store.scoreDimensions[opportunityId] || [],
    replyDrafts: Object.values(store.replyDrafts).filter((draft) => draft.opportunityId === opportunityId),
    approvalStatusHistory: Object.values(store.statusHistory).filter((history) => history.opportunityId === opportunityId),
  };
}
