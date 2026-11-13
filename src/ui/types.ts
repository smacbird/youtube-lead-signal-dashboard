export type LocalStatus = 'new' | 'reviewed' | 'approved' | 'rejected' | 'replied';
export type Status = 'all' | LocalStatus;
export type ScoreBand = 'all' | 'urgent' | 'high' | 'medium' | 'low';
export type DraftStyle = 'helpful_consultative' | 'concise_resource' | 'content_follow_up' | 'risk_aware_decline';
export type OpportunityType = 'all' | 'niche_lead' | 'affiliate_publisher_opportunity' | 'consumer_buyer_question' | 'low_fit_comment';
export type ReviewTab = 'best' | 'maybe' | 'not_fit' | 'done' | 'buyer' | 'publisher';
export type NicheProfile =
  | 'clicks_no_sales' | 'traffic_leads' | 'affiliate_funnels' | 'email_follow_up'
  | 'organic_traffic' | 'choosing_offers' | 'training_reviews' | 'affiliate_marketing'
  | 'ai_tools' | 'biz_opp' | 'work_from_home' | 'side_hustles';
export type NicheGroup = 'main' | 'explore';
export type FreshnessWindow = '14' | '30' | 'all';
export type KeyLastKnown = { state: 'unknown' | 'ok' | 'invalid_key' | 'quota_exceeded'; checkedAt: string | null };
export type HealthConfig = { ok?: boolean; youtubeApiKeyConfigured?: boolean; aiDraftsConfigured?: boolean; aiDraftProvider?: string; apiHealth?: { youtube: KeyLastKnown; openai: KeyLastKnown }; googleClientId?: string | null };
export type AppSettings = { defaultScanDepth: number; defaultFreshnessDays: number; replyTone: string; enabledNiches: NicheProfile[] };
export type PreviousScan = { id: string; title?: string; status: string; commentsFetched: number; commentsInserted: number; estimatedQuotaUnits: number; startedAt: string; completedAt?: string; metadata?: Record<string, any> };

export type ScoreDimension = {
  dimension: string;
  score: number;
  reason: string;
  evidence: string[];
};

export type ReplyDraft = {
  id: string;
  opportunityId?: string;
  createdBy?: string;
  style: DraftStyle | string;
  body: string;
  complianceNotes: string[];
};

export type OlspMatch = { scope: 'source' | 'comment'; field: string; kind: string; indicator: string; evidence: string };
export type OlspReview = { flagged: true; source: OlspMatch | null; comment: OlspMatch | null; reason: string };

export type FixtureItem = {
  id: string;
  video: {
    id: string;
    youtubeVideoId?: string;
    title: string;
    channelName: string;
    description?: string;
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

export type ScoredFixture = FixtureItem & {
  olspReview?: OlspReview | null;
  score: {
    overallScore: number;
    priority: Exclude<ScoreBand, 'all'>;
    riskLevel: 'low' | 'medium' | 'high';
    summary: string;
    opportunityType: Exclude<OpportunityType, 'all'>;
    opportunityTypeLabel: string;
    leadFit?: 'best' | 'maybe' | null;
    recommendedAction: string;
    detectedOfferFit: string[];
    evidenceSnippets: string[];
    scoreDimensions: ScoreDimension[];
    lowFitReason?: string | null;
    nicheProfileLabel?: string | null;
    nicheProfileId?: NicheProfile | null;
  };
};

export type VideoBreakdown = {
  youtubeVideoId: string;
  title: string | null;
  commentCountOnYouTube: number | null;
  fetched: number;
  kept: number;
  duplicates: number;
  capped: number;
  moreOnYouTube: boolean;
  stoppedBy: string | null;
  error: string | null;
};

export type ScanSummary = {
  source: 'scan' | 'manual' | 'previous' | 'saved';
  title?: string;
  startedAt?: string;
  candidatesConsidered?: number | null;
  headline: string;
  best: number;
  maybe: number;
  notFit: number;
  done: number;
  nicheLeads: number;
  fetched: number;
  kept: number;
  shown: number;
  notShown: number | null;
  overDisplayLimit: number;
  duplicates: number;
  capped: number;
  skipped: number;
  videos: number | null;
  readableVideos: number | null;
  quotaUnits: number;
  perVideo: VideoBreakdown[];
  notes: string[];
};
