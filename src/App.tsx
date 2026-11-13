import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import sampleData from '../data/sample-comments.json';
import { scoreSampleItems } from './scoring/scoring.js';
import { apiJson, setCsrfToken } from './ui/api';
import { pickSelectedItem } from './ui/draftSelection.js';
import { shouldAutoDraft } from './ui/autoDraft.js';
import { safeDraftsForOpportunity } from './scoring/draftSafety.js';
import { buildScanSummary, exportOpportunitiesCsv, isWithinAge, matchesTab, nicheLabel, nichePhrase, normaliseImportedOpportunity, statusLabels, typeLabels } from './ui/helpers';
import { AppHeader, StepProgress, StepSection, type StepState } from './ui/layout';
import { NichePicker } from './ui/nicheStep';
import { ReplyPanel } from './ui/replyStep';
import { AgeFilter, EmptyList, LeadCard, ReviewTabs } from './ui/reviewStep';
import { ScanPanel, ScanResultCard, type ScanResult } from './ui/scanStep';
import { SettingsPanel } from './ui/settings';
import { keyWarnings } from './ui/keyWarnings';
import { exportFilteredToGoogleSheets } from './ui/googleSheets';
import { Sidebar, type SidebarPanel } from './ui/sidebar';
import { defaultScanOptions, type ScanOptions } from './ui/scanOptions.js';
import type { AppSettings, FixtureItem, FreshnessWindow, HealthConfig, LocalStatus, NicheProfile, OpportunityType, ReviewTab, ScanSummary, ScoreBand, ScoredFixture, Status } from './ui/types';
import './styles.css';

const ALL_NICHES: NicheProfile[] = ['affiliate_marketing', 'money_making', 'work_from_home', 'side_hustles', 'biz_opp', 'ai_tools', 'traffic_leads', 'organic_traffic'];
const LAST_RUN_KEY = 'best-lead-system:last-run';
const SELECTED_LEAD_KEY = 'best-lead-system:selected-lead';
const CORE_TABS: ReviewTab[] = ['best', 'maybe', 'not_fit', 'done'];

function buildDemoItems(): ScoredFixture[] {
  const items = sampleData.items as FixtureItem[];
  const scores = scoreSampleItems(items as any);
  return items.map((item, index) => ({ ...item, score: { ...scores[index], lowFitReason: null, nicheProfileLabel: null } } as ScoredFixture))
    .sort((a, b) => b.score.overallScore - a.score.overallScore);
}

