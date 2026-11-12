import React, { useState } from 'react';
import { copyBundleText, dimensionLabels, isRealYouTubeUrl, leadStrengthLabel, makeDrafts, makeYouTubeCommentUrl, makeYouTubeVideoUrl, nextBestAction, replyStyleLabels, riskLabel, situationDetails, statusHelp, statusLabels, transitionOptions, whyThisMatters } from './helpers';
import type { LocalStatus, ScoreDimension, ScoredFixture } from './types';

function ScoreBreakdown({ dimensions }: { dimensions: ScoreDimension[] }) {
  return (
    <div className="score-grid">
      {dimensions.map((dimension) => (
        <div className={dimension.dimension === 'spamComplianceRisk' ? 'dimension risk-dimension' : 'dimension'} key={dimension.dimension}>
          <div>
            <strong>{dimensionLabels[dimension.dimension] ?? dimension.dimension}</strong>
            <span>{dimension.score}/100</span>
          </div>
          <meter min={0} max={100} value={dimension.score} aria-label={`${dimensionLabels[dimension.dimension] ?? dimension.dimension}: ${dimension.score} out of 100`} />
          <p>{dimension.reason}</p>
          {dimension.evidence.length > 0 && <small>From the comment: {dimension.evidence.join(' · ')}</small>}
        </div>
      ))}
    </div>
  );
}

export function ReplyPanel({ item, status, selectedDraftId, aiDrafts, onSelectDraft, onTransition, onGenerateDrafts }: {
  item: ScoredFixture;
  status: LocalStatus;
  selectedDraftId?: string;
  aiDrafts: boolean;
  onSelectDraft: (draftId: string) => void;
  onTransition: (to: LocalStatus) => void;
  onGenerateDrafts: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState('');
  const drafts = makeDrafts(item);
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0];
  const commentUrl = makeYouTubeCommentUrl(item);
  const videoUrl = makeYouTubeVideoUrl(item);
  const realLinks = isRealYouTubeUrl(commentUrl);
  const details = situationDetails(item);
  const riskEvidence = item.score.scoreDimensions.find((dimension) => dimension.dimension === 'spamComplianceRisk')?.evidence || [];

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`Copied ${label}.`);
    } catch {
      setNote('Your browser blocked copying. Select the text and copy it by hand.');
    }
  }

  function open(url: string) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) copy(url, 'the link (your browser blocked the new tab)');
  }

  async function generate() {
    setGenerating(true);
    setNote('Writing reply ideas…');
    try {
      await onGenerateDrafts();
      setNote('New reply ideas are ready. Read and edit before posting.');
    } catch (error) {
      setNote(`Could not write new ideas: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="reply-panel" aria-label={`Reply to ${item.comment.authorDisplayName}`}>
      <div className="detail-header">
        <div>
          <h3>{item.comment.authorDisplayName}</h3>
          <p className="workflow-note">{item.video.title}</p>
        </div>
        <span className="card-badges">
          <span className={`priority ${item.score.priority}`}>Lead strength: {leadStrengthLabel(item.score.priority)}</span>
          <span className={`risk ${item.score.riskLevel}`}>Reputation risk: {riskLabel(item.score.riskLevel)}</span>
        </span>
      </div>

      <blockquote>{item.comment.textOriginal}</blockquote>

      <div className="detail-section insight-box">
        <div className="section-heading-row">
          <h4>Why this comment</h4>
          <span>{nextBestAction(item)}</span>
        </div>
        <p>{whyThisMatters(item)}</p>
        {details.length > 0 && (
          <p className="situation-row">
            <span className="visually-hidden">Their situation: </span>
            {details.map((detail) => <span key={detail} className="situation-chip">{detail}</span>)}
          </p>
        )}
      </div>

      <div className="detail-section">
        <div className="section-heading-row">
          <h4>1. Pick a reply idea</h4>
          <button className="workflow-button safe" type="button" disabled={generating} onClick={generate}>{generating ? 'Writing…' : aiDrafts ? 'Write new ideas with AI' : 'Write new ideas'}</button>
        </div>
        {drafts.length ? (
          <>
            <div className="draft-tabs" aria-label="Reply ideas">
              {drafts.map((draft) => (
                <button aria-pressed={selectedDraft?.id === draft.id} className={selectedDraft?.id === draft.id ? 'draft-tab active' : 'draft-tab'} key={draft.id} onClick={() => onSelectDraft(draft.id)} type="button">
                  {replyStyleLabels[draft.style] ?? draft.style}
                </button>
              ))}
            </div>
            {selectedDraft && (
              <article className={item.score.riskLevel === 'high' ? 'draft selected-draft high-risk' : 'draft selected-draft'} aria-label="Selected reply idea">
                <p>{selectedDraft.body}</p>
                <small>{selectedDraft.complianceNotes.join(' · ')}</small>
              </article>
            )}
          </>
        ) : <p className="empty-state">No reply suggested: this one is better skipped.</p>}
      </div>

      <div className="detail-section">
        <h4>2. Copy it and open the comment</h4>
        <p className="workflow-note">This app never posts for you. Copy the reply, open the comment on YouTube, paste it and post it yourself.</p>
        <div className="action-grid">
          <button className="source-button primary" type="button" onClick={() => selectedDraft && copy(selectedDraft.body, 'the reply')} disabled={!selectedDraft}>Copy reply</button>
          <button className="source-button primary" type="button" disabled={!realLinks} onClick={() => open(commentUrl)}>Open comment on YouTube</button>
          <button className="source-button" type="button" disabled={!realLinks} onClick={() => open(videoUrl)}>Open video</button>
          <button className="source-button" type="button" disabled={!realLinks} onClick={() => copy(commentUrl, 'the comment link')}>Copy comment link</button>
          <button className="source-button" type="button" onClick={() => copy(copyBundleText(item, selectedDraft?.body), 'the full summary')}>Copy full summary</button>
        </div>
        <p className="status-line" role="status" aria-live="polite">{note}</p>
      </div>

      <div className="detail-section workflow-panel">
        <div className="section-heading-row">
          <h4>3. Mark it done</h4>
          <span className={`status-badge ${status}`}>{statusLabels[status]}</span>
        </div>
        <p className="workflow-note">{statusHelp[status]}</p>
        <div className="approval-hooks">
          {transitionOptions(status, item.score.riskLevel).map((option) => (
            <button className={option.tone ? `workflow-button ${option.tone}` : 'workflow-button'} key={option.to} onClick={() => onTransition(option.to)} title={option.note} type="button">{option.label}</button>
          ))}
        </div>
      </div>

      <details className="more-options">
        <summary>How this comment was scored</summary>
        <p>{item.score.summary}</p>
        {item.score.evidenceSnippets.length > 0 && (
          <div className="evidence-list">{item.score.evidenceSnippets.map((snippet) => <span key={snippet}>“{snippet}”</span>)}</div>
        )}
        <p className="workflow-note">Reputation risk: {riskLabel(item.score.riskLevel)}. {riskEvidence.length ? `Watch for: ${riskEvidence.join(', ')}.` : 'No spam or promise-of-income wording found.'}</p>
        <ScoreBreakdown dimensions={item.score.scoreDimensions} />
      </details>
    </div>
  );
}
