import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DIMENSIONS, scoreSampleItems } from '../src/scoring/scoring.js';

const fixture = JSON.parse(await readFile(new URL('../data/sample-comments.json', import.meta.url), 'utf8'));
const scored = scoreSampleItems(fixture.items);
const bySampleId = new Map(fixture.items.map((item, index) => [item.id, scored[index]]));
const dimensionScore = (item, dimension) => item.scoreDimensions.find((d) => d.dimension === dimension)?.score ?? 0;

assert.equal(scored.length, 19, 'affiliate publisher and consumer buyer-question sample comments are scored');
for (const item of scored) {
  assert.deepEqual(item.scoreDimensions.map((d) => d.dimension), DIMENSIONS, `${item.commentId} dimension order is stable`);
  assert.ok(item.overallScore >= 0 && item.overallScore <= 100, `${item.commentId} overall score is 0-100`);
  assert.ok(['affiliate_publisher_opportunity', 'consumer_buyer_question', 'low_fit_comment'].includes(item.opportunityType), `${item.commentId} has a known opportunity type`);
  if (item.opportunityType === 'affiliate_publisher_opportunity' && !['reject_as_spam', 'ignore'].includes(item.recommendedAction)) {
    assert.ok(dimensionScore(item, 'affiliatePublisherSignal') >= 60, `${item.commentId} has affiliate publisher signal`);
  }
  if (item.opportunityType === 'consumer_buyer_question' && !['reject_as_spam', 'ignore'].includes(item.recommendedAction)) {
    assert.ok(Math.max(dimensionScore(item, 'consumerRecommendationIntent'), dimensionScore(item, 'consumerComparisonIntent')) >= 60, `${item.commentId} has consumer buyer-decision signal`);
  }
}

const funnelLeak = bySampleId.get('sample_001');
assert.ok(funnelLeak.overallScore >= 75, 'traffic/no-signups affiliate funnel leak ranks high');
assert.equal(funnelLeak.opportunityType, 'affiliate_publisher_opportunity', 'funnel leak is a publisher opportunity');
assert.equal(funnelLeak.recommendedAction, 'reply', 'high-fit affiliate funnel leak is replyable');
assert.ok(dimensionScore(funnelLeak, 'affiliatePublisherSignal') >= 80, 'affiliate publisher signal is high');
assert.ok(dimensionScore(funnelLeak, 'publisherRevenuePain') >= 70, 'publisher revenue pain is high');

const contentTool = bySampleId.get('sample_005');
assert.ok(dimensionScore(contentTool, 'contentOpportunity') >= 85, 'repeated buyer question scores high for content/tool opportunity');

const disclosure = bySampleId.get('sample_004');
assert.equal(disclosure.opportunityType, 'affiliate_publisher_opportunity', 'hidden disclosure question remains an affiliate publisher opportunity');
assert.equal(disclosure.riskLevel, 'high', 'hidden disclosure question is high risk');
assert.ok(dimensionScore(disclosure, 'spamComplianceRisk') >= 70, 'disclosure risk is high');

const whichProduct = bySampleId.get('sample_013');
assert.equal(whichProduct.opportunityType, 'consumer_buyer_question', 'which product should I buy is a consumer buyer question');
assert.ok(dimensionScore(whichProduct, 'consumerRecommendationIntent') >= 80, 'which product should I buy has strong recommendation intent');
assert.ok(dimensionScore(whichProduct, 'consumerProductCategory') >= 60, 'which product should I buy has a product category');
assert.equal(whichProduct.recommendedAction, 'reply', 'which product should I buy is replyable');

const bestUnderBudget = bySampleId.get('sample_014');
assert.equal(bestUnderBudget.opportunityType, 'consumer_buyer_question', 'best X under $Y is a consumer buyer question');
assert.ok(bestUnderBudget.overallScore >= 70, 'best X under $Y can surface near publisher opportunities');
assert.ok(dimensionScore(bestUnderBudget, 'consumerBudgetConstraint') >= 75, 'best X under $Y has strong budget constraint');
assert.ok(dimensionScore(bestUnderBudget, 'urgency') >= 60, 'best X under $Y can include urgency');

const comparison = bySampleId.get('sample_015');
assert.equal(comparison.opportunityType, 'consumer_buyer_question', 'X vs Y is a consumer buyer question');
assert.ok(dimensionScore(comparison, 'consumerComparisonIntent') >= 85, 'X vs Y has strong comparison intent');
assert.ok(comparison.overallScore >= 70, 'X vs Y can surface in the queue');

const worthIt = bySampleId.get('sample_016');
assert.equal(worthIt.opportunityType, 'consumer_buyer_question', 'is X worth it is a consumer buyer question');
assert.ok(dimensionScore(worthIt, 'consumerRecommendationIntent') >= 75, 'is X worth it has recommendation intent');
assert.ok(dimensionScore(worthIt, 'consumerBudgetConstraint') >= 60, 'is X worth it carries price/value concern');

const regulatedConsumer = bySampleId.get('sample_018');
assert.equal(regulatedConsumer.opportunityType, 'consumer_buyer_question', 'regulated product request is still typed as a consumer buyer question');
assert.equal(regulatedConsumer.riskLevel, 'high', 'regulated product request is high risk');
assert.equal(regulatedConsumer.recommendedAction, 'reject_as_spam', 'regulated product request is not replyable as a recommendation');

const lowFit = bySampleId.get('sample_019');
assert.equal(lowFit.opportunityType, 'low_fit_comment', 'vague praise is low fit');
assert.equal(lowFit.recommendedAction, 'ignore', 'vague praise is ignored');
assert.ok(lowFit.overallScore <= 20, 'low-fit praise is down-ranked');

const spam = bySampleId.get('sample_012');
assert.equal(spam.recommendedAction, 'reject_as_spam', 'earnings/link bait spam is rejected');
assert.equal(spam.riskLevel, 'high', 'spam is high risk');
assert.ok(spam.overallScore <= 25, 'spam is suppressed');

const topSeven = scored.slice().sort((a, b) => b.overallScore - a.overallScore).slice(0, 7);
assert.ok(topSeven.some((item) => item.opportunityType === 'affiliate_publisher_opportunity'), 'top results keep affiliate publisher opportunities visible');
assert.ok(topSeven.some((item) => item.opportunityType === 'consumer_buyer_question'), 'top results allow strong consumer buyer questions to surface');

console.log(`Scored ${scored.length} affiliate publisher + consumer buyer-question sample comments.`);
console.log(`Top 7: ${topSeven.map((item) => `${item.commentId}:${item.opportunityType}:${item.overallScore}`).join(', ')}`);
