import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_STORE_PATH = resolve(process.cwd(), 'data/import-store.json');
const VALID_STATUSES = new Set(['new', 'reviewed', 'approved', 'rejected', 'replied']);

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
  };
}

export class JsonImportStore {
  constructor({ filePath = process.env.IMPORT_STORE_PATH || DEFAULT_STORE_PATH } = {}) {
    this.filePath = filePath;
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

  async mutate(mutator) {
    const store = await this.load();
    const result = await mutator(store);
    await this.save(store);
    return result;
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
      .slice(0, Math.max(1, Math.min(Number(limit) || 25, 100)));
  }


  async getImportRun(runId) {
    const store = await this.load();
    return store.importRuns[runId] || null;
  }

  async listOpportunitiesForRun(runId, { limit = 250 } = {}) {
    const store = await this.load();
    const run = store.importRuns[runId];
    if (!run) return { run: null, items: [] };
    const videoIds = new Set(run.requestedVideoIds || []);
    const items = Object.values(store.opportunities)
      .filter((opportunity) => {
        const video = store.videos[opportunity.videoId];
        return videoIds.has(video?.youtubeVideoId || video?.id || opportunity.videoId);
      })
      .sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0))
      .slice(0, Math.max(1, Math.min(Number(limit) || 250, 500)))
      .map((opportunity) => hydrateOpportunity(store, opportunity.id));
    return { run, items };
  }

  async deleteImportRun(runId, { cascade = true } = {}) {
    return this.mutate((store) => {
      const run = store.importRuns[runId];
      const existed = Boolean(run);
      if (!run) return { deleted: false, removed: { videos: 0, comments: 0, opportunities: 0, drafts: 0, scoreDimensions: 0, statusHistory: 0 } };

      const removed = { videos: 0, comments: 0, opportunities: 0, drafts: 0, scoreDimensions: 0, statusHistory: 0 };
      if (cascade) {
        const youtubeVideoIds = new Set(run.requestedVideoIds || []);
        const internalVideoIds = new Set();
        for (const [videoId, video] of Object.entries(store.videos || {})) {
          if (youtubeVideoIds.has(video.youtubeVideoId || video.id || videoId)) internalVideoIds.add(videoId);
        }

        const opportunityIds = new Set();
        const commentIds = new Set();
        for (const [opportunityId, opportunity] of Object.entries(store.opportunities || {})) {
          if (internalVideoIds.has(opportunity.videoId)) {
            opportunityIds.add(opportunityId);
            if (opportunity.commentId) commentIds.add(opportunity.commentId);
          }
        }

        for (const draftId of Object.keys(store.replyDrafts || {})) {
          if (opportunityIds.has(store.replyDrafts[draftId]?.opportunityId)) {
            delete store.replyDrafts[draftId];
            removed.drafts += 1;
          }
        }
        for (const dimensionId of Object.keys(store.scoreDimensions || {})) {
          if (opportunityIds.has(dimensionId)) {
            delete store.scoreDimensions[dimensionId];
            removed.scoreDimensions += 1;
          }
        }
        for (const historyId of Object.keys(store.statusHistory || {})) {
          if (opportunityIds.has(store.statusHistory[historyId]?.opportunityId)) {
            delete store.statusHistory[historyId];
            removed.statusHistory += 1;
          }
        }
        for (const opportunityId of opportunityIds) {
          delete store.opportunities[opportunityId];
          removed.opportunities += 1;
        }
        for (const commentId of commentIds) {
          delete store.comments[commentId];
          removed.comments += 1;
        }
        for (const videoId of internalVideoIds) {
          const stillReferenced = Object.values(store.opportunities || {}).some((opportunity) => opportunity.videoId === videoId);
          if (!stillReferenced) {
            delete store.videos[videoId];
            removed.videos += 1;
          }
        }
      }

      delete store.importRuns[runId];
      return { deleted: existed, removed };
    });
  }

  async transitionStatus(opportunityId, toStatus, { changedBy = 'operator_manual', note = '' } = {}) {
    if (!VALID_STATUSES.has(toStatus)) throw new Error(`invalid_status:${toStatus}`);
    return this.mutate((store) => transitionOpportunityStatus(store, opportunityId, toStatus, { changedBy, note }));
  }

  async setSelectedDraft(opportunityId, draftId) {
    return this.mutate((store) => {
      const opportunity = store.opportunities[opportunityId];
      if (!opportunity) throw new Error(`opportunity_not_found:${opportunityId}`);
      const draft = store.replyDrafts[draftId];
      if (!draft || draft.opportunityId !== opportunityId) throw new Error(`draft_not_found:${draftId}`);
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
