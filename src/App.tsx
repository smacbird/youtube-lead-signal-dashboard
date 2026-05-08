import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import sampleData from '../data/sample-comments.json';
import { scoreSampleItems } from './scoring/scoring.js';
import './styles.css';

type LocalStatus = 'new' | 'reviewed' | 'approved' | 'rejected' | 'replied';
type Status = 'all' | LocalStatus;
type ScoreBand = 'all' | 'urgent' | 'high' | 'medium' | 'low';
type DraftStyle = 'helpful_consultative' | 'concise_resource' | 'content_follow_up' | 'risk_aware_decline';
type OpportunityType = 'all' | 'affiliate_publisher_opportunity' | 'consumer_buyer_question' | 'low_fit_comment';
type WorkTab = 'hot' | 'buyer' | 'publisher' | 'content' | 'low_fit' | 'stale' | 'done';
type NicheProfile = 'affiliate_marketing' | 'money_making' | 'work_from_home' | 'custom';
type FreshnessWindow = '7' | '14' | '30' | 'all';

type ScoreDimension = {
  dimension: string;
  score: number;
  reason: string;
  evidence: string[];
};

type ReplyDraft = {
  id: string;
  style: DraftStyle | string;
  body: string;
  complianceNotes: string[];
};

type FixtureItem = {
  id: string;
  video: {
    id: string;
    youtubeVideoId?: string;
    title: string;
    channelName: string;
    publishedAt: string;
    topic: string;
    offerFit: string[];
    url?: string;
  };
  comment: {
    id: string;
    youtubeCommentId?: string;
    authorDisplayName: string;
    textOriginal: string;
    publishedAt: string;
    likeCount: number;
    replyCount: number;
    signals: string[];
    language: string;
  };
  opportunity: {
    id: string;
    status: LocalStatus;
    replyDrafts: ReplyDraft[];
  };
};

type ScoredFixture = FixtureItem & {
  score: {
    overallScore: number;
    priority: Exclude<ScoreBand, 'all'>;
    riskLevel: 'low' | 'medium' | 'high';
    summary: string;
    opportunityType: Exclude<OpportunityType, 'all'>;
    opportunityTypeLabel: string;
    recommendedAction: string;
    detectedOfferFit: string[];
    evidenceSnippets: string[];
    scoreDimensions: ScoreDimension[];
  };
};

const statusLabels: Record<Status, string> = {
  all: 'All statuses',
  new: 'New',
  reviewed: 'Reviewed',
  approved: 'Approved',
  rejected: 'Rejected',
  replied: 'Replied (manual/mock)',
};

const statusHelp: Record<LocalStatus, string> = {
  new: 'Not yet reviewed. Mark as reviewed, approve, or reject locally.',
  reviewed: 'Seen by Steve. Approve a draft or reject it before any manual action.',
  approved: 'Approved locally. This still does not post: Steve can mark replied only after manual/mock handling.',
  rejected: 'Do not act on this opportunity unless it is re-reviewed later.',
  replied: 'Manual/mock state only. No YouTube API call or external message was sent.',
};

const opportunityTypeLabels: Record<OpportunityType, string> = {
  all: 'All opportunity types',
  affiliate_publisher_opportunity: 'Affiliate publisher',
  consumer_buyer_question: 'Consumer buyer question',
  low_fit_comment: 'Low fit',
};

const workTabLabels: Record<WorkTab, string> = {
  hot: 'Hot leads',
  buyer: 'Buyer questions',
  publisher: 'Publisher problems',
  content: 'Content ideas',
  low_fit: 'Low fit',
  stale: 'Stale',
  done: 'Done',
};

const nicheProfileLabels: Record<NicheProfile, string> = {
  affiliate_marketing: 'Affiliate marketing',
  money_making: 'Money-making opportunities',
  work_from_home: 'Work at home',
  custom: 'Custom / later',
};

const dimensionLabels: Record<string, string> = {
  affiliatePublisherSignal: 'Affiliate publisher signal',
  publisherRevenuePain: 'Publisher revenue pain',
  publisherActionIntent: 'Publisher action intent',
  consumerRecommendationIntent: 'Consumer recommendation intent',
  consumerComparisonIntent: 'Consumer comparison intent',
  consumerBudgetConstraint: 'Consumer budget constraint',
  consumerProductCategory: 'Consumer product category',
  urgency: 'Urgency',
  contentOpportunity: 'Content/tool value',
  replyability: 'Replyability',
  spamComplianceRisk: 'Risk',
};

const replyStyleLabels: Record<string, string> = {
  helpful_consultative: 'Helpful consultative',
  concise_resource: 'Concise resource pointer',
  content_follow_up: 'Content-idea follow-up',
  risk_aware_decline: 'Risk-aware wording',
  ai_short_helpful: 'AI short helpful',
  ai_consultative: 'AI consultative',
  ai_content_angle: 'AI content angle',
};

function formatOffer(offer: string) {
  return offer.replaceAll('_', ' ');
}

function formatTopic(topic: string) {
  return topic.replaceAll('_', ' ');
}

