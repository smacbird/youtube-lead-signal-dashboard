import React, { useState } from 'react';
import { apiJson } from './api';
import { buildScanSummary, nichePhrase, normaliseImportedOpportunity } from './helpers';
import { StatCard } from './layout';
import { DAILY_QUOTA, SCAN_PRESETS, estimateScanQuota } from './scanPresets.js';
import { nicheScanBody, presetFor, scanOptionsSummary, withDaysBack, withPreset, type ScanOptions } from './scanOptions.js';
import type { AppSettings, NicheProfile, ScanSummary, ScoredFixture } from './types';

export type ScanResult = { items: ScoredFixture[]; summary: ScanSummary; nicheScan: boolean; runId?: string };

// Query-bundle sizes mirror server/youtube/nicheProfiles.js so the quota estimate is honest.
const QUERIES_PER_NICHE: Record<string, number> = {
  clicks_no_sales: 6, traffic_leads: 5, affiliate_funnels: 5, email_follow_up: 5,
  organic_traffic: 5, choosing_offers: 5, training_reviews: 5, affiliate_marketing: 6,
  ai_tools: 5, biz_opp: 5, work_from_home: 5, side_hustles: 5,
};

export function ScanPanel({ niche, settings, options, onOptionsChange, onOpenOptions, onResult, onHealthChange, hasResults }: {
  niche: NicheProfile;
  settings: AppSettings;
  options: ScanOptions;
  onOptionsChange: (next: ScanOptions) => void;
  onOpenOptions: () => void;
  onResult: (result: ScanResult) => void;
  onHealthChange: () => void;
  hasResults: boolean;
}) {
  const preset = presetFor(options);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const quota = estimateScanQuota({ videos: preset.videos, comments: options.commentCap, queryCount: QUERIES_PER_NICHE[niche] || 6 });

  async function scanByNiche() {
    setLoading(true);
    setMessage(`Scanning for ${nichePhrase(niche)} leads: this takes ${preset.time}.`);
    try {
      const body = await apiJson('/api/scan/youtube-niche', { method: 'POST', body: JSON.stringify(nicheScanBody(options, niche, settings.replyTone)) });
      const items = (body.items || []).map(normaliseImportedOpportunity);
      onResult({ items, summary: buildScanSummary('scan', items, body), nicheScan: true, runId: body.run?.id });
      setMessage('Scan finished. Your leads are in Step 3.');
    } catch (error) {
      setMessage(`That did not work: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setLoading(false);
      onHealthChange();
    }
  }

  return (
    <div className="scan-panel">
      <fieldset className="preset-grid">
        <legend>How big a scan?</legend>
        {SCAN_PRESETS.map((option) => (
          <label key={option.id} className={options.presetId === option.id ? 'preset-card selected' : 'preset-card'}>
            <input type="radio" name="scan-size" value={option.id} checked={options.presetId === option.id} onChange={() => onOptionsChange(withPreset(options, option.id))} />
            <strong><span className="choice-indicator" aria-hidden="true">{options.presetId === option.id ? '✓' : ''}</span>{option.label}</strong>
            <span className="choice-description">{option.blurb}</span>
            <small>Takes {option.time}</small>
          </label>
        ))}
      </fieldset>
      <p className="quota-note">
        About {quota.low}–{quota.high} of your {DAILY_QUOTA.toLocaleString()} daily YouTube units. Each search costs 100; reading comments is cheap (1 unit per page).
      </p>
      <p className="options-summary">
        <button type="button" className="link-button" onClick={onOpenOptions} aria-controls="sidebar-panel-options">
          {scanOptionsSummary(options)} · change in More options
        </button>
      </p>

      {niche === 'clicks_no_sales' && options.daysBack < 90 && <p className="workflow-note">
        Finding recent affiliate conversion-pain videos can be harder. Keep your {options.daysBack}-day choice, or{' '}
        <button type="button" className="link-button" onClick={() => onOptionsChange(withDaysBack(options, 90))}>select the last 90 days</button>
        {' '}before scanning. This does not change your saved default.
      </p>}

      <div className="primary-action-row">
        <button type="button" className={hasResults ? 'big-button secondary' : 'big-button'} disabled={loading} onClick={scanByNiche} aria-describedby="scan-status">
          {loading ? 'Working…' : hasResults ? 'Run another scan' : `Find ${nichePhrase(niche)} leads`}
        </button>
      </div>
      <p id="scan-status" className="status-line" role="status" aria-live="polite">{message}</p>
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
          {summary.startedAt && <small className="workflow-note">Scanned {new Date(summary.startedAt).toLocaleString()} (your local time).</small>}
          {summary.candidatesConsidered != null && summary.videos !== null && <p className="workflow-note">{summary.videos} of {summary.candidatesConsidered} searched videos met this scan’s video-selection rules.</p>}
          {!summary.startedAt && summary.title && <small className="workflow-note">{summary.title}</small>}
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
