export type OpportunityType = 'affiliate_publisher_opportunity' | 'consumer_buyer_question' | 'low_fit_comment';

export type ScoreDimensionKey =
  | 'affiliatePublisherSignal'
  | 'publisherRevenuePain'
  | 'publisherActionIntent'
  | 'consumerRecommendationIntent'
  | 'consumerComparisonIntent'
  | 'consumerBudgetConstraint'
  | 'consumerProductCategory'
  | 'urgency'
  | 'contentOpportunity'
  | 'replyability'
  | 'spamComplianceRisk';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type RiskLevel = 'low' | 'medium' | 'high';
export type RecommendedAction = 'reply' | 'research_author' | 'save_content_idea' | 'ignore' | 'reject_as_spam';
export type OpportunityStatus = 'new' | 'reviewed' | 'approved' | 'rejected' | 'replied';

export interface VideoFixture {
  id: string;
  youtubeVideoId?: string;
  title: string;
  channelName?: string;
  publishedAt?: string;
  topic: string;
  offerFit: string[];
  url?: string;
  sourceType?: 'fixture' | 'youtube_video';
}

export interface CommentFixture {
  id: string;
  videoId?: string;
  youtubeCommentId?: string;
  textOriginal: string;
  authorDisplayName: string;
  authorChannelId?: string;
  publishedAt?: string;
  likeCount: number;
  replyCount: number;
  signals: string[];
  isChannelOwner?: boolean;
  language: string;
  buyerQuestionMeta?: {
    recommendationIntent?: boolean;
    comparisonIntent?: boolean;
    budgetConstraint?: string;
    productCategory?: string;
    urgency?: string;
  };
}

export interface SampleItem {
  id: string;
  video: VideoFixture;
  comment: CommentFixture;
  opportunity?: {
    id: string;
    status: OpportunityStatus;
    opportunityType?: OpportunityType;
    opportunityTypeLabel?: string;
    sourceType?: 'fixture' | 'youtube_comment';
    [key: string]: unknown;
  };
}

export interface ScoreDimensionResult {
  dimension: ScoreDimensionKey;
  score: number;
  reason: string;
  evidence: string[];
}

export interface ScoredOpportunityResult {
  id: string;
  commentId: string;
  opportunityType: OpportunityType;
  opportunityTypeLabel: string;
  overallScore: number;
  priority: Priority;
  riskLevel: RiskLevel;
  summary: string;
  recommendedAction: RecommendedAction;
  detectedOfferFit: string[];
  evidenceSnippets: string[];
  scoreDimensions: ScoreDimensionResult[];
  createdAt: string;
  updatedAt: string;
}

export declare const DIMENSIONS: ScoreDimensionKey[];
export declare const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string>;
export declare function scoreSampleItem(item: SampleItem, now?: string): ScoredOpportunityResult;
export declare function scoreSampleItems(items: SampleItem[], now?: string): ScoredOpportunityResult[];
