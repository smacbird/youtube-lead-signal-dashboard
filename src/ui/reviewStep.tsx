import React from 'react';
import { ageLabel, isNoise, leadStrengthLabel, riskLabel, situationDetails, statusLabels, tabInfo, typeLabels } from './helpers';
import type { FreshnessWindow, LocalStatus, ReviewTab, ScoredFixture } from './types';

export function ReviewTabs({ tabs, active, counts, onChange }: { tabs: ReviewTab[]; active: ReviewTab; counts: Record<ReviewTab, number>; onChange: (tab: ReviewTab) => void }) {
  // Arrow keys move between tabs (standard tablist keyboard pattern).
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = tabs.indexOf(active);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next]);
    window.setTimeout(() => document.getElementById(`tab-${tabs[next]}`)?.focus(), 0);
  }
  return (
    <div className="review-tabs-wrap">
      <div className="review-tabs" role="tablist" aria-label="Which comments to show" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab}
            id={`tab-${tab}`}
            role="tab"
            type="button"
            aria-selected={active === tab}
            tabIndex={active === tab ? 0 : -1}
            aria-controls="lead-list"
            className={active === tab ? 'review-tab active' : 'review-tab'}
            onClick={() => onChange(tab)}
          >
            {tabInfo[tab].label} <span className="tab-count">{counts[tab]}</span>
          </button>
        ))}
      </div>
      <p className="tab-help">{tabInfo[active].help}</p>
    </div>
  );
}

export function AgeFilter({ value, onChange }: { value: FreshnessWindow; onChange: (value: FreshnessWindow) => void }) {
  return (
    <label className="age-filter">
      <span>Comment age</span>
      <select value={value} onChange={(event) => onChange(event.target.value as FreshnessWindow)} aria-describedby="age-help">
        <option value="all">Any age</option>
        <option value="14">Last 14 days</option>
        <option value="30">Last 30 days</option>
      </select>
      <small id="age-help">Comments under 14 days old are the best to reply to: the person is still likely to see it. Older ones are fine for content ideas.</small>
    </label>
  );
}

export function LeadCard({ item, status, selected, onSelect }: { item: ScoredFixture; status: LocalStatus; selected: boolean; onSelect: () => void }) {
  const noise = isNoise(item) || item.score.opportunityType === 'low_fit_comment';
  const details = situationDetails(item);
  return (
    <li className="lead-list-item">
      <button className={selected ? 'opportunity-card selected' : 'opportunity-card'} onClick={onSelect} type="button" aria-pressed={selected}>
        <span className="card-topline">
          <span className={`score-ring ${item.score.priority}`} aria-label={`Score ${item.score.overallScore} out of 100`}>{item.score.overallScore}</span>
          <span className="card-who">
            <strong>{item.comment.authorDisplayName}</strong>
            <span>{item.video.channelName} · {ageLabel(item)}</span>
          </span>
          <span className="card-badges">
            {!noise && <span className={`priority ${item.score.priority}`}>Lead strength: {leadStrengthLabel(item.score.priority)}</span>}
            <span className={`risk ${item.score.riskLevel}`}>Reputation risk: {riskLabel(item.score.riskLevel)}</span>
          </span>
        </span>
        <span className={noise ? 'card-reason low-fit-reason' : 'card-reason'}>{noise ? `Not a fit: ${item.score.summary}` : item.score.summary}</span>
        {details.length > 0 && (
          <span className="situation-row">
            <span className="visually-hidden">Their situation: </span>
            {details.map((detail) => <span key={detail} className="situation-chip">{detail}</span>)}
          </span>
        )}
        <span className="card-quote">{item.comment.textOriginal}</span>
        <span className="card-tags">
          <span className={`status-badge ${status}`}>{statusLabels[status]}</span>
          <span>{typeLabels[item.score.opportunityType]}</span>
        </span>
      </button>
    </li>
  );
}

export function EmptyList({ hasData, tab, onGoToScan, onShowAnyAge, ageFiltered }: { hasData: boolean; tab: ReviewTab; onGoToScan: () => void; onShowAnyAge: () => void; ageFiltered: boolean }) {
  if (!hasData) {
    return (
      <div className="smart-empty-state">
        <h3>No comments yet</h3>
        <p>Run a scan in Step 2, or open a saved scan there.</p>
        <div className="approval-hooks"><button type="button" className="workflow-button safe" onClick={onGoToScan}>Go to Step 2</button></div>
      </div>
    );
  }
  return (
    <div className="smart-empty-state">
      <h3>Nothing in {tabInfo[tab].label}</h3>
      <p>{tab === 'best' ? 'This scan did not find strong prospects. Check Maybe, or try a different niche or a bigger scan.' : 'Try another tab.'}</p>
      {ageFiltered && <div className="approval-hooks"><button type="button" className="workflow-button" onClick={onShowAnyAge}>Show comments of any age</button></div>}
    </div>
  );
}