function getScoreBand(score: number): ScoreBand {
  if (score >= 82) return 'urgent';
  if (score >= 68) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function safeTopic(item: ScoredFixture) {
  return formatTopic(item.video.topic);
}

function selectedOffer(item: ScoredFixture) {
  return item.score.detectedOfferFit[0] ? formatOffer(item.score.detectedOfferFit[0]) : safeTopic(item);
}

function commentAgeDays(item: ScoredFixture) {
  const published = new Date(item.comment.publishedAt).getTime();
  if (!Number.isFinite(published)) return null;
  return Math.max(0, Math.floor((Date.now() - published) / 86400000));
}

function ageLabel(item: ScoredFixture) {
  const days = commentAgeDays(item);
  if (days === null) return 'age unknown';
  if (days === 0) return 'today';
  if (days === 1) return '1 day old';
  if (days < 30) return `${days} days old`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month old' : `${months} months old`;
}

function isFreshForWindow(item: ScoredFixture, windowDays: FreshnessWindow) {
  if (windowDays === 'all') return true;
  const days = commentAgeDays(item);
  if (days === null) return false;
  return days <= Number(windowDays);
}

function whyThisMatters(item: ScoredFixture) {
  if (item.score.opportunityType === 'affiliate_publisher_opportunity') {
    return 'This looks like a publisher/creator monetization problem: the commenter is asking about affiliate links, websites, commissions, tracking, or how to turn traffic into revenue.';
  }
  if (item.score.opportunityType === 'consumer_buyer_question') {
    return 'This looks like buyer intent: the commenter is trying to choose a product, compare options, or decide what is worth buying.';
  }
  return 'This comment is probably lower fit for manual outreach, but it may still be useful as a content or audience research signal.';
}

function nextBestAction(item: ScoredFixture) {
  const days = commentAgeDays(item);
  if (days !== null && days > 14) return 'Save for research; avoid replying unless still active';
  if (item.score.riskLevel === 'high' || item.score.recommendedAction === 'reject_as_spam') return 'Ignore or use caution';
  if (item.score.overallScore >= 68 && item.score.opportunityType !== 'low_fit_comment') return 'Review and draft reply';
  if (item.score.opportunityType === 'consumer_buyer_question') return 'Save as buyer/content idea';
  if (item.score.opportunityType === 'affiliate_publisher_opportunity') return 'Review publisher problem';
  return 'Ignore for now';
}

function copyBundleText(item: ScoredFixture, draftText?: string) {
  return [
    `Opportunity: ${item.score.opportunityTypeLabel}`,
    `Score: ${item.score.overallScore} (${item.score.priority})`,
    `Next action: ${nextBestAction(item)}`,
    `Why this matters: ${whyThisMatters(item)}`,
    `Video: ${item.video.title}`,
    `Commenter: ${item.comment.authorDisplayName}`,
    `Comment: ${item.comment.textOriginal}`,
    `Comment URL: ${makeYouTubeCommentUrl(item)}`,
    draftText ? `Draft reply: ${draftText}` : '',
  ].filter(Boolean).join('\n\n');
}

function draftForStyle(item: ScoredFixture, style: DraftStyle): ReplyDraft {
  const topic = safeTopic(item);
  const offer = selectedOffer(item);

  if (style === 'helpful_consultative') {
    return {
      id: `${item.opportunity.id}_generated_consultative`,
      style,
      body: `A safe reply would acknowledge ${item.comment.authorDisplayName}'s question, suggest one practical next diagnostic step for ${topic}, and invite them to compare it with their own situation without asking for private details in public.`,
      complianceNotes: ['Steve approval required', 'No guaranteed outcome', 'No request for private data'],
    };
  }

  if (style === 'concise_resource') {
    return {
      id: `${item.opportunity.id}_generated_concise`,
      style,
      body: `Short version: point them to a checklist or simple framework for ${offer}, then remind them to judge it against their own numbers before changing anything.`,
      complianceNotes: ['Resource pointer only', 'No sales pressure', 'No external posting in MVP'],
    };
  }

  if (style === 'content_follow_up') {
    return {
      id: `${item.opportunity.id}_generated_content_follow_up`,
      style,
      body: `This could also become a useful follow-up piece: turn the question into a short walkthrough on ${topic}, using the public problem pattern rather than the commenter’s private details.`,
      complianceNotes: ['Content idea, not a direct pitch', 'Anonymise any viewer context', 'Steve approval required'],
    };
  }

  return {
    id: `${item.opportunity.id}_generated_risk_aware`,
    style,
    body: `This needs conservative wording. Acknowledge the concern, avoid guarantees or regulated advice, and keep the reply educational rather than promotional.`,
    complianceNotes: ['High caution', 'No guarantees', 'Do not ask for sensitive details publicly'],
  };
}

function makeDrafts(item: ScoredFixture) {
  const baseDrafts = item.opportunity.replyDrafts ?? [];
  const stylesNeeded: DraftStyle[] = ['helpful_consultative', 'concise_resource', 'content_follow_up'];
  const drafts = [...baseDrafts];

  for (const style of stylesNeeded) {
    if (!drafts.some((draft) => draft.style === style) && item.score.recommendedAction !== 'reject_as_spam') {
      drafts.push(draftForStyle(item, style));
    }
  }

  if ((item.score.riskLevel !== 'low' || item.score.recommendedAction === 'reject_as_spam') && !drafts.some((draft) => draft.style === 'risk_aware_decline')) {
    drafts.push(draftForStyle(item, 'risk_aware_decline'));
  }

  return drafts;
}

function transitionOptions(status: LocalStatus, riskLevel: ScoredFixture['score']['riskLevel']) {
  const options: Array<{ to: LocalStatus; label: string; note: string; tone?: 'safe' | 'danger' | 'mock' }> = [];

  if (status === 'new') {
    options.push({ to: 'reviewed', label: 'Mark reviewed', note: 'Moves this from New to Reviewed.' });
    options.push({ to: 'approved', label: riskLevel === 'high' ? 'Approve with caution' : 'Approve draft', note: 'Local approval only. Nothing is posted.', tone: 'safe' });
    options.push({ to: 'rejected', label: 'Reject', note: 'Keep this out of the action queue.', tone: 'danger' });
  }

  if (status === 'reviewed') {
    options.push({ to: 'approved', label: riskLevel === 'high' ? 'Approve with caution' : 'Approve draft', note: 'Local approval only. Nothing is posted.', tone: 'safe' });
    options.push({ to: 'rejected', label: 'Reject', note: 'Keep this out of the action queue.', tone: 'danger' });
  }

  if (status === 'approved') {
    options.push({ to: 'replied', label: 'Mark replied manually', note: 'Mock/manual state only. No API call runs.', tone: 'mock' });
    options.push({ to: 'rejected', label: 'Reject instead', note: 'Cancel the approved local action.', tone: 'danger' });
  }

  if (status === 'replied') {
    options.push({ to: 'reviewed', label: 'Reopen as reviewed', note: 'Correct the manual/mock state.' });
  }

  if (status === 'rejected') {
    options.push({ to: 'reviewed', label: 'Reopen for review', note: 'Local correction only.' });
  }

  return options;
}

function buildItems(): ScoredFixture[] {
  const items = (sampleData.items as FixtureItem[]);
  const scores = scoreSampleItems(items);

  return items.map((item, index) => ({
    ...item,
    score: scores[index],
  })).sort((a, b) => b.score.overallScore - a.score.overallScore);
}


function makeYouTubeVideoUrl(item: ScoredFixture) {
  const videoId = item.video.youtubeVideoId;
  if (videoId && !videoId.includes('FIX')) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }
  return item.video.url ?? '#';
}

