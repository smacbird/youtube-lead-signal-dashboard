import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import sampleData from '../data/sample-comments.json';
import { scoreSampleItems } from './scoring/scoring.js';
import { apiJson, setCsrfToken } from './ui/api';
import { buildScanSummary, exportOpportunitiesCsv, isWithinAge, matchesTab, nicheLabel, normaliseImportedOpportunity, statusLabels, typeLabels } from './ui/helpers';
import { AppHeader, StepProgress, StepSection, type StepState } from './ui/layout';
import { NichePicker } from './ui/nicheStep';
import { ReplyPanel } from './ui/replyStep';
import { AgeFilter, EmptyList, LeadCard, ReviewTabs } from './ui/reviewStep';
import { ScanPanel, ScanResultCard, type ScanResult } from './ui/scanStep';
import { SettingsPanel } from './ui/settings';
import type { AppSettings, FixtureItem, FreshnessWindow, HealthConfig, LocalStatus, NicheProfile, OpportunityType, ReviewTab, ScanSummary, ScoreBand, ScoredFixture, Status } from './ui/types';
import './styles.css';

const ALL_NICHES: NicheProfile[] = ['affiliate_marketing', 'money_making', 'work_from_home', 'side_hustles', 'biz_opp', 'ai_tools', 'traffic_leads', 'organic_traffic'];
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

