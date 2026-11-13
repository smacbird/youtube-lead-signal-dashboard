import { randomBytes } from 'node:crypto';

// Deterministic, public-facing replies only. If the comment does not ask something
// we can answer safely without inventing details, return null rather than coaching text.
const START = /\b(how (do|can|should) i start|how to (get )?start|where (do|should) i start|i'?m new|i am new|new to this|complete beginner|zero experience|getting into|first step)\b/i;
const COST = /\b(how much|what does it cost|cost to start|startup cost|upfront cost|price|pricing|monthly fee|budget)\b/i;
const TIME = /\b(how long|hours per week|hours a week|time needed|time does it take)\b/i;
const TRUST = /\b(legit|legitimate|scam|worth it|pyramid scheme|too good to be true|real business)\b/i;
const REQUEST_VIDEO = /\b(can you|could you|please|do a|make a)\b.{0,50}\b(video|tutorial|walkthrough)\b/i;
const TOOL = /\b(which|what|best|recommend|suggest)\b.{0,35}\b(tool|software|platform|app|course|service|resource)\b/i;
const AFFILIATE_LINKS = /\b(affiliate links?|affiliate earnings|affiliate commissions?)\b/i;
const REGULATED = /\b(tax(es|ation)?|legal|lawyer|medical|health|treatment|diagnos(is|e)|invest(ment|ing)|loan|insurance|mortgage|financial advice|credit score|bank account)\b/i;
const BANK_ACCOUNT = /\b(business\s+)?bank account\b/i;
// Keyed by nicheProfileId. Covers the current 12 profiles; `money_making` is kept so
// older saved opportunities still get a sensible first step (folded into side hustles).
const NICHES = {
  clicks_no_sales: 'Check that the offer matches what your visitors actually want, confirm your links and tracking work, then look at where people drop off before changing anything else.',
  traffic_leads: 'Start with one clear audience and offer, then test a single way to bring that audience to a simple page.',
  affiliate_funnels: 'Start with one specific offer and a simple opt-in page that gives something useful, then send that traffic to one clear next step.',
  email_follow_up: 'Write one helpful welcome email first, then plan a short follow-up that answers common questions before it mentions any offer.',
  organic_traffic: 'Start with one question your audience searches for, write a clear answer and watch whether it attracts the right visitors.',
  choosing_offers: 'Match the offer to a problem your audience already has, then check the commission, cookie window and refund rate before you promote it.',
  training_reviews: 'Check exactly what the program includes, the total cost and the refund terms, and look for independent reviews before paying.',
  affiliate_marketing: 'Choose a topic you can explain clearly, then compare reputable programs and create useful content before expecting clicks.',
  ai_tools: 'Pick one specific task to test, compare a tool on sample work and check its limits before paying.',
  biz_opp: 'List the startup cost, skills and time each model needs, then compare them against what you can realistically commit before choosing one.',
  work_from_home: 'Choose one service or product you could deliver from home and list the costs and work needed for a small first test.',
  side_hustles: 'Pick one option you can test around your current schedule, then track the hours and expenses before scaling up.',
  money_making: 'Pick one method that matches your available time and skills, then check its startup costs before paying for anything.',
};

function nameFor(text) {
  const match = String(text || '').match(/\b(tax|legal|medical|health|investment|loan|mortgage|insurance|bank account|financial)\b/i);
  return match?.[0]?.toLowerCase() || 'this';
}

/** Returns one concise, copyable answer or null; never a meta-instruction. */
export function fallbackReplyText(opportunity) {
  const text = String(opportunity?.comment?.textOriginal || '').trim();
  const lower = text.toLowerCase();
  if (!text || text.length > 5000 || /https?:\/\/|www\./i.test(text)) return null;
  const niche = opportunity?.nicheProfileId;
  const firstStep = NICHES[niche];
  if (!firstStep || /about a different business/i.test(opportunity?.summary || '')) return null;

  let answer;
  if (BANK_ACCOUNT.test(lower)) {
    answer = 'A separate business bank account can make income and expenses easier to track. Check what your bank requires for your business setup, and ask a qualified accountant or tax professional about the rules that apply to you.';
  } else if (REGULATED.test(lower)) {
    answer = `For ${nameFor(text)}, start with official guidance rather than advice from a comment thread. Check your specific situation with a qualified professional before acting.`;
  } else if (REQUEST_VIDEO.test(lower)) {
    answer = `That would make a useful follow-up video. As a first step, ${firstStep[0].toLowerCase()}${firstStep.slice(1)}`;
  } else if (TRUST.test(lower)) {
    answer = 'Check what is actually being sold, any upfront fees and the cancellation rules before paying. Be wary of claims that promise effortless results.';
  } else if (COST.test(lower) && TIME.test(lower)) {
    answer = 'The exact cost and time depend on the approach and tools you choose. List the required upfront and ongoing expenses, then try a small test you can fit into your schedule.';
  } else if (COST.test(lower)) {
    answer = 'There is no single startup cost: it depends on the tools and business model. List the required upfront fees and ongoing expenses before you pay for anything.';
  } else if (TIME.test(lower)) {
    answer = 'The time depends on the method and what you can do consistently. Start with a small weekly plan and track the hours it actually takes before making a bigger commitment.';
  } else if (START.test(lower)) {
    answer = firstStep;
  } else if (TOOL.test(lower)) {
    answer = 'Which task do you want the tool to handle first? Compare the price and limits of tools built for that task before choosing one.';
  } else {
    return null;
  }

  // Disclosures are relevant only when the actual comment asks about affiliate links/earnings.
  if (AFFILIATE_LINKS.test(lower)) answer += ' If you share an affiliate link, disclose that relationship clearly.';
  return answer;
}

export function safeFallbackDraft(opportunity) {
  const body = fallbackReplyText(opportunity);
  if (!body) return null;
  const now = new Date().toISOString();
  return {
    id: `fallback_${opportunity.id}_${now.replace(/[-:.TZ]/g, '')}_${randomBytes(3).toString('hex')}`, 
    opportunityId: opportunity.id,
    style: 'fallback_short',
    body,
    complianceNotes: ['Suggested draft (automatic fallback)', 'Review and edit before posting', 'No automatic posting'],
    createdAt: now,
    createdBy: 'safe_fallback',
  };
}