function makeYouTubeCommentUrl(item: ScoredFixture) {
  const videoId = item.video.youtubeVideoId;
  const commentId = item.comment.youtubeCommentId;
  if (videoId && commentId && !videoId.includes('FIX') && !commentId.includes('FIX')) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(commentId)}`;
  }
  return makeYouTubeVideoUrl(item);
}

function isRealYouTubeUrl(url: string) {
  return url.startsWith('https://www.youtube.com/') || url.startsWith('https://youtube.com/');
}

function SourceActions({ item, draftText, onMarkReplied }: { item: ScoredFixture; draftText?: string; onMarkReplied: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const videoUrl = makeYouTubeVideoUrl(item);
  const commentUrl = makeYouTubeCommentUrl(item);
  const realLinks = isRealYouTubeUrl(commentUrl);

  async function copyDraft() {
    if (!draftText) return;
    await navigator.clipboard.writeText(draftText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function copyBundle() {
    await navigator.clipboard.writeText(copyBundleText(item, draftText));
    setCopiedUrl('review bundle');
    window.setTimeout(() => setCopiedUrl(null), 1800);
  }

  async function copyUrl(label: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(label);
    window.setTimeout(() => setCopiedUrl(null), 1800);
  }

  function openOutsidePreview(url: string) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) copyUrl('URL', url);
  }

  return (
    <section className="detail-section source-actions" aria-label="Manual posting actions">
      <div className="section-heading-row">
        <h3>Manual reply actions</h3>
        <span>{realLinks ? 'Live links when real data is imported' : 'Fixture links in MVP'}</span>
      </div>
      <p>
        YouTube blocks embedded previews. Use the copy buttons, or open this dashboard in standalone mode and then open YouTube in a normal browser tab.
      </p>
      <div className="action-grid">
        <button className={realLinks ? 'source-button' : 'source-button disabled'} type="button" disabled={!realLinks} onClick={() => openOutsidePreview(videoUrl)}>
          Open video outside preview
        </button>
        <button className={realLinks ? 'source-button primary' : 'source-button disabled'} type="button" disabled={!realLinks} onClick={() => openOutsidePreview(commentUrl)}>
          Open exact comment outside preview
        </button>
        <button className="source-button" type="button" disabled={!realLinks} onClick={() => copyUrl('Video URL', videoUrl)}>
          Copy video URL
        </button>
        <button className="source-button" type="button" disabled={!realLinks} onClick={() => copyUrl('Comment URL', commentUrl)}>
          Copy comment URL
        </button>
        <button className="source-button" type="button" onClick={copyDraft} disabled={!draftText}>
          {copied ? 'Copied draft' : 'Copy draft reply'}
        </button>
        <button className="source-button" type="button" onClick={copyBundle}>
          Copy review bundle
        </button>
        <button className="source-button mock" type="button" onClick={onMarkReplied}>
          Mark replied manually
        </button>
      </div>
      <dl className="source-meta">
        <div><dt>Video ID</dt><dd>{item.video.youtubeVideoId ?? 'not available'}</dd></div>
        <div><dt>Comment ID</dt><dd>{item.comment.youtubeCommentId ?? 'not available'}</dd></div>
        <div><dt>Video URL</dt><dd>{videoUrl}</dd></div>
        <div><dt>Comment URL</dt><dd>{commentUrl}</dd></div>
      </dl>
      {copiedUrl && <small className="workflow-note">Copied {copiedUrl}. Paste it into a normal browser tab if YouTube blocks the preview iframe.</small>}
      {!realLinks && <small className="workflow-note">The sample dataset uses fake YouTube IDs, so outbound links are intentionally disabled until real imports exist.</small>}
    </section>
  );
}

function StatCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function FilterButton<T extends string>({ active, value, label, onClick }: { active: boolean; value: T; label: string; onClick: (value: T) => void }) {
  return (
    <button className={active ? 'chip active' : 'chip'} onClick={() => onClick(value)} type="button">
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: LocalStatus }) {
  return <span className={`status-badge ${status}`}>{statusLabels[status]}</span>;
}

function OpportunityCard({ item, localStatus, selected, onSelect }: { item: ScoredFixture; localStatus: LocalStatus; selected: boolean; onSelect: () => void }) {
  const topDimensions = [...item.score.scoreDimensions]
    .filter((dimension) => dimension.dimension !== 'spamComplianceRisk')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <button className={selected ? 'opportunity-card selected' : 'opportunity-card'} onClick={onSelect} type="button">
      <div className="card-topline">
        <span className={`score-ring ${item.score.priority}`}>{item.score.overallScore}</span>
        <div>
          <strong>{item.comment.authorDisplayName}</strong>
          <span>{item.video.channelName} · {formatTopic(item.video.topic)}</span>
        </div>
        <span className={`risk ${item.score.riskLevel}`}>{item.score.riskLevel} risk</span>
      </div>
      <p>{item.score.summary}</p>
      <blockquote>{item.comment.textOriginal}</blockquote>
      <div className="mini-bars" aria-label="Top score dimensions">
        {topDimensions.map((dimension) => (
          <span key={dimension.dimension} title={`${dimensionLabels[dimension.dimension]} ${dimension.score}`}>
            <i style={{ width: `${dimension.score}%` }} />
          </span>
        ))}
      </div>
      <div className="card-tags">
        <StatusBadge status={localStatus} />
        <span>{ageLabel(item)}</span>
        <span>{opportunityTypeLabels[item.score.opportunityType]}</span>
        <span>{item.score.recommendedAction.replaceAll('_', ' ')}</span>
      </div>
    </button>
  );
}

function ScoreBreakdown({ dimensions }: { dimensions: ScoreDimension[] }) {
  return (
    <div className="score-grid">
      {dimensions.map((dimension) => (
        <div className={dimension.dimension === 'spamComplianceRisk' ? 'dimension risk-dimension' : 'dimension'} key={dimension.dimension}>
          <div>
            <strong>{dimensionLabels[dimension.dimension] ?? dimension.dimension}</strong>
            <span>{dimension.score}/100</span>
          </div>
          <meter min="0" max="100" value={dimension.score} aria-label={`${dimensionLabels[dimension.dimension]} score`} />
          <p>{dimension.reason}</p>
          {dimension.evidence.length > 0 && (
            <small>Evidence: {dimension.evidence.join(' · ')}</small>
          )}
        </div>
      ))}
    </div>
  );
}

function SafetyNotice({ item, localStatus }: { item: ScoredFixture; localStatus: LocalStatus }) {
  const highRisk = item.score.riskLevel === 'high';
  return (
    <section className={highRisk ? 'detail-section safety-notice high-risk' : 'detail-section safety-notice'} aria-label="Safety boundary">
      <h3>No-posting boundary</h3>
      <p>
        This MVP only updates local review state. Approving or marking replied does not call YouTube, send a message, open a URL, or post externally.
      </p>
      <ul>
        <li>Current local state: <strong>{statusLabels[localStatus]}</strong>.</li>
        <li>Replied means Steve manually handled it elsewhere or simulated the state.</li>
        <li>Use conservative wording: no guarantees, no private details, no deceptive claims.</li>
        {highRisk && <li><strong>High risk:</strong> reject or use risk-aware wording unless Steve has a clear reason to proceed.</li>}
      </ul>
    </section>
  );
}

function WorkflowPanel({ item, localStatus, onTransition }: { item: ScoredFixture; localStatus: LocalStatus; onTransition: (to: LocalStatus) => void }) {
  const options = transitionOptions(localStatus, item.score.riskLevel);

  return (
    <section className="detail-section workflow-panel" aria-label="Local approval workflow">
      <div className="section-heading-row">
        <h3>Local approval workflow</h3>
        <StatusBadge status={localStatus} />
      </div>
      <p>{statusHelp[localStatus]}</p>
      <div className="transition-map" aria-label="Allowed state transitions">
        {(['new', 'reviewed', 'approved', 'rejected', 'replied'] as LocalStatus[]).map((step, index) => (
          <React.Fragment key={step}>
            <span className={step === localStatus ? `flow-step active ${step}` : `flow-step ${step}`}>{statusLabels[step]}</span>
            {index < 4 && <span className="flow-arrow" aria-hidden="true">→</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="approval-hooks">
        {options.map((option) => (
          <button className={option.tone ? `workflow-button ${option.tone}` : 'workflow-button'} key={option.to} onClick={() => onTransition(option.to)} title={option.note} type="button">
            {option.label}
          </button>
        ))}
      </div>
      <small className="workflow-note">All transitions are in-memory for this demo. Refreshing resets back to the sample fixture statuses.</small>
    </section>
  );
}

function DetailPanel({
  item,
  localStatus,
  selectedDraftId,
  onSelectDraft,
  onTransition,
  onGenerateDrafts,
}: {
  item: ScoredFixture;
  localStatus: LocalStatus;
  selectedDraftId?: string;
  onSelectDraft: (draftId: string) => void;
  onTransition: (to: LocalStatus) => void;
  onGenerateDrafts: () => Promise<void>;
}) {
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const drafts = makeDrafts(item);
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0];

  return (
    <aside className="detail-panel" aria-label="Opportunity detail">
      <div className="detail-header">
        <div>
          <span className="eyebrow">Selected lead</span>
          <h2>{item.comment.authorDisplayName}</h2>
        </div>
        <span className={`priority ${item.score.priority}`}>{item.score.priority}</span>
      </div>

      <SafetyNotice item={item} localStatus={localStatus} />
      <WorkflowPanel item={item} localStatus={localStatus} onTransition={onTransition} />

      <section className="detail-section source-context">
        <h3>Source context</h3>
        <p><strong>{item.video.title}</strong></p>
        <p>{item.video.channelName} · {new Date(item.comment.publishedAt).toLocaleDateString()} · {ageLabel(item)} · {item.comment.likeCount} likes · {item.comment.replyCount} replies</p>
        <blockquote>{item.comment.textOriginal}</blockquote>
      </section>

      <section className="detail-section insight-box">
        <div className="section-heading-row">
          <h3>Why this matters</h3>
          <span>{nextBestAction(item)}</span>
        </div>
        <p>{whyThisMatters(item)}</p>
      </section>

      <SourceActions item={item} draftText={selectedDraft?.body} onMarkReplied={() => onTransition('replied')} />

      <section className="detail-section">
        <h3>Why this scored well</h3>
        <p>{item.score.summary}</p>
        <div className="evidence-list">
          {item.score.evidenceSnippets.length ? item.score.evidenceSnippets.map((snippet) => <span key={snippet}>“{snippet}”</span>) : <span>No strong evidence snippet found.</span>}
        </div>
        <div className="offer-row">
          {item.score.detectedOfferFit.length ? item.score.detectedOfferFit.map((offer) => <span key={offer}>{formatOffer(offer)}</span>) : <span>No safe offer fit</span>}
        </div>
      </section>

      <section className="detail-section">
        <h3>Score breakdown</h3>
        <ScoreBreakdown dimensions={item.score.scoreDimensions} />
      </section>

      <section className="detail-section risk-box">
        <h3>Risk flags</h3>
        <p><strong>{item.score.riskLevel.toUpperCase()}</strong> risk · recommended action: {item.score.recommendedAction.replaceAll('_', ' ')}</p>
        <ul>
          {item.score.scoreDimensions.find((dimension) => dimension.dimension === 'spamComplianceRisk')?.evidence.map((risk) => <li key={risk}>{risk}</li>) ?? null}
          {item.comment.signals.filter((signal) => signal.includes('risk') || signal.includes('caution') || signal === 'spam' || signal === 'hostile').map((signal) => <li key={signal}>{signal.replaceAll('_', ' ')}</li>)}
          {item.score.riskLevel === 'low' && <li>No major spam or compliance flag in sample scoring.</li>}
        </ul>
      </section>

      <section className="detail-section">
        <div className="section-heading-row">
          <h3>Reply draft variants</h3>
          <button className="workflow-button safe" type="button" disabled={generatingDrafts} onClick={async () => {
            setGeneratingDrafts(true);
            setDraftMessage('Generating safe drafts…');
            try {
              await onGenerateDrafts();
              setDraftMessage('Drafts generated. Review before copying or posting manually.');
            } catch (error) {
              setDraftMessage(`Draft generation failed safely: ${error instanceof Error ? error.message : 'unknown error'}`);
            } finally {
              setGeneratingDrafts(false);
            }
          }}>{generatingDrafts ? 'Generating…' : 'Generate AI drafts'}</button>
        </div>
        <small className="workflow-note">{draftMessage || 'Draft selection only: no posting.'}</small>
        {drafts.length ? (
          <>
            <div className="draft-tabs" role="tablist" aria-label="Reply draft variants">
              {drafts.map((draft) => (
                <button
                  aria-selected={selectedDraft?.id === draft.id}
                  className={selectedDraft?.id === draft.id ? 'draft-tab active' : 'draft-tab'}
                  key={draft.id}
                  onClick={() => onSelectDraft(draft.id)}
                  role="tab"
                  type="button"
                >
                  {replyStyleLabels[draft.style] ?? draft.style}
                </button>
              ))}
            </div>
            {selectedDraft && (
              <article className={item.score.riskLevel === 'high' ? 'draft selected-draft high-risk' : 'draft selected-draft'}>
                <strong>{replyStyleLabels[selectedDraft.style] ?? selectedDraft.style}</strong>
                <p>{selectedDraft.body}</p>
                <small>{selectedDraft.complianceNotes.join(' · ')}</small>
              </article>
            )}
          </>
        ) : <p className="empty-state">No draft shown because this should be rejected or ignored.</p>}
      </section>
    </aside>
  );
}


function normaliseImportedOpportunity(raw: any): ScoredFixture {
  const video = raw.video || {};
  const comment = raw.comment || {};
  const replyDrafts = raw.replyDrafts || [];
  return {
    id: raw.id,
    video: {
      id: video.id || raw.videoId || 'imported_video',
      youtubeVideoId: video.youtubeVideoId || video.id,
      title: video.title || 'Imported YouTube video',
      channelName: video.channelName || video.channelTitle || 'YouTube channel',
      publishedAt: video.publishedAt || raw.createdAt || new Date().toISOString(),
      topic: video.topic || 'youtube_import',
      offerFit: video.offerFit || raw.detectedOfferFit || [],
      url: video.url,
    },
    comment: {
      id: comment.id || raw.commentId,
      youtubeCommentId: comment.youtubeCommentId || comment.id,
      authorDisplayName: comment.authorDisplayName || comment.authorName || 'YouTube commenter',
      textOriginal: comment.textOriginal || comment.text || '',
      publishedAt: comment.publishedAt || raw.createdAt || new Date().toISOString(),
      likeCount: comment.likeCount || 0,
      replyCount: comment.replyCount || 0,
      signals: comment.signals || [],
      language: comment.language || 'en',
    },
    opportunity: {
      id: raw.id,
      status: raw.status || 'new',
      replyDrafts,
    },
    score: {
      overallScore: raw.overallScore || 0,
      priority: raw.priority || getScoreBand(raw.overallScore || 0),
      riskLevel: raw.riskLevel || 'low',
      summary: raw.summary || 'Imported YouTube opportunity.',
      opportunityType: raw.opportunityType || 'low_fit_comment',
      opportunityTypeLabel: raw.opportunityTypeLabel || opportunityTypeLabels[raw.opportunityType as OpportunityType] || 'Imported opportunity',
      recommendedAction: raw.recommendedAction || 'reply',
      detectedOfferFit: raw.detectedOfferFit || [],
      evidenceSnippets: raw.evidenceSnippets || [],
      scoreDimensions: raw.scoreDimensions || [],
    },
  };
}


function StandaloneModeGate({ children }: { children: React.ReactNode }) {
  const [isFramed, setIsFramed] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    const framed = window.self !== window.top;
    setIsFramed(framed);
    setCurrentUrl(window.location.href);
  }, []);

  async function copyDashboardUrl() {
    await navigator.clipboard.writeText(currentUrl);
  }

  function leaveIframe() {
    try {
      window.open(currentUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      // Fall through to top navigation below.
    }
    try {
      window.top?.location.assign(currentUrl);
    } catch (error) {
      window.location.assign(currentUrl);
    }
  }

  if (!isFramed) return <>{children}</>;

  return (
    <main className="standalone-only-shell">
      <section className="standalone-only-card">
        <span className="eyebrow">Standalone dashboard required</span>
        <h1>Open the YouTube dashboard in a normal browser tab</h1>
        <p>
          This dashboard no longer runs inside the Easy preview iframe. YouTube blocks iframe loading, so the review workflow now runs only as a standalone browser page.
        </p>
        <div className="standalone-actions big">
          <button className="source-button primary" type="button" onClick={leaveIframe}>Open standalone dashboard</button>
          <button className="source-button" type="button" onClick={copyDashboardUrl}>Copy dashboard URL</button>
        </div>
        <small>After opening the standalone tab, use Load persisted queue, select a comment, generate drafts, and open YouTube links from there.</small>
        <code className="standalone-url">{currentUrl}</code>
      </section>
    </main>
  );
}


async function apiJson(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Request failed: ${response.status}`);
  return body;
}