function scrollToStep(n: number) {
  const el = document.getElementById(`step-${n}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }), 300);
}

function App({ initialSettings, initialHealth }: { initialSettings: AppSettings; initialHealth: HealthConfig }) {
  const [items, setItems] = useState<ScoredFixture[]>([]);
  const [summary, setSummary] = useState<ScanSummary | undefined>();
  const [isDemo, setIsDemo] = useState(false);
  const [niche, setNiche] = useState<NicheProfile>(initialSettings.enabledNiches.includes('work_from_home') ? 'work_from_home' : initialSettings.enabledNiches[0]);
  const [nicheChosen, setNicheChosen] = useState(false);
  const [expandedStep, setExpandedStep] = useState(1);
  const [tab, setTab] = useState<ReviewTab>('best');
  const [age, setAge] = useState<FreshnessWindow>('all');
  const [statusFilter, setStatusFilter] = useState<Status>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreBand>('all');
  const [typeFilter, setTypeFilter] = useState<OpportunityType>('all');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [firstLeadId, setFirstLeadId] = useState<string | undefined>();
  const [statuses, setStatuses] = useState<Record<string, LocalStatus>>({});
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, string>>({});
  const [healthConfig, setHealthConfig] = useState<HealthConfig>(initialHealth);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [settingsStatus, setSettingsStatus] = useState('Saved on this service.');
  const [sheetStatus, setSheetStatus] = useState<{ message: string; url?: string } | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const skipInitialSettingsSave = useRef(true);
  const settingsSaveVersion = useRef(0);
  const [scanOptions, setScanOptions] = useState<ScanOptions>(() => defaultScanOptions(initialSettings));
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const replyRef = useRef<HTMLDivElement | null>(null);
  const attemptedAutoDrafts = useRef(new Set<string>());
  const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const selectedIdLive = useRef<string | undefined>(undefined);
  const [draftFeedback, setDraftFeedback] = useState<{ id: string; writing: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (skipInitialSettingsSave.current) { skipInitialSettingsSave.current = false; return; }
    const version = ++settingsSaveVersion.current;
    setSettingsStatus('Saving settings...');
    const timer = window.setTimeout(async () => {
      try {
        await apiJson('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
        if (version === settingsSaveVersion.current) setSettingsStatus('Settings saved across visits.');
      } catch (error) {
        if (version === settingsSaveVersion.current) setSettingsStatus(`Settings were not saved: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [settings]);

  // Restore this tab's last saved run on reload; no YouTube call is made.
  useEffect(() => {
    const runId = sessionStorage.getItem(LAST_RUN_KEY);
    if (!runId) return;
    let active = true;
    apiJson(`/api/import-runs/${encodeURIComponent(runId)}`).then((body) => {
      if (!active) return;
      const restored = (body.items || []).map(normaliseImportedOpportunity);
      setItems(restored);
      setSummary(buildScanSummary('previous', restored, body));
      setStatuses(Object.fromEntries(restored.map((item: ScoredFixture) => [item.id, item.opportunity.status])));
      setNicheChosen(true);
      const profile = body.run?.metadata?.profileId;
      if (ALL_NICHES.includes(profile)) setNiche(profile);
      const lastSelected = sessionStorage.getItem(SELECTED_LEAD_KEY);
      if (lastSelected && restored.some((item: ScoredFixture) => item.id === lastSelected)) {
        setSelectedId(lastSelected);
        setFirstLeadId(lastSelected);
        setExpandedStep(4);
        window.setTimeout(() => scrollToStep(4), 100);
      } else {
        setExpandedStep(3);
        window.setTimeout(() => scrollToStep(3), 100);
      }
    }).catch(() => { sessionStorage.removeItem(LAST_RUN_KEY); sessionStorage.removeItem(SELECTED_LEAD_KEY); });
    return () => { active = false; };
  }, []);

  const statusOf = (item: ScoredFixture) => statuses[item.id] ?? item.opportunity.status;

  // Buyer / site-owner tabs only appear when that kind of comment is in the data (pasted video links).
  const tabs = useMemo(() => {
    const extra: ReviewTab[] = [];
    if (items.some((item) => item.score.opportunityType === 'consumer_buyer_question')) extra.push('buyer');
    if (items.some((item) => item.score.opportunityType === 'affiliate_publisher_opportunity')) extra.push('publisher');
    return [...CORE_TABS.slice(0, 2), ...extra, ...CORE_TABS.slice(2)];
  }, [items]);

  const ageFiltered = useMemo(() => items.filter((item) => {
    const statusMatch = statusFilter === 'all' || statusOf(item) === statusFilter;
    const scoreMatch = scoreFilter === 'all' || item.score.priority === scoreFilter;
    const typeMatch = typeFilter === 'all' || item.score.opportunityType === typeFilter;
    return isWithinAge(item, age) && statusMatch && scoreMatch && typeMatch;
  }), [items, age, statusFilter, scoreFilter, typeFilter, statuses]);
  const counts = useMemo(() => {
    const result = { best: 0, maybe: 0, not_fit: 0, done: 0, buyer: 0, publisher: 0 } as Record<ReviewTab, number>;
    for (const item of ageFiltered) for (const t of tabs) if (matchesTab(item, statusOf(item), t)) result[t] += 1;
    return result;
  }, [ageFiltered, tabs, statuses]);
  const visible = useMemo(() => ageFiltered.filter((item) => matchesTab(item, statusOf(item), tab)), [ageFiltered, tab, statuses]);
  const selected = pickSelectedItem(visible, selectedId);
  selectedIdLive.current = selected?.id;
  const nicheLeadCount = items.filter((item) => item.score.opportunityType === 'niche_lead').length;
  const warnings = keyWarnings(healthConfig);
  const refreshHealth = () => { apiJson('/api/config').then(setHealthConfig).catch(() => {}); };

  useEffect(() => { if (!tabs.includes(tab)) setTab('best'); }, [tabs, tab]);

  // Debounce navigation and serialize generation so rapid clicks never create multiple
  // simultaneous paid requests. The server caches AI drafts per opportunity as well.
  useEffect(() => {
    if (!shouldAutoDraft(selected, selected && statusOf(selected), {
      hasKey: Boolean(healthConfig.aiDraftsConfigured), isDemo,
      attempted: selected ? attemptedAutoDrafts.current.has(selected.id) : false,
    })) return;
    const id = selected!.id;
    setDraftFeedback({ id, writing: true });
    const timer = window.setTimeout(() => {
      const job = draftQueue.current.then(async () => {
        if (selectedIdLive.current !== id) return;
        attemptedAutoDrafts.current.add(id);
        await fetchDraftFor(id, false);
      });
      draftQueue.current = job.catch(() => {});
      job.then(() => setDraftFeedback({ id, writing: false }))
        .catch((error) => setDraftFeedback({ id, writing: false, error: error instanceof Error ? error.message : 'Reply ideas need the OpenAI key or a working connection.' }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [selected?.id, items, statuses, healthConfig.aiDraftsConfigured, isDemo]);

  const stepStates: StepState[] = [
    nicheChosen || items.length ? 'done' : 'current',
    items.length ? 'done' : nicheChosen ? 'current' : 'upcoming',
    !items.length ? 'upcoming' : selected ? 'done' : 'current',
    selected ? 'current' : 'upcoming',
  ];

  function applyResult({ items: next, summary: nextSummary, runId }: ScanResult) {
    if (runId) sessionStorage.setItem(LAST_RUN_KEY, runId);
    else sessionStorage.removeItem(LAST_RUN_KEY);
    sessionStorage.removeItem(SELECTED_LEAD_KEY);
    setItems(next);
    setSummary(nextSummary);
    setIsDemo(false);
    setStatuses((current) => ({ ...current, ...Object.fromEntries(next.map((item) => [item.id, item.opportunity.status])) }));
    setAge('all');
    setStatusFilter('all');
    setScoreFilter('all');
    setTypeFilter('all');
    setTab('best');
    setSelectedId(undefined);
    setFirstLeadId(undefined);
    setExpandedStep(3);
    window.setTimeout(() => scrollToStep(3), 50);
  }

  function resetForNewScan() {
    sessionStorage.removeItem(LAST_RUN_KEY);
    sessionStorage.removeItem(SELECTED_LEAD_KEY);
    setExpandedStep(1);
    setItems([]);
    setFirstLeadId(undefined);
    setSummary(undefined);
    setIsDemo(false);
    setSelectedId(undefined);
    setTab('best');
    setAge('all');
    setStatusFilter('all');
    setScoreFilter('all');
    setTypeFilter('all');
    scrollToStep(1);
  }

  function showDemo() {
    sessionStorage.removeItem(LAST_RUN_KEY);
    sessionStorage.removeItem(SELECTED_LEAD_KEY);
    setExpandedStep(3);
    const demo = buildDemoItems();
    setItems(demo);
    setIsDemo(true);
    setSummary(buildScanSummary('saved', demo, {}));
    setStatuses((current) => ({ ...current, ...Object.fromEntries(demo.map((item) => [item.id, item.opportunity.status])) }));
    setTab('best');
  }

  function selectLead(id: string) {
    if (!firstLeadId) setFirstLeadId(id);
    sessionStorage.setItem(SELECTED_LEAD_KEY, id);
    setSelectedId(id);
    setExpandedStep(4);
    window.setTimeout(() => replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  async function updateStatus(to: LocalStatus) {
    if (!selected) return;
    const target = selected;
    if (to === 'replied' || to === 'rejected') {
      const next = visible.find((item) => item.id !== target.id);
      if (next) { setSelectedId(next.id); sessionStorage.setItem(SELECTED_LEAD_KEY, next.id); }
      else { setSelectedId(undefined); sessionStorage.removeItem(SELECTED_LEAD_KEY); setExpandedStep(3); }
    }
    setStatuses((current) => ({ ...current, [target.id]: to }));
    if (isDemo) return;
    const endpoint = to === 'replied' ? `/api/opportunities/${encodeURIComponent(target.id)}/manual-replied` : `/api/opportunities/${encodeURIComponent(target.id)}/status`;
    apiJson(endpoint, { method: 'POST', body: JSON.stringify({ toStatus: to, note: 'Updated from the review screen.' }) })
      .catch((error) => console.warn('Saving status failed safely', error));
  }

  function selectDraft(draftId: string) {
    if (!selected) return;
    const target = selected;
    setSelectedDrafts((current) => ({ ...current, [target.id]: draftId }));
    if (isDemo) return;
    apiJson(`/api/opportunities/${encodeURIComponent(target.id)}/selected-draft`, { method: 'POST', body: JSON.stringify({ draftId }) })
      .catch((error) => console.warn('Saving selected draft failed safely', error));
  }

  async function fetchDraftFor(id: string, force: boolean) {
    let body;
    try { body = await apiJson(`/api/opportunities/${encodeURIComponent(id)}/ai-drafts`, { method: 'POST', body: JSON.stringify({ force }) }); }
    finally { refreshHealth(); }
    const updated = normaliseImportedOpportunity(body.item);
    const safe = safeDraftsForOpportunity(updated.opportunity.replyDrafts, id);
    const answer = safe.find((draft) => draft.style === 'ai_short_helpful')
      || safe.find((draft) => draft.style === 'ai_consultative')
      || safe.find((draft) => draft.style === 'fallback_short');
    setItems((current) => current.map((item) => item.id === id ? updated : item));
    if (answer) setSelectedDrafts((current) => ({ ...current, [id]: answer.id }));
  }

  async function generateDrafts() {
    if (!selected || isDemo) throw new Error('Reply ideas need a real lead and the OpenAI key.');
    if (!healthConfig.aiDraftsConfigured) throw new Error('Reply ideas need the OpenAI key.');
    const id = selected.id;
    const job = draftQueue.current.then(() => fetchDraftFor(id, true));
    draftQueue.current = job.catch(() => {});
    await job;
  }

  async function handleSheetsExport() {
    if (sheetBusy) return;
    setSheetBusy(true);
    setSheetStatus({ message: 'Preparing Google Sheets export...' });
    try {
      const result = await exportFilteredToGoogleSheets(visible, statuses, healthConfig.googleClientId);
      setSheetStatus({ message: result.message, url: 'url' in result ? result.url : undefined });
    } catch (error) {
      setSheetStatus({ message: error instanceof Error ? error.message : 'Google Sheets export did not finish. CSV export still works.' });
    } finally { setSheetBusy(false); }
  }

  async function signOut() {
    try {
      await apiJson('/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <div className="dashboard-shell">
      <AppHeader
        leadCount={items.length && !isDemo && (nicheLeadCount || summary?.source === 'scan') ? nicheLeadCount : null}
        onSettings={() => setShowSettings((value) => !value)}
        settingsOpen={showSettings}
        onSignOut={signOut}
        onReset={resetForNewScan}
        menuOpen={sidebarOpen}
        onToggleMenu={() => setSidebarOpen((value) => !value)}
      />
      {warnings.length > 0 && <aside className="key-health-banner" role="alert" aria-label="API key warnings">{warnings.join(' ')}</aside>}
      {sheetStatus && <div className="sheets-status" role="status" aria-live="polite">{sheetStatus.message}{sheetStatus.url && <a href={sheetStatus.url} target="_blank" rel="noopener noreferrer">Open the spreadsheet</a>}</div>}
      {showSettings && <SettingsPanel settings={settings} status={settingsStatus} health={healthConfig} onChange={(next) => {
        setSettings(next);
        // Settings set the starting choices; apply them to the next scan straight away.
        setScanOptions((current) => ({ ...defaultScanOptions(next), manualPages: current.manualPages }));
        if (!next.enabledNiches.includes(niche)) setNiche(next.enabledNiches[0]);
      }} onClose={() => setShowSettings(false)} />}

      <div className="app-body">
      <Sidebar
        openPanel={sidebarPanel}
        onOpenPanel={setSidebarPanel}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        options={scanOptions}
        onOptionsChange={setScanOptions}
        onHealthChange={refreshHealth}
        onResult={applyResult}
        onExport={() => exportOpportunitiesCsv(visible.length ? visible : items, statuses)}
        onExportSheets={handleSheetsExport}
        sheetsBusy={sheetBusy}
        exportDisabled={!items.length}
      />
      <main className="app-main">
        <h1 className="visually-hidden">Find and reply to YouTube leads</h1>
        <StepProgress states={stepStates} activeStep={expandedStep} onNavigate={(n) => { setExpandedStep(n); window.setTimeout(() => scrollToStep(n), 0); }} />

        <StepSection n={1} state={expandedStep === 1 ? 'current' : stepStates[0]} collapsed={stepStates[0] === 'done' && expandedStep !== 1}
          summary={`Looking for: ${nicheLabel(niche)}`}
          onChange={() => { setExpandedStep(1); scrollToStep(1); }}
          help="Pick the kind of person you want to help. We search YouTube videos where those people leave comments.">
          <NichePicker value={niche} enabled={settings.enabledNiches} onChange={(value) => { setNiche(value); setNicheChosen(true); }} />
          {!items.length && <div className="approval-hooks">
            <button type="button" className="workflow-button safe" onClick={() => { setNicheChosen(true); setExpandedStep(2); scrollToStep(2); }}>Next: run the scan</button>
          </div>}
        </StepSection>

        <StepSection n={2} state={expandedStep === 2 ? 'current' : stepStates[1]} collapsed={stepStates[1] === 'done' && expandedStep !== 2}
          summary={`Scan: ${summary?.headline || `${items.length} comments loaded`}`}
          onChange={() => { setExpandedStep(2); scrollToStep(2); }}
          help={`Pick a size and press the button. We read public comments on recent ${nichePhrase(niche)} videos; nothing is posted.`}>
          <ScanPanel niche={niche} settings={settings} options={scanOptions} onOptionsChange={setScanOptions}
            onOpenOptions={() => { setSidebarPanel('options'); setSidebarOpen(true); window.setTimeout(() => document.querySelector<HTMLElement>('#sidebar-panel-options select')?.focus(), 50); }}
            onResult={applyResult} onHealthChange={refreshHealth} hasResults={items.length > 0} />
        </StepSection>

        <StepSection n={3} state={expandedStep === 3 ? 'current' : stepStates[2]} collapsed={stepStates[2] === 'done' && expandedStep !== 3}
          summary={selected ? `Reviewing: ${selected.comment.authorDisplayName}` : `${items.length} comments to review`}
          onChange={() => { setExpandedStep(3); scrollToStep(3); }}
          help="Start with Best leads. Click a comment to see why it was picked and to write your reply."
          aside={items.length > 0 ? <AgeFilter value={age} onChange={setAge} /> : undefined}>
          {summary && !isDemo && <ScanResultCard summary={summary} onShow={(next) => { setTab(next); setSelectedId(undefined); sessionStorage.removeItem(SELECTED_LEAD_KEY); setExpandedStep(3); scrollToStep(3); }} />}
          {isDemo && <p className="demo-banner">You are looking at demo comments. Run a scan in Step 2 to see real ones.</p>}
          {items.length > 0 && <ReviewTabs tabs={tabs} active={tab} counts={counts} onChange={(next) => { setTab(next); setSelectedId(undefined); sessionStorage.removeItem(SELECTED_LEAD_KEY); setExpandedStep(3); }} />}
          {items.length > 0 && (
            <details className="more-options review-filters">
              <summary>More filters</summary>
              <div className="options-grid">
                <label><span>Review status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status)}>
                  <option value="all">Any status</option>
                  {(Object.keys(statusLabels) as LocalStatus[]).map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
                </select></label>
                <label><span>Lead strength</span><select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value as ScoreBand)}>
                  <option value="all">Any strength</option>
                  <option value="urgent">Very high</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                </select></label>
                <label><span>Kind of comment</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as OpportunityType)}>
                  {(Object.keys(typeLabels) as OpportunityType[]).filter((value) => value === 'all' || items.some((item) => item.score.opportunityType === value)).map((value) => <option key={value} value={value}>{typeLabels[value]}</option>)}
                </select></label>
              </div>
              {isDemo && <p className="workflow-note">These are example comments. Run or load a scan in Step 2 for real ones.</p>}
            </details>
          )}
          <p className="score-explainer">Score 0–100: higher means a more likely real prospect. “Lead strength” is separate from reputation risk.</p>
          <div className="review-list-wrap">
            <div className="opportunity-list" id="lead-list" role={items.length ? 'tabpanel' : undefined} aria-labelledby={items.length ? `tab-${tab}` : undefined}>
              {visible.length ? (
                <ul className="lead-list">
                  {visible.map((item) => (
                    <LeadCard key={item.id} item={item} status={statusOf(item)} selected={selectedId === item.id} onSelect={() => selectLead(item.id)} />
                  ))}
                </ul>
              ) : (
                <>
                  <EmptyList hasData={items.length > 0} tab={tab} ageFiltered={age !== 'all'} onShowAnyAge={() => setAge('all')} onGoToScan={() => scrollToStep(2)} />
                  {!items.length && <div className="approval-hooks"><button type="button" className="workflow-button" onClick={showDemo}>Or look around with demo comments</button></div>}
                </>
              )}
            </div>

          </div>
        </StepSection>
        <div ref={replyRef}>
          <StepSection n={4} state={expandedStep === 4 ? 'current' : stepStates[3]} badgeText={selected ? 'You are here' : 'Pick a lead first'} collapsed={stepStates[3] === 'done' && expandedStep !== 4}
            summary={selected ? `Reply to ${selected.comment.authorDisplayName}` : 'Pick a lead to reply to'}
            onChange={() => { setExpandedStep(4); scrollToStep(4); }}
            help="Pick a reply idea, copy it, post it on YouTube yourself, then mark it done.">
              {selected ? (
                <ReplyPanel
                  key={selected.id}
                  item={selected}
                  status={statusOf(selected)}
                  selectedDraftId={selectedDrafts[selected.id]}
                  aiDrafts={Boolean(healthConfig.aiDraftsConfigured)}
                  onSelectDraft={selectDraft}
                  onTransition={updateStatus}
                  onGenerateDrafts={generateDrafts}
                  autoWriting={draftFeedback?.id === selected.id && draftFeedback.writing}
                  draftError={draftFeedback?.id === selected.id ? draftFeedback.error : undefined}
                  initialScoreOpen={selected.id === firstLeadId}
                />
              ) : <p className="empty-state">Pick a comment in Step 3 to reply to it.</p>}
          </StepSection>
        </div>
      </main>
      </div>
    </div>
  );
}

function StandaloneModeGate({ children }: { children: React.ReactNode }) {
  const [isFramed, setIsFramed] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  useEffect(() => {
    setIsFramed(window.self !== window.top);
    setCurrentUrl(window.location.href);
  }, []);

  function leaveIframe() {
    try { window.open(currentUrl, '_blank', 'noopener,noreferrer'); } catch { /* fall through */ }
    try { window.top?.location.assign(currentUrl); } catch { window.location.assign(currentUrl); }
  }

  if (!isFramed) return <>{children}</>;
  return (
    <main className="standalone-only-shell">
      <section className="standalone-only-card">
        <span className="eyebrow">Open in its own tab</span>
        <h1>Open Best Leads System AI in a normal browser tab</h1>
        <p>YouTube links do not work inside an embedded preview, so this app only runs in its own tab.</p>
        <div className="standalone-actions big">
          <button className="source-button primary" type="button" onClick={leaveIframe}>Open in a new tab</button>
          <button className="source-button" type="button" onClick={() => navigator.clipboard.writeText(currentUrl)}>Copy link</button>
        </div>
        <code className="standalone-url">{currentUrl}</code>
      </section>
    </main>
  );
}

const root = createRoot(document.getElementById('root')!);
fetch('/api/session').then(async (response) => {
  if (!response.ok) {
    window.location.assign('/login');
    return;
  }
  const session = await response.json();
  setCsrfToken(session.csrfToken);
  const [settingsResponse, configResponse] = await Promise.all([apiJson('/api/settings'), apiJson('/api/config')]);
  root.render(<StandaloneModeGate><App initialSettings={settingsResponse.settings} initialHealth={configResponse} /></StandaloneModeGate>);
}).catch(() => root.render(<p>Unable to connect. Please reload to try again.</p>));
