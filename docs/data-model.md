# MVP Data Model: YouTube Opportunity Signal Engine

## Scope

This model supports the sample-data MVP and the planned read-only YouTube import path. The review queue now distinguishes two explicit opportunity classes:

- `affiliate_publisher_opportunity`: a publisher, site owner, creator, or affiliate operator asks about affiliate revenue, tracking, disclosure, comparison content, funnels, or monetization.
- `consumer_buyer_question`: a consumer asks a product-decision question such as “which product should I buy?”, “best X under $Y”, “X vs Y”, or “is X worth it?”.

Out of scope for this phase:

- YouTube write APIs, comment insertion/update, moderation, auto-submit, or posting.
- OAuth/API key storage in browser files, fixtures, docs, logs, or chat.
- Production persistence implementation. The model names records future workers can persist, but this phase only updates scoring/model/fixtures/docs.

## Assumptions

- A `comment` can become one scored review item. Low-fit or spammy comments may still be stored but should rank low or be rejected.
- Scores are deterministic in the MVP and use a 0-100 scale per dimension.
- `replied` means Steve manually marked a reply as sent or simulated. The app must not post to YouTube.
- Compliance defaults are conservative. Anything that looks spammy, deceptive, medical/financial/legal, unsafe, or platform-policy risky should be flagged.
- Fixture IDs and URLs are fake/safe unless a future import explicitly supplies real YouTube IDs.

## Entity Overview

```text
ImportRun 1 ── * Video 1 ── * Comment 1 ── 0..1 ScoredOpportunity 1 ── * ScoreDimension
                                                     │
                                                     ├── * ReplyDraft
                                                     └── * ApprovalStatusHistory
```

## Source Types

| Value | Meaning | Notes |
| --- | --- | --- |
| `fixture` | Static sample record in `data/sample-comments.json`. | Must never be fetched from or posted to YouTube. |
| `youtube_video` | Video metadata imported through a read-only backend call. | Future phase only. Requires server-side credential handling. |
| `youtube_comment` | Comment metadata imported through a read-only backend call. | Future phase only. Review actions stay local/manual. |

## Opportunity Types

| Value | UI label | Higher-value signals | Typical action |
| --- | --- | --- | --- |
| `affiliate_publisher_opportunity` | Affiliate publisher opportunity | Affiliate/site-owner language, commissions, tracking, revenue leakage, disclosure/trust, content strategy, publisher action intent. | Reply, save content idea, or reply with caution. |
| `consumer_buyer_question` | Consumer buyer question | Recommendation intent, comparison intent, budget constraint, product category, urgency, safe replyability. | Reply with an educational decision framework or reject if regulated/risky. |
| `low_fit_comment` | Low-fit comment | Weak opportunity signal or vague praise. | Ignore unless another worker intentionally reviews low-fit comments. |

The two main types must score separately. Strong consumer buyer questions should not need high affiliate relevance to surface, and strong affiliate publisher opportunities should not be hidden by consumer-product dimensions.

## Video

Represents source context for comments. In this phase it comes from fixtures; future imports can populate the same shape from read-only YouTube metadata.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable internal id, e.g. `vid_affiliate_001` or `vid_consumer_014`. |
| `sourceType` | enum | yes | `fixture` for sample data; future import may use `youtube_video`. |
| `youtubeVideoId` | string | yes | Fixture-safe fake id now; real id only from read-only import later. |
| `title` | string | yes | Video title shown in opportunity detail. |
| `channelName` | string | yes | Source channel display name. |
| `publishedAt` | ISO date string | yes | Fixture/import timestamp. |
| `topic` | enum/string | yes | Examples: `affiliate_marketing`, `consumer_product_reviews`. |
| `offerFit` | string[] | yes | Offer/content buckets such as `affiliate_tracking`, `product_selector`, `consumer_product_recommendation`. |
| `url` | string | no | Display URL. Fixture URLs use `youtube.example`; real YouTube URLs are opened manually only. |

## Comment