function ImportPanel({ onImported }: { onImported: (items: ScoredFixture[], message: string) => void }) {
  const [videoUrls, setVideoUrls] = useState('');
  const [maxVideos, setMaxVideos] = useState(3);
  const [maxPages, setMaxPages] = useState(1);
  const [maxCommentsPerVideo, setMaxCommentsPerVideo] = useState(100);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Start by importing real YouTube comments, or load any persisted queue from prior imports.');

  async function loadPersisted() {
    setLoading(true);
    try {
      const body = await apiJson('/api/opportunities?limit=250');
      const items = (body.items || []).map(normaliseImportedOpportunity);
      onImported(items, `Loaded ${items.length} persisted opportunities.`);
      setMessage(`Loaded ${items.length} persisted opportunities.`);
    } catch (error) {
      setMessage(`Backend not reachable yet: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  async function importVideos() {
    setLoading(true);
    try {
      const inputs = videoUrls.split(/\n|,/).map((value) => value.trim()).filter(Boolean);
      const body = await apiJson('/api/import/youtube', {
        method: 'POST',
        body: JSON.stringify({ videoUrls: inputs, maxVideos, maxPages, maxCommentsPerVideo }),
      });
      const opportunities = await apiJson('/api/opportunities?limit=250');
      const items = (opportunities.items || []).map(normaliseImportedOpportunity);
      const summary = `Import ${body.run?.status || 'finished'}: ${body.run?.commentsFetched || 0} comments fetched, ${items.length} persisted opportunities available.`;
      onImported(items, summary);
      setMessage(summary);
    } catch (error) {
      setMessage(`Import failed safely: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="import-panel" aria-label="Read-only YouTube import">
      <div>
        <span className="eyebrow">Read-only import</span>
        <h2>Import YouTube comments</h2>
        <p>Paste video URLs, then import public comments into the persisted review queue. The backend reads only; it has no posting endpoint.</p>
      </div>
      <textarea value={videoUrls} onChange={(event) => setVideoUrls(event.target.value)} placeholder="Paste one YouTube video URL per line" />
      <div className="import-controls">
        <label><span>Max videos</span><input type="number" min="1" max="10" value={maxVideos} onChange={(event) => setMaxVideos(Number(event.target.value) || 1)} /></label>
        <label><span>Max pages/video</span><input type="number" min="1" max="5" value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value) || 1)} /></label>
        <label><span>Max comments/video</span><input type="number" min="1" max="500" value={maxCommentsPerVideo} onChange={(event) => setMaxCommentsPerVideo(Number(event.target.value) || 100)} /></label>
      </div>
      <div className="approval-hooks">
        <button className="workflow-button safe" type="button" disabled={loading || !videoUrls.trim()} onClick={importVideos}>{loading ? 'Working…' : 'Import read-only comments'}</button>
        <button className="workflow-button" type="button" disabled={loading} onClick={loadPersisted}>Load persisted queue</button>
      </div>
      <small className="workflow-note">{message}</small>
    </section>
  );
}

