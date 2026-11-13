import React from 'react';
import { ageLabel, getOlspReview, isNoise, leadStrengthLabel, riskLabel, situationDetails, statusLabels, tabInfo, typeLabels } from './helpers';
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
            className={`review-tab${active === tab ? ' active' : ''}${counts[tab] === 0 ? ' empty' : ''}`}
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
      <small id="age-help">Under 14 days: reply soon. Up to 30 days: review for ideas. Older comments stay visible with “Any age.”</small>
    </label>
  );
}

export function LeadCard({ item, status, selected, onSelect }: { item: ScoredFixture; status: LocalStatus; selected: boolean; onSelect: () => void }) {
  const olsp = getOlspReview(item);
  const noise = isNoise(item) || item.score.opportunityType === 'low_fit_comment';
  const details = situationDetails(item);
  const days = new Date(item.comment.publishedAt).getTime();
  const ageInDays = Number.isFinite(days) ? Math.max(0, Math.floor((Date.now() - days) / 86400000)) : null;
  const ageHint = ageInDays === null ? '' : ageInDays < 14 ? 'Reply soon' : ageInDays <= 30 ? 'Check if still active' : 'Old: use for ideas';
  const shortReason = item.score.summary.length > 110 ? `${item.score.summary.slice(0, 107).trimEnd()}…` : item.score.summary;
  return (
    <li className="lead-list-item">
      <button className={selected ? 'opportunity-card selected' : 'opportunity-card'} onClick={onSelect} type="button" aria-pressed={selected}>
        <span className="card-topline">
          <span className={`score-ring ${item.score.priority}`} aria-label={`Score ${item.score.overallScore} out of 100`}>{item.score.overallScore}</span>
          <span className="card-who">
            <strong>Comment by {item.comment.authorDisplayName}</strong>
            <span>On: {item.video.title}</span>
            <span>{ageLabel(item)}{ageHint ? ` · ${ageHint}` : ''}</span>
          </span>
          <span className="card-badges">
            {!noise && <span className={`priority ${item.score.priority}`}>Lead strength: {leadStrengthLabel(item.score.priority)}</span>}
            <span className={`risk ${item.score.riskLevel}`}>Reputation risk: {riskLabel(item.score.riskLevel)}</span>
          </span>
        </span>
        {olsp && <span className="olsp-review-warning" role="note"><strong>OLSP: review</strong><span>{olsp.reason}</span></span>}
        <span className={noise ? 'card-reason low-fit-reason' : 'card-reason'}>{noise ? `Not a fit: ${shortReason}` : shortReason}</span>
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
          <span className="card-action">{selected ? '✓ Selected' : 'Click to reply'}</span>
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
