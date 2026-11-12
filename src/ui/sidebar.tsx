import React, { useEffect, useRef, useState } from 'react';
import { apiJson } from './api';
import { buildScanSummary, normaliseImportedOpportunity } from './helpers';
import { MAX_COMMENTS, MIN_COMMENTS, VIDEO_AGE_CHOICES, manualImportBody, parseVideoLinks, presetFor, withCommentCap, withDaysBack, withManualPages, type ScanOptions } from './scanOptions.js';
import type { ScanResult } from './scanStep';
import type { PreviousScan, ScoredFixture } from './types';

export type SidebarPanel = 'saved' | 'advanced' | 'options';

const ITEMS: Array<{ id: SidebarPanel | 'export'; label: string }> = [
  { id: 'saved', label: 'Open a saved scan' },
  { id: 'advanced', label: 'Advanced: scan specific videos' },
  { id: 'export', label: 'Export CSV' },
  { id: 'options', label: 'More options' },
];

export function Sidebar({ openPanel, onOpenPanel, mobileOpen, onMobileClose, options, onOptionsChange, onResult, onExport, exportDisabled }: {
  openPanel: SidebarPanel | null;
  onOpenPanel: (panel: SidebarPanel | null) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  options: ScanOptions;
  onOptionsChange: (next: ScanOptions) => void;
  onResult: (result: ScanResult) => void;
  onExport: () => void;
  exportDisabled: boolean;
}) {
  const [previousScans, setPreviousScans] = useState<PreviousScan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [videoUrls, setVideoUrls] = useState('');
  const navRef = useRef<HTMLElement | null>(null);

  // Escape closes the open panel and, on phones, the whole menu.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (openPanel) onOpenPanel(null);
      if (mobileOpen) {
        onMobileClose();
        document.querySelector<HTMLElement>('.menu-toggle')?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPanel, mobileOpen, onOpenPanel, onMobileClose]);

  // Opening the phone menu moves focus into it.
  useEffect(() => {
    if (mobileOpen && window.matchMedia('(max-width: 900px)').matches) navRef.current?.querySelector<HTMLElement>('.sidebar-item')?.focus();
  }, [mobileOpen]);

  // Cheap indicator: one read of the saved-scan list when the app opens.
  useEffect(() => {
    apiJson('/api/import-runs?limit=10').then((body) => setPreviousScans(body.items || [])).catch(() => setPreviousScans(null));
  }, []);

  async function run(task: () => Promise<void>, busy: string) {
    setLoading(true);
    setMessage(busy);
    try { await task(); } catch (error) {
      setMessage(`That did not work: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally { setLoading(false); }
  }

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
    onMobileClose();
  }, 'Loading that scan.');

  const loadEverything = () => run(async () => {
    const body = await apiJson('/api/opportunities?limit=500');
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onResult({ items, summary: buildScanSummary('saved', items, {}), nicheScan: items.some((item: ScoredFixture) => item.score.opportunityType === 'niche_lead') });
    setMessage(`Loaded your ${items.length} highest-scoring saved comments from all scans.`);
    onMobileClose();
  }, 'Loading all saved comments.');

  const deletePrevious = (scan: PreviousScan) => {
    if (!window.confirm('Delete this saved scan? Its comments, drafts and review history will be removed. This cannot be undone.')) return;
    run(async () => {
      await apiJson(`/api/import-runs/${encodeURIComponent(scan.id)}`, { method: 'DELETE' });
      setPreviousScans((current) => (current || []).filter((item) => item.id !== scan.id));
      setMessage('Scan deleted.');
    }, 'Deleting that scan.');
  };

  const importUrls = () => run(async () => {
    const body = await apiJson('/api/import/youtube', { method: 'POST', body: JSON.stringify(manualImportBody(options, videoUrls)) });
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onResult({ items, summary: buildScanSummary('manual', items, body), nicheScan: false, runId: body.run?.id });
    setMessage('Done. The comments from those videos are in Step 3.');
    onMobileClose();
  }, 'Reading comments from the videos you pasted.');

  function toggle(id: SidebarPanel) {
    const next = openPanel === id ? null : id;
    onOpenPanel(next);
    if (next === 'saved' && previousScans === null) listPrevious();
  }

  const savedCount = previousScans?.length || 0;
  const linkCount = parseVideoLinks(videoUrls).length;

  return (
    <nav ref={navRef} id="app-sidebar" className={mobileOpen ? 'app-sidebar open' : 'app-sidebar'} aria-label="Tools">
      <ul className="sidebar-list">
        {ITEMS.map((entry) => {
          if (entry.id === 'export') {
            return (
              <li key={entry.id}>
                <button type="button" className="sidebar-item" onClick={() => { onExport(); onMobileClose(); }} disabled={exportDisabled}
                  title={exportDisabled ? 'Run or load a scan first' : 'Download the comments shown in Step 3'}
                  aria-describedby={exportDisabled ? 'export-hint' : undefined}>
                  {entry.label}
                </button>
                {exportDisabled && <small id="export-hint" className="sidebar-hint">Run or load a scan first</small>}
              </li>
            );
          }
          const id = entry.id;
          const open = openPanel === id;
          return (
            <li key={id}>
              <button type="button" className={open ? 'sidebar-item selected' : 'sidebar-item'} aria-expanded={open} aria-controls={`sidebar-panel-${id}`} onClick={() => toggle(id)}>
                <span>{entry.label}</span>
                {id === 'saved' && savedCount > 0 && <span className="sidebar-count" aria-label={`${savedCount} saved scans`}>{savedCount}</span>}
                <span className="sidebar-caret" aria-hidden="true">{open ? '\u2212' : '+'}</span>
              </button>
              {open && (
                <div id={`sidebar-panel-${id}`} className="sidebar-panel" role="region" aria-label={entry.label}>
                  {id === 'saved' && (
                    <>
                      <div className="approval-hooks">
                        <button type="button" className="workflow-button" disabled={loading} onClick={listPrevious}>Refresh list</button>
                        <button type="button" className="workflow-button" disabled={loading} onClick={loadEverything}>Show all saved comments</button>
                      </div>
                      {previousScans && previousScans.length > 0 ? (
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
                      ) : <p className="workflow-note">{previousScans ? 'No saved scans yet.' : 'Loading…'}</p>}
                    </>
                  )}
                  {id === 'advanced' && (
                    <>
                      <label className="stacked-label">
                        <span>YouTube video links, one per line (up to 10)</span>
                        <textarea value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                      </label>
                      <label className="manual-page-option">Comment pages per video
                        <input type="number" min={1} max={3} value={options.manualPages} onChange={(event) => onOptionsChange(withManualPages(options, Number(event.target.value)))} />
                      </label>
                      <small className="workflow-note">Reads up to {options.commentCap} comments in total (set in More options). These videos use the older buyer and site-owner scoring, not the niche lead scoring.</small>
                      <div className="approval-hooks">
                        <button type="button" className="workflow-button safe" disabled={loading || !linkCount} onClick={importUrls}>
                          Read comments from {linkCount ? `${Math.min(10, linkCount)} video${Math.min(10, linkCount) === 1 ? '' : 's'}` : 'these videos'}
                        </button>
                      </div>
                    </>
                  )}
                  {id === 'options' && (
                    <div className="options-grid sidebar-options">
                      <label>
                        <span>Video age</span>
                        <select value={options.daysBack} onChange={(event) => onOptionsChange(withDaysBack(options, Number(event.target.value)))}>
                          {VIDEO_AGE_CHOICES.map((days) => <option key={days} value={days}>Videos from the last {days} days{days === 30 ? ' (recommended)' : ''}</option>)}
                        </select>
                        <small>Videos need a few days to collect comments, so 30 days usually finds the most people.</small>
                      </label>
                      <label>
                        <span>Most comments to read</span>
                        <input type="number" min={MIN_COMMENTS} max={MAX_COMMENTS} value={options.commentCap}
                          onChange={(event) => onOptionsChange(withCommentCap(options, Number(event.target.value)))} />
                        <small>Shared evenly across the videos. {MAX_COMMENTS} is the most one scan can read. Changing the scan size resets this to {presetFor(options).comments}.</small>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="status-line sidebar-status" role="status" aria-live="polite">{message}</p>
    </nav>
  );
}