function App() {
  const [items, setItems] = useState<ScoredFixture[]>([]);
  const [summary, setSummary] = useState<ScanSummary | undefined>();
  const [isDemo, setIsDemo] = useState(false);
  const [niche, setNiche] = useState<NicheProfile>('work_from_home');
  const [nicheChosen, setNicheChosen] = useState(false);
  const [tab, setTab] = useState<ReviewTab>('best');
  const [age, setAge] = useState<FreshnessWindow>('all');
  const [statusFilter, setStatusFilter] = useState<Status>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreBand>('all');
  const [typeFilter, setTypeFilter] = useState<OpportunityType>('all');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [statuses, setStatuses] = useState<Record<string, LocalStatus>>({});
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, string>>({});
  const [healthConfig, setHealthConfig] = useState<HealthConfig>({});
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ defaultScanDepth: 5, defaultFreshnessDays: 30, replyTone: 'Helpful, concise, practical', enabledNiches: ALL_NICHES });
  const replyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiJson('/api/config').then(setHealthConfig).catch((error) => console.warn('Configuration check failed safely', error));
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
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  const nicheLeadCount = items.filter((item) => item.score.opportunityType === 'niche_lead').length;

  useEffect(() => { if (!tabs.includes(tab)) setTab('best'); }, [tabs, tab]);

  const stepStates: StepState[] = [
    nicheChosen || items.length ? 'done' : 'current',
    items.length ? 'done' : nicheChosen ? 'current' : 'upcoming',
    !items.length ? 'upcoming' : selectedId ? 'done' : 'current',
    items.length && selectedId ? 'current' : 'upcoming',
  ];

  function applyResult({ items: next, summary: nextSummary }: ScanResult) {
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
    window.setTimeout(() => scrollToStep(3), 50);
  }

  function resetForNewScan() {
    setItems([]);
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
    const demo = buildDemoItems();
    setItems(demo);
    setIsDemo(true);
    setSummary(buildScanSummary('saved', demo, {}));
    setStatuses((current) => ({ ...current, ...Object.fromEntries(demo.map((item) => [item.id, item.opportunity.status])) }));
    setTab('best');
  }

  function selectLead(id: string) {
    setSelectedId(id);
    window.setTimeout(() => replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  async function updateStatus(to: LocalStatus) {
    if (!selected) return;
    const target = selected;
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

  async function generateDrafts() {
    if (!selected) return;
    if (isDemo) throw new Error('Demo comments cannot get new ideas. Run a real scan first.');
    const body = await apiJson(`/api/opportunities/${encodeURIComponent(selected.id)}/ai-drafts`, { method: 'POST', body: JSON.stringify({}) });
    const updated = normaliseImportedOpportunity(body.item);
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedDrafts((current) => ({ ...current, [updated.id]: updated.opportunity.replyDrafts[0]?.id || current[updated.id] }));
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
        onExport={() => exportOpportunitiesCsv(visible.length ? visible : items, statuses)}
        exportDisabled={!items.length}
        onSignOut={signOut}
      />
      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}

      <main>
        <h1 className="visually-hidden">Find and reply to YouTube leads</h1>
        <StepProgress states={stepStates} />

        <StepSection n={1} state={stepStates[0]} help="Pick the kind of person you want to help. We search YouTube videos where those people leave comments.">
          <NichePicker value={niche} enabled={settings.enabledNiches} onChange={(value) => { setNiche(value); setNicheChosen(true); }} />
          <div className="approval-hooks">
            <button type="button" className="workflow-button safe" onClick={() => { setNicheChosen(true); scrollToStep(2); }}>Next: run the scan</button>
          </div>
        </StepSection>

        <StepSection n={2} state={stepStates[1]} help={`Pick a size and press the button. We read public comments on recent ${nicheLabel(niche)} videos; nothing is posted.`}>
          <ScanPanel niche={niche} settings={settings} onResult={applyResult} onReset={resetForNewScan} hasResults={items.length > 0} />
          {summary && !isDemo && <ScanResultCard summary={summary} onShow={(next) => { setTab(next); scrollToStep(3); }} />}
        </StepSection>

        <StepSection
          n={3}
          state={stepStates[2]}
          help="Start with Best leads. Click a comment to see why it was picked and to write your reply."
          aside={items.length > 0 ? <AgeFilter value={age} onChange={setAge} /> : undefined}
        >
          {isDemo && <p className="demo-banner">You are looking at demo comments. Run a scan in Step 2 to see real ones.</p>}
          {items.length > 0 && <ReviewTabs tabs={tabs} active={tab} counts={counts} onChange={(next) => { setTab(next); setSelectedId(undefined); }} />}
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
          <div className="workspace-grid">
            <div className="opportunity-list" id="lead-list" role={items.length ? 'tabpanel' : undefined} aria-labelledby={items.length ? `tab-${tab}` : undefined}>
              {visible.length ? (
                <ul className="lead-list">
                  {visible.map((item) => (
                    <LeadCard key={item.id} item={item} status={statusOf(item)} selected={selected?.id === item.id} onSelect={() => selectLead(item.id)} />
                  ))}
                </ul>
              ) : (
                <>
                  <EmptyList hasData={items.length > 0} tab={tab} ageFiltered={age !== 'all'} onShowAnyAge={() => setAge('all')} onGoToScan={() => scrollToStep(2)} />
                  {!items.length && <div className="approval-hooks"><button type="button" className="workflow-button" onClick={showDemo}>Or look around with demo comments</button></div>}
                </>
              )}
            </div>

            <div ref={replyRef} id="step-4" className={`step-section reply-step ${stepStates[3]}`} aria-labelledby="step-4-title">
              <div className="step-heading">
                <div>
                  <span className="step-badge">Step 4 of 4 · {stepStates[3] === 'current' ? 'You are here' : 'Next'}</span>
                  <h2 id="step-4-title" tabIndex={-1}>Reply</h2>
                  <p className="step-help">Pick a reply idea, copy it, post it on YouTube yourself, then mark it done.</p>
                </div>
              </div>
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
                />
              ) : <p className="empty-state">Pick a comment in Step 3 to reply to it.</p>}
            </div>
          </div>
        </StepSection>
      </main>
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
        <h1>Open The Best Lead System in a normal browser tab</h1>
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
  root.render(<StandaloneModeGate><App /></StandaloneModeGate>);
}).catch(() => root.render(<p>Unable to connect. Please reload to try again.</p>));