function App() {
  const fixtureItems = useMemo(buildItems, []);
  const [importedItems, setImportedItems] = useState<ScoredFixture[]>([]);
  const [dataSource, setDataSource] = useState<'fixtures' | 'imported' | 'combined'>('fixtures');
  const allItems = useMemo(() => dataSource === 'fixtures' ? fixtureItems : dataSource === 'imported' ? importedItems : [...importedItems, ...fixtureItems], [fixtureItems, importedItems, dataSource]);
  const [selectedId, setSelectedId] = useState(allItems[0]?.id);
  const [status, setStatus] = useState<Status>('all');
  const [scoreBand, setScoreBand] = useState<ScoreBand>('all');
  const [niche, setNiche] = useState('all');
  const [opportunityType, setOpportunityType] = useState<OpportunityType>('all');
  const [workTab, setWorkTab] = useState<WorkTab>('hot');
  const [nicheProfile, setNicheProfile] = useState<NicheProfile>('affiliate_marketing');
  const [freshnessWindow, setFreshnessWindow] = useState<FreshnessWindow>('14');
  const [localStatuses, setLocalStatuses] = useState<Record<string, LocalStatus>>(() => Object.fromEntries(allItems.map((item) => [item.id, item.opportunity.status])));
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, string>>({});
  const detailRef = React.useRef<HTMLElement | null>(null);

  const niches = useMemo(() => ['all', ...Array.from(new Set(allItems.map((item) => item.video.topic))).sort()], [allItems]);
  const filteredItems = useMemo(() => allItems.filter((item) => {
    const localStatus = localStatuses[item.id] ?? item.opportunity.status;
    const statusMatch = status === 'all' || localStatus === status;
    const scoreMatch = scoreBand === 'all' || getScoreBand(item.score.overallScore) === scoreBand;
    const nicheMatch = niche === 'all' || item.video.topic === niche;
    const typeMatch = opportunityType === 'all' || item.score.opportunityType === opportunityType;
    const done = ['replied', 'rejected'].includes(localStatus);
    const fresh = isFreshForWindow(item, freshnessWindow);
    const stale = !isFreshForWindow(item, '14');
    const tabMatch = workTab === 'hot'
      ? !done && fresh && item.score.overallScore >= 45 && item.score.opportunityType !== 'low_fit_comment'
      : workTab === 'buyer'
        ? !done && fresh && item.score.opportunityType === 'consumer_buyer_question'
        : workTab === 'publisher'
          ? !done && fresh && item.score.opportunityType === 'affiliate_publisher_opportunity'
          : workTab === 'content'
            ? !done && fresh && (item.score.detectedOfferFit.length > 0 || item.score.evidenceSnippets.length > 0)
            : workTab === 'low_fit'
              ? !done && fresh && item.score.opportunityType === 'low_fit_comment'
              : workTab === 'stale'
                ? !done && stale
                : done;
    return statusMatch && scoreMatch && nicheMatch && typeMatch && tabMatch;
  }), [allItems, localStatuses, status, scoreBand, niche, opportunityType, workTab, freshnessWindow]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? allItems[0];
  function selectOpportunity(id: string) {
    setSelectedId(id);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  const selectedStatus = selectedItem ? localStatuses[selectedItem.id] ?? selectedItem.opportunity.status : 'new';
  useEffect(() => { if (!selectedItem && allItems[0]) setSelectedId(allItems[0].id); }, [selectedItem, allItems]);
  const stats = {
    urgent: allItems.filter((item) => item.score.priority === 'urgent').length,
    consumerQuestions: allItems.filter((item) => item.score.opportunityType === 'consumer_buyer_question').length,
    safeReplies: allItems.filter((item) => item.score.recommendedAction === 'reply' && item.score.riskLevel !== 'high').length,
    risky: allItems.filter((item) => item.score.riskLevel !== 'low').length,
    approved: allItems.filter((item) => (localStatuses[item.id] ?? item.opportunity.status) === 'approved').length,
  };

  async function generateDraftsForSelected() {
    if (!selectedItem) return;
    const body = await apiJson(`/api/opportunities/${encodeURIComponent(selectedItem.id)}/ai-drafts`, { method: 'POST', body: JSON.stringify({}) });
    const updated = normaliseImportedOpportunity(body.item);
    setImportedItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelectedDrafts((current) => ({ ...current, [updated.id]: updated.opportunity.replyDrafts[0]?.id || current[updated.id] }));
  }

  async function updateSelectedStatus(to: LocalStatus) {
    if (!selectedItem) return;
    setLocalStatuses((current) => ({ ...current, [selectedItem.id]: to }));
    if (importedItems.some((item) => item.id === selectedItem.id)) {
      const endpoint = to === 'replied' ? `/api/opportunities/${encodeURIComponent(selectedItem.id)}/manual-replied` : `/api/opportunities/${encodeURIComponent(selectedItem.id)}/status`;
      apiJson(endpoint, { method: 'POST', body: JSON.stringify({ toStatus: to, note: 'Updated from dashboard review workflow.' }) })
        .catch((error) => console.warn('Persist status failed safely', error));
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Affiliate + consumer dashboard · read-only YouTube import · no posting</span>
          <h1>YouTube Opportunity Signal Review</h1>
          <p>Rank affiliate publisher opportunities and consumer buyer questions, inspect the evidence, select safe reply drafts, and move each item through Steve’s manual approval workflow.</p>
        </div>
        <div className="stats-row">
          <StatCard label="Comments scored" value={allItems.length} note={dataSource === 'fixtures' ? 'sample data' : 'live/imported'} />
          <StatCard label="Top signals" value={stats.urgent} note="score + low risk" />
          <StatCard label="Consumer questions" value={stats.consumerQuestions} note="buyer decisions" />
          <StatCard label="Safe reply paths" value={stats.safeReplies} note="draft-ready" />
          <StatCard label="Locally approved" value={stats.approved} note="not posted" />
        </div>
      </section>

      <section className="boundary-strip" aria-label="MVP safety boundary">
        <strong>Safety boundary:</strong> every approval action is local/in-memory. The app now labels affiliate publisher opportunities separately from consumer buyer questions; it prioritizes fresh comments for manual review and never sends a reply, calls YouTube write endpoints, or contacts an external service.
      </section>

      <ImportPanel onImported={(items, message) => {
        setImportedItems(items);
        setDataSource(items.length ? 'imported' : 'fixtures');
        setLocalStatuses((current) => ({ ...Object.fromEntries(items.map((item) => [item.id, item.opportunity.status])), ...current }));
        if (items[0]) setSelectedId(items[0].id);
        console.info(message);
      }} />

      <section className="filters niche-profile-filters" aria-label="Niche profile selector">
        <div>
          <span>Niche profile</span>
          {(['affiliate_marketing', 'money_making', 'work_from_home', 'custom'] as NicheProfile[]).map((value) => (
            <FilterButton key={value} active={nicheProfile === value} value={value} label={nicheProfileLabels[value]} onClick={setNicheProfile} />
          ))}
        </div>
        <small className="workflow-note">Current scoring is tuned for affiliate marketing. These profile buttons are ready for niche-specific rules as we define the list.</small>
      </section>

      <section className="filters work-tabs" aria-label="Review inbox tabs">
        <div>
          <span>Review inbox</span>
          {(['hot', 'buyer', 'publisher', 'content', 'low_fit', 'stale', 'done'] as WorkTab[]).map((value) => (
            <FilterButton key={value} active={workTab === value} value={value} label={workTabLabels[value]} onClick={setWorkTab} />
          ))}
        </div>
      </section>

      <section className="filters freshness-filters" aria-label="Comment freshness filters">
        <div>
          <span>Freshness window</span>
          {(['7', '14', '30', 'all'] as FreshnessWindow[]).map((value) => (
            <FilterButton key={value} active={freshnessWindow === value} value={value} label={value === 'all' ? 'All ages' : `Last ${value} days`} onClick={setFreshnessWindow} />
          ))}
        </div>
        <small className="workflow-note">Default is 14 days. Older comments are better for research/content ideas than direct replies unless the thread is still active.</small>
      </section>

      <section className="filters data-source-filters" aria-label="Data source filters">
        <div>
          <span>Data source</span>
          <FilterButton active={dataSource === 'fixtures'} value="fixtures" label="Sample fixtures" onClick={setDataSource} />
          <FilterButton active={dataSource === 'imported'} value="imported" label={`Imported (${importedItems.length})`} onClick={setDataSource} />
          <FilterButton active={dataSource === 'combined'} value="combined" label="Combined" onClick={setDataSource} />
        </div>
      </section>

      <section className="filters" aria-label="Dashboard filters">
        <div>
          <span>Status</span>
          {(Object.keys(statusLabels) as Status[]).map((value) => (
            <FilterButton key={value} active={status === value} value={value} label={statusLabels[value]} onClick={setStatus} />
          ))}
        </div>
        <div>
          <span>Score</span>
          {(['all', 'urgent', 'high', 'medium', 'low'] as ScoreBand[]).map((value) => (
            <FilterButton key={value} active={scoreBand === value} value={value} label={value === 'all' ? 'All scores' : value} onClick={setScoreBand} />
          ))}
        </div>
        <div>
          <span>Type</span>
          {(['all', 'affiliate_publisher_opportunity', 'consumer_buyer_question', 'low_fit_comment'] as OpportunityType[]).map((value) => (
            <FilterButton key={value} active={opportunityType === value} value={value} label={opportunityTypeLabels[value]} onClick={setOpportunityType} />
          ))}
        </div>
        <label>
          <span>Niche</span>
          <select value={niche} onChange={(event) => setNiche(event.target.value)}>
            {niches.map((value) => <option key={value} value={value}>{value === 'all' ? 'All niches' : formatTopic(value)}</option>)}
          </select>
        </label>
      </section>

      <section className="workspace-grid">
        <div className="opportunity-list" aria-label="Ranked opportunities">
          <div className="list-heading">
            <div>
              <span className="eyebrow">Ranked queue</span>
              <h2>{filteredItems.length} opportunities</h2>
            </div>
            <small>Sorted by live scoring output</small>
          </div>
          {filteredItems.length ? filteredItems.map((item) => (
            <OpportunityCard
              key={item.id}
              item={item}
              localStatus={localStatuses[item.id] ?? item.opportunity.status}
              selected={selectedItem.id === item.id}
              onSelect={() => selectOpportunity(item.id)}
            />
          )) : <p className="empty-state">No opportunities match this inbox/filter combo. Try Hot leads, load imported data, or loosen the score/type filters.</p>}
        </div>
        {selectedItem && (
          <section ref={detailRef}>
          <DetailPanel
            item={selectedItem}
            localStatus={selectedStatus}
            selectedDraftId={selectedDrafts[selectedItem.id]}
            onSelectDraft={(draftId) => {
              setSelectedDrafts((current) => ({ ...current, [selectedItem.id]: draftId }));
              if (importedItems.some((item) => item.id === selectedItem.id)) {
                apiJson(`/api/opportunities/${encodeURIComponent(selectedItem.id)}/selected-draft`, { method: 'POST', body: JSON.stringify({ draftId }) })
                  .catch((error) => console.warn('Persist selected draft failed safely', error));
              }
            }}
            onTransition={updateSelectedStatus}
            onGenerateDrafts={generateDraftsForSelected}
          />
          </section>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StandaloneModeGate><App /></StandaloneModeGate>);