Represents the original viewer comment plus metadata used by scoring and UI.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable internal id. |
| `videoId` | string | yes | Foreign key to `Video.id`. |
| `youtubeCommentId` | string | yes | Fixture-safe fake id now; real id only from read-only import later. |
| `authorDisplayName` | string | yes | Public display name only. |
| `authorChannelId` | string | no | Fixture-safe fake id or imported public channel id. |
| `textOriginal` | string | yes | Exact comment text shown to Steve. |
| `publishedAt` | ISO date string | yes | Comment timestamp. |
| `likeCount` | number | yes | Helpful for prioritising content opportunities. |
| `replyCount` | number | yes | Indicates conversation activity. |
| `isChannelOwner` | boolean | yes | True if the source channel owner posted it. Usually false for opportunities. |
| `language` | string | yes | ISO-ish language code such as `en`. |
| `signals` | string[] | yes | Fixture/test labels such as `affiliate`, `consumer_buyer_question`, `budget_constraint`, `regulated_caution`. |
| `buyerQuestionMeta` | object/null | no | Optional consumer-decision metadata: recommendation intent, comparison intent, budget, product category, and urgency. |

Suggested `buyerQuestionMeta` shape:

```json
{
  "recommendationIntent": true,
  "comparisonIntent": false,
  "budgetConstraint": "under $300",
  "productCategory": "standing desk",
  "urgency": "this week"
}
```

## ScoredOpportunity

Represents the scored review item shown in the dashboard.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable id, e.g. `opp_014`. |
| `commentId` | string | yes | Foreign key to `Comment.id`. |
| `sourceType` | enum | yes | `youtube_comment` for comment-sourced opportunities; fixture records still use fake IDs. |
| `opportunityType` | enum | yes | `affiliate_publisher_opportunity`, `consumer_buyer_question`, or `low_fit_comment`. |
| `opportunityTypeLabel` | string | yes | UI-facing label for cards/filters. |
| `status` | enum | yes | Current approval state: `new`, `reviewed`, `approved`, `rejected`, `replied`. |
| `overallScore` | number | yes | 0-100 weighted score. High score = 75+. |
| `priority` | enum | yes | `low`, `medium`, `high`, `urgent`. Derived from score plus risk. |
| `riskLevel` | enum | yes | `low`, `medium`, `high`. High risk requires careful review or rejection. |
| `summary` | string | yes | One-sentence reason this comment is or is not an opportunity. |
| `recommendedAction` | enum | yes | `reply`, `research_author`, `save_content_idea`, `ignore`, `reject_as_spam`. |
| `detectedOfferFit` | string[] | yes | Possible Steve offers/content buckets matched by the comment/context. |
| `evidenceSnippets` | string[] | yes | Short snippets from the comment that explain the score. |
| `scoreDimensions` | ScoreDimension[] | yes | Dimension breakdown rendered by the UI. |
| `replyDrafts` | ReplyDraft[] | yes | Drafts only. Never posted automatically. |
| `approvalStatusHistory` | ApprovalStatusHistory[] | yes | Append-only local/persistent status history. |
| `createdAt` | ISO date string | yes | When fixture/scoring created it. |
| `updatedAt` | ISO date string | yes | Last local/persistent update. |

## ScoreDimension

Current deterministic dimension order from `src/scoring/scoring.js`:

| Dimension | Applies To | Range | Higher Means |
| --- | --- | --- | --- |
| `affiliatePublisherSignal` | Affiliate publisher | Strong publisher/site-owner affiliate context: commissions, review content, tracking, disclosure, or funnels. |
| `publisherRevenuePain` | Affiliate publisher | Traffic, clicks, rankings, commissions, or signups are leaking. |
| `publisherActionIntent` | Affiliate publisher | The publisher asks for a tool, template, content structure, or next step. |
| `consumerRecommendationIntent` | Consumer buyer | The commenter asks what to buy, which product to choose, or whether something is worth it. |
| `consumerComparisonIntent` | Consumer buyer | The comment compares options: `X vs Y`, `which is better`, or similar. |
| `consumerBudgetConstraint` | Consumer buyer | A concrete budget, price cap, or value tradeoff is stated. |
| `consumerProductCategory` | Consumer buyer | The product category is specific enough to answer safely. |
| `urgency` | Both | Time pressure, buying deadline, or near-term revenue/buying decision. |
| `contentOpportunity` | Both | The question could become a guide, selector, checklist, comparison, or content idea. |
| `replyability` | Both | A helpful public reply is possible without asking for private details or sounding spammy. |
| `spamComplianceRisk` | Both | Risk of spam, deceptive claims, platform issue, or regulated advice. Higher is worse. |

