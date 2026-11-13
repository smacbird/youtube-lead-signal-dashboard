import React, { useEffect, useRef, useState } from 'react';
import { apiJson } from './api';
import { buildScanSummary, normaliseImportedOpportunity } from './helpers';
import { Modal } from './modal';
import { scanCardMeta, scanCardTitle, scanLeadLine, sortScansNewestFirst } from './scanFormat.js';
import { MAX_COMMENTS, MIN_COMMENTS, VIDEO_AGE_CHOICES, manualImportBody, parseVideoLinks, presetFor, withCommentCap, withDaysBack, withManualPages, type ScanOptions } from './scanOptions.js';
import type { ScanResult } from './scanStep';
import type { PreviousScan, ScoredFixture } from './types';

export type SidebarPanel = 'saved' | 'advanced' | 'options';

const ITEMS: Array<{ id: SidebarPanel | 'export' | 'sheets'; label: string }> = [
  { id: 'saved', label: 'Open a saved scan' },
  { id: 'advanced', label: 'Advanced: scan specific videos' },
  { id: 'export', label: 'Export CSV' },
  { id: 'sheets', label: 'Export to Google Sheets' },
  { id: 'options', label: 'More options' },
];

export function Sidebar({ openPanel, onOpenPanel, mobileOpen, onMobileClose, options, onOptionsChange, onResult, onExport, onExportSheets, sheetsBusy, onHealthChange, exportDisabled }: {
  openPanel: SidebarPanel | null;
  onOpenPanel: (panel: SidebarPanel | null) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  options: ScanOptions;
  onOptionsChange: (next: ScanOptions) => void;
  onResult: (result: ScanResult) => void;
  onExport: () => void;
  onExportSheets: () => void;
  sheetsBusy: boolean;
  onHealthChange: () => void;
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
    } finally { setLoading(false); onHealthChange(); }
  }

  const listPrevious = () => run(async () => {
    const body = await apiJson('/api/import-runs?limit=10');
    setPreviousScans(body.items || []);
    setMessage(body.items?.length ? '' : 'No saved scans yet.');
  }, 'Loading saved scans.');

  const loadPrevious = (scan: PreviousScan) => run(async () => {
    const body = await apiJson(`/api/import-runs/${encodeURIComponent(scan.id)}`);
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onOpenPanel(null);
    onMobileClose();
    setMessage(`Loaded: ${scanCardTitle(scan)}`);
    onResult({ items, summary: buildScanSummary('previous', items, body), nicheScan: body.run?.metadata?.scanType === 'niche', runId: body.run?.id });
  }, 'Loading that scan.');

  const loadEverything = () => run(async () => {
    const body = await apiJson('/api/opportunities?limit=500');
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onOpenPanel(null);
    onMobileClose();
    setMessage(`Loaded your ${items.length} highest-scoring saved comments from all scans.`);
    onResult({ items, summary: buildScanSummary('saved', items, {}), nicheScan: items.some((item: ScoredFixture) => item.score.opportunityType === 'niche_lead') });
  }, 'Loading all saved comments.');

  const deletePrevious = (scan: PreviousScan) => {
    if (!window.confirm('Delete this saved scan? Its comments, drafts and review history will be removed. This cannot be undone.')) return;
    run(async () => {
      const result = await apiJson(`/api/import-runs/${encodeURIComponent(scan.id)}`, { method: 'DELETE' });
      if (!result.deleted) throw new Error(result.message || 'Scan was not deleted.');
      setPreviousScans((current) => (current || []).filter((item) => item.id !== scan.id));
      setMessage(result.warning ? `Scan removed. ${result.warning}` : 'Scan deleted.');
    }, 'Deleting that scan.');
  };

  const importUrls = () => run(async () => {
    const body = await apiJson('/api/import/youtube', { method: 'POST', body: JSON.stringify(manualImportBody(options, videoUrls)) });
    const items = (body.items || []).map(normaliseImportedOpportunity);
    onOpenPanel(null);
    onMobileClose();
    setMessage('Done. The comments from those videos are in Step 3.');
    onResult({ items, summary: buildScanSummary('manual', items, body), nicheScan: false, runId: body.run?.id });
  }, 'Reading comments from the videos you pasted.');

  function toggle(id: SidebarPanel) {
    const next = openPanel === id ? null : id;
    onOpenPanel(next);
    // Refresh each time the dialog opens so new scans appear; on phones close the drop-down menu
    // so it never sits behind the dialog.
    if (next === 'saved') listPrevious();
    if (next === 'saved' || next === 'advanced') onMobileClose();
  }

  const savedCount = previousScans?.length || 0;
  const linkCount = parseVideoLinks(videoUrls).length;

  const sortedScans = sortScansNewestFirst(previousScans || []);

  return (
    <>
    <nav ref={navRef} id="app-sidebar" className={mobileOpen ? 'app-sidebar open' : 'app-sidebar'} aria-label="Tools">
      <ul className="sidebar-list">
        {ITEMS.map((entry) => {
          if (entry.id === 'sheets') return <li key={entry.id}>
            <button type="button" className="sidebar-item" onClick={onExportSheets} disabled={sheetsBusy}>
              <span>{sheetsBusy ? 'Preparing Google Sheets...' : entry.label}</span>
            </button>
          </li>;
          if (entry.id === 'export') {
            return (
              <li key={entry.id}>
                <button type="button" className="sidebar-item" onClick={() => { onExport(); onMobileClose(); }} disabled={exportDisabled}
                  title={exportDisabled ? 'Run or load a scan first' : 'Download the comments shown in Step 3'}
                  aria-describedby={exportDisabled ? 'export-hint' : undefined}>
                  <span>{entry.label}</span>
                </button>
                {exportDisabled && <small id="export-hint" className="sidebar-hint">Run or load a scan first</small>}
              </li>
            );
          }
          const id = entry.id;
          const open = openPanel === id;
          const isModal = id === 'saved' || id === 'advanced';
          return (
            <li key={id}>
              <button type="button" className={open ? 'sidebar-item selected' : 'sidebar-item'}
                aria-expanded={isModal ? undefined : open} aria-haspopup={isModal ? 'dialog' : undefined}
                aria-controls={isModal ? undefined : `sidebar-panel-${id}`} onClick={() => toggle(id)}>
                <span>{entry.label}</span>
                {id === 'saved' && savedCount > 0 && <span className="sidebar-count" aria-label={`${savedCount} saved scans`}>{savedCount}</span>}
                <span className="sidebar-caret" aria-hidden="true">{isModal ? '›' : open ? '−' : '+'}</span>
              </button>
              {open && id === 'options' && (
                <div id="sidebar-panel-options" className="sidebar-panel" role="region" aria-label={entry.label}>
                  <div className="sidebar-options">
                    <label className="sidebar-field">
                      <span>Video age</span>
                      <select value={options.daysBack} onChange={(event) => onOptionsChange(withDaysBack(options, Number(event.target.value)))}>
                        {VIDEO_AGE_CHOICES.map((days) => <option key={days} value={days}>Last {days} days{days === 30 ? ' (recommended)' : ''}</option>)}
                      </select>
                      <small>Videos need a few days to collect comments, so 30 days usually finds the most people.</small>
                    </label>
                    <label className="sidebar-field">
                      <span>Most comments to read</span>
                      <input type="number" min={MIN_COMMENTS} max={MAX_COMMENTS} value={options.commentCap}
                        onChange={(event) => onOptionsChange(withCommentCap(options, Number(event.target.value)))} />
                      <small>Shared evenly across the videos. {MAX_COMMENTS} is the most one scan can read. Changing the scan size resets this to {presetFor(options).comments}.</small>
                    </label>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {message && !openPanel && <p className="status-line sidebar-status" role="status" aria-live="polite">{message}</p>}
    </nav>

    <Modal open={openPanel === 'saved'} title="Saved scans" onClose={() => onOpenPanel(null)} wide>
      <div className="approval-hooks modal-actions">
        <button type="button" className="workflow-button" disabled={loading} onClick={listPrevious}>Refresh list</button>
        <button type="button" className="workflow-button" disabled={loading} onClick={loadEverything}>Show all saved comments</button>
      </div>
      <p className="status-line" role="status" aria-live="polite">{message}</p>
      {sortedScans.length > 0 ? (
        <ul className="saved-scan-list" aria-label="Saved scans, newest first">
          {sortedScans.map((scan) => {
            const leadLine = scanLeadLine(scan);
            return (
              <li key={scan.id} className="saved-scan-card">
                <p className="scan-title">{scanCardTitle(scan)}</p>
                <p className="saved-scan-meta">{scanCardMeta(scan)}</p>
                {leadLine && <p className="saved-scan-leads">{leadLine}</p>}
                <div className="saved-scan-actions">
                  <button type="button" className="workflow-button safe" disabled={loading} onClick={() => loadPrevious(scan)}>Open this scan</button>
                  <button type="button" className="workflow-button danger" disabled={loading} onClick={() => deletePrevious(scan)} aria-label={`Delete saved scan ${scanCardTitle(scan)}`}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="workflow-note">{previousScans ? 'No saved scans yet.' : 'Loading…'}</p>}
    </Modal>

    <Modal open={openPanel === 'advanced'} title="Scan specific videos" onClose={() => onOpenPanel(null)}>
      <label className="stacked-label sidebar-field">
        <span>YouTube video links, one per line (up to 10)</span>
        <textarea data-autofocus value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
      </label>
      <label className="sidebar-field inline-number">
        <span>Comment pages per video</span>
        <input type="number" min={1} max={3} value={options.manualPages} onChange={(event) => onOptionsChange(withManualPages(options, Number(event.target.value)))} />
      </label>
      <p className="workflow-note">Reads up to {options.commentCap} comments in total (set in More options). These videos use the older buyer and site-owner scoring, not the niche lead scoring.</p>
      <div className="approval-hooks modal-actions">
        <button type="button" className="workflow-button safe" disabled={loading || !linkCount} onClick={importUrls}>
          Read comments from {linkCount ? `${Math.min(10, linkCount)} video${Math.min(10, linkCount) === 1 ? '' : 's'}` : 'these videos'}
        </button>
      </div>
      <p className="status-line" role="status" aria-live="polite">{message}</p>
    </Modal>
    </>
  );
}
