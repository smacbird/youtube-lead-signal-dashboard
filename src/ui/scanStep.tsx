import React, { useEffect, useState } from 'react';
import { apiJson } from './api';
import { buildScanSummary, nicheLabel, nichePhrase, normaliseImportedOpportunity } from './helpers';
import { StatCard } from './layout';
import { DAILY_QUOTA, SCAN_PRESETS, estimateScanQuota, presetForVideos } from './scanPresets.js';
import type { AppSettings, NicheProfile, PreviousScan, ScanSummary, ScoredFixture } from './types';

export type ScanResult = { items: ScoredFixture[]; summary: ScanSummary; nicheScan: boolean; runId?: string };

const QUERIES_PER_NICHE: Record<string, number> = { affiliate_marketing: 6, money_making: 6, work_from_home: 6, side_hustles: 5, biz_opp: 6, ai_tools: 5, traffic_leads: 5, organic_traffic: 5 };

export function ScanPanel({ niche, settings, onResult, onReset, hasResults }: { niche: NicheProfile; settings: AppSettings; onResult: (result: ScanResult) => void; onReset: () => void; hasResults: boolean }) {
  const [presetId, setPresetId] = useState(presetForVideos(settings.defaultScanDepth).id);
  const preset = SCAN_PRESETS.find((p) => p.id === presetId) || SCAN_PRESETS[0];
  const [daysBack, setDaysBack] = useState(settings.defaultFreshnessDays);
  const [commentCap, setCommentCap] = useState(preset.comments);
  const [manualPages, setManualPages] = useState(2);
  const [videoUrls, setVideoUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [previousScans, setPreviousScans] = useState<PreviousScan[] | null>(null);

  useEffect(() => { setPresetId(presetForVideos(settings.defaultScanDepth).id); setDaysBack(settings.defaultFreshnessDays); }, [settings.defaultScanDepth, settings.defaultFreshnessDays]);
  useEffect(() => { setCommentCap(preset.comments); }, [preset.comments]);

  const quota = estimateScanQuota({ videos: preset.videos, comments: commentCap, queryCount: QUERIES_PER_NICHE[niche] || 6 });

  async function run(task: () => Promise<void>, busyMessage: string) {
    setLoading(true);
    setMessage(busyMessage);
    try {
      await task();
    } catch (error) {
      setMessage(`That did not work: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  const scanByNiche = () => run(async () => {
    const body = await apiJson('/api/scan/youtube-niche', {
      method: 'POST',
      body: JSON.stringify({ profileId: niche, maxVideos: preset.videos, daysBack, replyTone: settings.replyTone, maxCommentsPerRun: commentCap, maxResultsPerPage: 100 }),
    });
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onResult({ items, summary: buildScanSummary('scan', items, body), nicheScan: true, runId: body.run?.id });
    setMessage('Scan finished. Your leads are in Step 3.');
  }, `Scanning for ${nichePhrase(niche)} leads: this takes ${preset.time}.`);

  const importUrls = () => run(async () => {
    const inputs = videoUrls.split(/\n|,/).map((value) => value.trim()).filter(Boolean);
    const body = await apiJson('/api/import/youtube', { method: 'POST', body: JSON.stringify({ videoUrls: inputs, maxVideos: Math.min(10, inputs.length), maxPagesPerVideo: manualPages, maxCommentsPerRun: commentCap, maxResultsPerPage: 100 }) });
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onResult({ items, summary: buildScanSummary('manual', items, body), nicheScan: false, runId: body.run?.id });
    setMessage('Done. The comments from those videos are in Step 3.');
  }, 'Reading comments from the videos you pasted.');

  const listPrevious = () => run(async () => {
    const body = await apiJson('/api/import-runs?limit=10');
    setPreviousScans(body.items || []);
    setMessage(body.items?.length ? '' : 'No saved scans yet.');
  }, 'Loading saved scans.');

  const loadPrevious = (scan: PreviousScan) => run(async () => {
    const body = await apiJson(`/api/import-runs/${encodeURIComponent(scan.id)}`);
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onResult({ items, summary: buildScanSummary('previous', items, body), nicheScan: body.run?.metadata?.scanType === 'niche', runId: body.run?.id });
    setMessage(`Loaded: ${body.run?.title || scan.id}`);
  }, 'Loading that scan.');

  const loadEverything = () => run(async () => {
    const body = await apiJson('/api/opportunities?limit=500');
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onResult({ items, summary: buildScanSummary('saved', items, {}), nicheScan: items.some((item: ScoredFixture) => item.score.opportunityType === 'niche_lead') });
    setMessage(`Loaded your ${items.length} highest-scoring saved comments from all scans.`);
  }, 'Loading all saved comments.');

  const deletePrevious = (scan: PreviousScan) => {
    if (!window.confirm('Delete this saved scan? Its comments, drafts and review history will be removed. This cannot be undone.')) return;
    run(async () => {
      await apiJson(`/api/import-runs/${encodeURIComponent(scan.id)}`, { method: 'DELETE' });
      setPreviousScans((current) => (current || []).filter((item) => item.id !== scan.id));
      setMessage('Scan deleted.');
    }, 'Deleting that scan.');
  };

  return (
    <div className="scan-panel">
      <fieldset className="preset-grid">
        <legend>How big a scan?</legend>
        {SCAN_PRESETS.map((option) => (
          <label key={option.id} className={presetId === option.id ? 'preset-card selected' : 'preset-card'}>
            <input type="radio" name="scan-size" value={option.id} checked={presetId === option.id} onChange={() => setPresetId(option.id)} />
            <strong><span className="choice-indicator" aria-hidden="true">{presetId === option.id ? '✓' : ''}</span>{option.label}</strong>
            <span className="choice-description">{option.blurb}</span>
            <small>Takes {option.time}</small>
          </label>
        ))}
      </fieldset>
      <p className="quota-note">
        About {quota.low}–{quota.high} of your {DAILY_QUOTA.toLocaleString()} daily YouTube units: {quota.minSearches}–{quota.maxSearches} searches × 100, one video lookup × 1, and up to {quota.maxCommentPages} comment pages × 1. Reading comments is cheap.
      </p>

      <div className="primary-action-row">
        <button type="button" className={hasResults ? 'big-button secondary' : 'big-button'} disabled={loading} onClick={scanByNiche} aria-describedby="scan-status">
          {loading ? 'Working…' : hasResults ? 'Run another scan' : `Find ${nichePhrase(niche)} leads`}
        </button>
        <div className="reset-group">
          <button type="button" className="quiet-button" disabled={loading || !hasResults} onClick={onReset}>Reset for new scan</button>
          <small>Clears this screen only. Saved scans are kept.</small>
        </div>
      </div>
      <p id="scan-status" className="status-line" role="status" aria-live="polite">{message}</p>

      <details className="more-options">
        <summary>More options</summary>
        <div className="options-grid">
          <label>
            <span>Video age</span>
            <select value={daysBack} onChange={(event) => setDaysBack(Number(event.target.value))}>
              <option value={7}>Videos from the last 7 days</option>
              <option value={14}>Videos from the last 14 days</option>
              <option value={30}>Videos from the last 30 days (recommended)</option>
              <option value={90}>Videos from the last 90 days</option>
            </select>
            <small>Videos need a few days to collect comments, so 30 days usually finds the most people.</small>
          </label>
          <label>
            <span>Most comments to read</span>
            <input type="number" min={25} max={300} value={commentCap} onChange={(event) => setCommentCap(Math.max(25, Math.min(300, Number(event.target.value) || preset.comments)))} />
            <small>Shared evenly across the videos. 300 is the most one scan can read.</small>
          </label>
        </div>
      </details>

      <details className="more-options">
        <summary>Advanced: scan specific videos</summary>
        <label className="stacked-label">
          <span>YouTube video links, one per line (up to 10)</span>
          <textarea value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
        </label>
        <label className="manual-page-option">Comment pages per video <input type="number" min={1} max={3} value={manualPages} onChange={(event) => setManualPages(Math.max(1, Math.min(3, Number(event.target.value) || 1)))} /></label>
        <small className="workflow-note">These videos use the older buyer and site-owner scoring, not the niche lead scoring.</small>
        <div className="approval-hooks">
          <button type="button" className="workflow-button safe" disabled={loading || !videoUrls.trim()} onClick={importUrls}>Read comments from these videos</button>
        </div>
      </details>

      <details className="more-options" onToggle={(event) => { if ((event.target as HTMLDetailsElement).open && previousScans === null) listPrevious(); }}>
        <summary>Open a saved scan</summary>
        <div className="approval-hooks">
          <button type="button" className="workflow-button" disabled={loading} onClick={listPrevious}>Refresh list</button>
          <button type="button" className="workflow-button" disabled={loading} onClick={loadEverything}>Show all saved comments</button>
        </div>
        {previousScans && previousScans.length > 0 && (
          <ul className="previous-scans-list" aria-label="Saved scans">
            {previousScans.map((scan) => (
              <li key={scan.id} className="previous-scan-row">
                <button className="previous-scan-title" type="button" onClick={() => loadPrevious(scan)}>{scan.title || scan.id}</button>
                <div className="previous-scan-meta">
                  <small>{scan.commentsFetched} comments · {scan.estimatedQuotaUnits || 0} units</small>
                  <button className="delete-scan-button" type="button" onClick={() => deletePrevious(scan)} aria-label={`Delete saved scan ${scan.title || scan.id}`}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

const stopReasons: Record<string, string> = {
  no_more_comments: 'read every comment',
  video_budget_used: 'reached its share',
  page_limit: 'reached the page limit',
  run_budget_used: 'scan limit already used',
  error: 'could not read comments',
};

export function ScanResultCard({ summary, onShow }: { summary: ScanSummary; onShow: (tab: 'best' | 'not_fit') => void }) {
  const sourceText = summary.source === 'scan' ? 'Scan finished' : summary.source === 'manual' ? 'Videos read' : summary.source === 'previous' ? 'Saved scan opened' : 'All saved comments';
  return (
    <section className="result-card" aria-labelledby="result-title">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">{sourceText}</span>
          <h3 id="result-title">{summary.headline}</h3>
          {summary.title && <small className="workflow-note">{summary.title}</small>}
        </div>
      </div>
      <div className="summary-grid">
        <StatCard label="Best leads" value={summary.best} note="questions worth replying to" emphasis muted={summary.best === 0} />
        <StatCard label="Maybe" value={summary.maybe} note="weaker or riskier" muted={summary.maybe === 0} />
        <StatCard label="Not a fit" value={summary.notFit} note="browsable with reasons" muted={summary.notFit === 0} />
        <StatCard label="Comments read" value={summary.fetched} note={summary.videos !== null && summary.readableVideos !== null ? `${summary.readableVideos} of ${summary.videos} videos had readable comments` : 'from YouTube'} />
        {summary.notShown !== 0 && <StatCard label="Not shown" value={summary.notShown === null ? '—' : summary.notShown} note={summary.notShown === null ? 'not tracked for older scans' : summary.overDisplayLimit ? `${summary.duplicates} repeats; ${summary.overDisplayLimit} over the display limit` : `${summary.duplicates} repeated comments counted once`} />}
      </div>
      {summary.notShown === 0 && <p className="workflow-note">Every fetched comment is listed. {summary.readableVideos !== null && summary.videos !== null ? `${summary.readableVideos} of ${summary.videos} selected videos had readable comments.` : ''}</p>}
      {(summary.duplicates > 0 || summary.capped > 0 || summary.skipped > summary.duplicates + summary.capped) && (
        <p className="workflow-note">{summary.duplicates > 0 && `${summary.duplicates} repeat${summary.duplicates === 1 ? '' : 's'} counted once. `}{summary.capped > 0 && `${summary.capped} over the comment limit and left for next time. `}{summary.skipped > summary.duplicates + summary.capped && `${summary.skipped - summary.duplicates - summary.capped} other comment or video skipped.`}</p>
      )}
      {summary.notes.length > 0 && (
        <ul className="scan-notes" aria-label="Scan notes">{summary.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      )}
      {summary.perVideo.length > 0 && (
        <details className="more-options">
          <summary>Per-video breakdown and YouTube units</summary>
          <p className="workflow-note">Used {summary.quotaUnits} YouTube units of the {DAILY_QUOTA.toLocaleString()} daily allowance. Each search costs 100; one video lookup and each comment page cost 1. Search comment counts can include replies or change before a scan, so a video can show 10+ comments yet return no readable top-level comments.</p>
          <ul className="video-breakdown">
            {summary.perVideo.map((video) => (
              <li key={video.youtubeVideoId}>
                <strong>{video.title || video.youtubeVideoId}</strong>
                <span>Read {video.fetched}{video.commentCountOnYouTube ? ` of about ${video.commentCountOnYouTube}` : ''} · listed {video.kept}{video.duplicates ? ` · ${video.duplicates} repeats` : ''}{video.error ? ` · ${video.error === 'commentsDisabled' ? 'comments turned off' : `could not read: ${video.error}`}` : video.fetched === 0 && video.stoppedBy === 'no_more_comments' ? ' · no readable top-level comments (count may include replies or have changed)' : video.stoppedBy ? ` · ${stopReasons[video.stoppedBy] || video.stoppedBy}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="approval-hooks">
        <button type="button" className="big-button" onClick={() => onShow('best')}>Review best leads</button>
        <button type="button" className="quiet-button" onClick={() => onShow('not_fit')}>See what was not a fit</button>
      </div>
    </section>
  );
}