Suggested nested shape:

```json
{
  "dimension": "consumerBudgetConstraint",
  "score": 88,
  "reason": "A concrete budget or price tradeoff is part of the buying decision.",
  "evidence": ["under $300"]
}
```

## ReplyDraft

Represents safe, reviewable reply options. Drafts are never posted automatically.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable id. |
| `opportunityId` | string | yes | Foreign key to `ScoredOpportunity.id`. |
| `style` | enum | yes | `helpful_consultative`, `concise_resource`, `content_follow_up`, `risk_aware_decline`. |
| `body` | string | yes | Draft reply text. Should be helpful and avoid deceptive claims. |
| `complianceNotes` | string[] | yes | Notes such as `no earnings claim`, `avoid asking for private data`, `regulated caution`. |
| `createdAt` | ISO date string | yes | Fixture timestamp. |
| `createdBy` | enum/string | yes | `fixture`, `template`, or later `llm`. |

## ApprovalStatusHistory

Append-only audit trail for local review status changes. If future workers add persistence, these records should persist exactly because they explain manual decisions.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable id. |
| `opportunityId` | string | yes | Foreign key to `ScoredOpportunity.id`. |
| `fromStatus` | enum/null | yes | Null for initial creation. |
| `toStatus` | enum | yes | `new`, `reviewed`, `approved`, `rejected`, `replied`. |
| `changedAt` | ISO date string | yes | Fixture/local timestamp. |
| `changedBy` | string | yes | `system_fixture`, `steve`, or later authenticated user id. |
| `note` | string | no | Reason for status change. |

## Status Rules

Allowed statuses remain unchanged:

- `new`: generated and not yet reviewed.
- `reviewed`: Steve opened or marked the opportunity as seen.
- `approved`: Steve approved a draft or action plan. Still no external posting.
- `rejected`: Steve decided not to act.
- `replied`: manual/mock state only. No API call should be attached.

Allowed transitions for MVP:

```text
new -> reviewed
new -> approved
new -> rejected
reviewed -> approved
reviewed -> rejected
approved -> replied
approved -> rejected
replied -> reviewed  (only for correcting manual/mock state)
```

## ImportRun

Future read-only import phases can use this record to audit source fetches without storing secrets.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Stable import run id. |
| `sourceType` | enum | yes | `youtube_video` / `youtube_comment`. |
| `requestedVideoIds` | string[] | yes | Normalized IDs supplied by the operator. No credential-bearing URLs. |
| `status` | enum | yes | `queued`, `running`, `completed`, `completed_with_errors`, `failed`. |
| `startedAt` / `finishedAt` | ISO date string/null | yes | Timing for the read-only fetch. |
| `pagesFetched` | number | yes | Page count for quota visibility. |
| `commentsFetched` | number | yes | Raw comments read. |
| `commentsInserted` / `commentsUpdated` / `commentsSkipped` | number | yes | Persistence summary. |
| `estimatedQuotaUnits` | number | yes | Non-secret quota estimate. |
| `errors` | object[] | yes | Non-secret error code/message; do not log API keys, tokens, or private data. |

## Fixture File Guidance

`data/sample-comments.json` is denormalised for practical frontend and scoring work. Each item includes video, comment, scored-opportunity seed data, reply drafts, and status history. Later workers may normalise this into separate stores if needed.

Required invariants:

- Keep `opportunityType` explicit.
- Keep fixture URLs fake/safe unless a future import supplies real source links.
- Keep all reply behavior manual/local.
- Do not add write API endpoints, posting code, moderation actions, or auto-submit paths.
