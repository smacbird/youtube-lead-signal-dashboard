# Sample Data Notes

## Purpose

`data/sample-comments.json` is a fixture set for the YouTube Opportunity Signal Engine Dashboard MVP. It gives scoring and UI workers enough variety to build ranking, opportunity-type filters, status changes, score explanations, and reply-draft review without connecting to YouTube.

## Important Boundary

The dataset is sample-only. IDs, channel names, timestamps, URLs, authors, and comments are fictional or fixture-safe. Do not call the YouTube API from this data. Do not post replies externally.

## Current Shape

The fixture file uses schema version `0.3.0` and contains 19 comments:

- 12 affiliate publisher/site-owner examples.
- 5 strong consumer product-decision examples.
- 1 high-risk consumer regulated-product example.
- 1 low-fit praise example for down-ranking.

Each fixture item is denormalised:

```text
sample item
├── video
├── comment
│   └── buyerQuestionMeta (consumer examples only)
└── opportunity
    ├── opportunityType / opportunityTypeLabel
    ├── scoreDimensions
    ├── replyDrafts
    └── approvalStatusHistory
```

## Opportunity-Type Coverage

| Opportunity type | Covered by | Purpose |
| --- | --- | --- |
| `affiliate_publisher_opportunity` | `sample_001` through `sample_011`, plus high-risk `sample_004`; spam fixture `sample_012` remains suppressed. | Publisher/site-owner affiliate questions: revenue leakage, tracking, comparison content, disclosure/trust, and funnel/content tools. |
| `consumer_buyer_question` | `sample_013` through `sample_018`. | Product-decision comments: recommendation, comparison, budget, category, urgency, replyability, and compliance/risk. |
| `low_fit_comment` | `sample_019` and spam/unsafe suppressed cases when scoring output chooses low-fit. | Ensures vague praise or unsafe comments do not surface as strong opportunities. |

## Consumer Buyer-Question Fixtures

The consumer examples intentionally cover the common product-decision patterns required by the scoring model:

- `sample_013`: “which product should I buy?” style recommendation intent with a clear product category.
- `sample_014`: “best X under $Y” with a budget constraint and urgency.
- `sample_015`: “X vs Y” comparison intent plus price/value concern.
- `sample_016`: “is X worth it” value question against a cheaper alternative.
- `sample_017`: urgent product recommendation with a budget cap.
- `sample_018`: regulated/unsafe product recommendation request that must be high risk and rejected rather than answered as buying advice.

## Scoring Invariants

`npm run check:scoring` verifies these invariants:

- The dimension order from `src/scoring/scoring.js` is stable.
- Scores stay in the 0-100 range.
- Affiliate publisher opportunities have strong `affiliatePublisherSignal` when they are replyable.
- Consumer buyer questions have strong `consumerRecommendationIntent` or `consumerComparisonIntent` when they are replyable.
- Strong consumer buyer questions can appear in the top queue without needing high affiliate relevance.
- Strong affiliate publisher opportunities still appear in the top queue after consumer scoring is added.
- High spam/compliance risk reduces rank and can force `reject_as_spam`.
- Vague praise is ignored and down-ranked.

## Risk and Compliance Fixtures

Risk coverage includes:

- Hidden affiliate disclosure / deceptive trust language.
- Earnings/link bait spam.
- Regulated health/product advice request.
- Hostile or low-replyability comments.

Reply drafts should never promise guaranteed revenue, rankings, product outcomes, health results, or legal/financial/medical advice. Public replies should avoid asking for private account data or sensitive personal details.

## Manual-Only Workflow

Fixtures include `new` status and append-only `approvalStatusHistory` seed records. The app may let Steve review, approve, reject, or mark replied locally, but sample data and scoring must never add YouTube posting, comment insertion/update, moderation, auto-submit, or external submission paths.
