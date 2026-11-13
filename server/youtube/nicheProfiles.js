// Steve's approved Step 1 lineup (12 profiles). Object key order IS the card order
// and the API order. `group` splits the two rows shown in the UI:
//   main    – the eight primary affiliate-lead choices
//   explore – four "Explore more" choices
//
// Queries are bounded YOUTUBE VIDEO SEARCH bundles (5–6 each) chosen to surface recent,
// practical videos whose comment sections hold engaged, on-topic prospects WITHOUT
// exploding search quota (each search costs 100 units). They are not keyword dumps:
// a video-topic match only puts a comment in front of the scorer; high intent still has
// to come from the comment itself (see server/scoring/nicheLead.js). `keywords` are the
// comment-fit terms used for a bounded topical boost, not a gate.
export const NICHE_PROFILES = {
  // ── Main choices ────────────────────────────────────────────────────────────
  clicks_no_sales: {
    group: 'main',
    label: 'Clicks but No Sales',
    leadCategory: 'affiliate traffic that is not converting to sales',
    replyStyle: 'diagnostic: ask about the offer, audience match and tracking, then suggest one concrete conversion check; never promise income',
    keywords: ['clicks but no sales', 'no sales', 'no commissions', 'not converting', 'no conversions', 'zero sales', 'getting clicks', 'conversion rate', 'why no sales', 'traffic but no sales', 'affiliate clicks'],
    queries: [
      'affiliate marketing clicks but no sales',
      'why am I getting clicks but no conversions affiliate',
      'getting traffic but no affiliate commissions',
      'affiliate links not converting what to do',
      'how to increase affiliate conversion rate for beginners',
      'affiliate marketing no sales troubleshooting',
    ],
  },
  traffic_leads: {
    group: 'main',
    label: 'Getting Traffic & Leads',
    leadCategory: 'lead generation / traffic acquisition',
    replyStyle: 'diagnostic and tactical: ask about offer, audience and channel, then suggest one measurable traffic or lead step',
    keywords: ['get leads', 'lead generation', 'leads', 'traffic', 'get clients', 'first leads', 'landing page', 'funnel traffic', 'website visitors', 'ads', 'free traffic', 'email list'],
    queries: [
      'how to get leads online for beginners',
      'how to get your first leads with no website',
      'how to get traffic to affiliate offers',
      'lead generation for beginners step by step',
      'how to get traffic and leads without paid ads',
    ],
  },
  affiliate_funnels: {
    group: 'main',
    label: 'Affiliate Funnels & Opt-Ins',
    leadCategory: 'affiliate funnel / opt-in and lead-magnet setup',
    replyStyle: 'practical funnel/opt-in guidance: lead magnet, capture page and one measurable setup step; no hype',
    keywords: ['sales funnel', 'funnel', 'opt-in', 'opt in page', 'lead magnet', 'landing page', 'squeeze page', 'bridge page', 'funnel builder', 'capture page', 'free gift', 'email optin'],
    queries: [
      'how to build an affiliate marketing funnel for beginners',
      'how to create an opt-in page for affiliate marketing',
      'lead magnet ideas for affiliate marketing',
      'affiliate marketing funnel setup step by step',
      'best free funnel builder for affiliate marketing',
    ],
  },
  email_follow_up: {
    group: 'main',
    label: 'Email Follow-Up',
    leadCategory: 'email follow-up / autoresponder for affiliates',
    replyStyle: 'email-sequence focused: welcome message, follow-up cadence and one value or deliverability step; no spam tactics',
    keywords: ['email follow up', 'follow-up sequence', 'autoresponder', 'email sequence', 'email list', 'subscribers', 'subscriber', 'opt in', 'broadcast', 'open rate', 'welcome email', 'nurture sequence', 'email marketing', 'subject line', 'unsubscribes'],
    queries: [
      'affiliate marketing email follow up sequence',
      'how to write follow up emails for affiliate marketing',
      'best autoresponder for affiliate marketing beginners',
      'email marketing for affiliate marketing for beginners',
      'how many follow up emails should I send affiliate',
    ],
  },
  organic_traffic: {
    group: 'main',
    label: 'Organic Traffic',
    leadCategory: 'organic traffic / SEO growth',
    replyStyle: 'SEO/content focused: emphasize search intent, consistency, content quality and measurable next steps',
    keywords: ['organic traffic', 'seo', 'rank on google', 'google traffic', 'keywords', 'content strategy', 'blog traffic', 'free traffic', 'search intent', 'backlinks', 'how long does seo take'],
    queries: [
      'how to get organic traffic for affiliate marketing',
      'SEO for beginners step by step',
      'free traffic methods for affiliate marketing',
      'how long does SEO take to rank a new blog',
      'organic traffic strategy without paid ads',
    ],
  },
  choosing_offers: {
    group: 'main',
    label: 'Choosing Affiliate Offers',
    leadCategory: 'choosing affiliate offers, programs or a niche',
    replyStyle: 'offer-selection focused: match offer to audience, weigh commission, cookie and refunds, suggest one vetting step',
    keywords: ['which affiliate program', 'best affiliate offer', 'high ticket', 'low ticket', 'commission rate', 'affiliate network', 'recurring commission', 'cookie duration', 'which niche', 'choose a niche', 'what to promote', 'affiliate offer'],
    queries: [
      'how to choose an affiliate offer for beginners',
      'best affiliate programs for beginners',
      'high ticket vs low ticket affiliate marketing',
      'how to pick a niche for affiliate marketing',
      'how to find affiliate offers that convert',
    ],
  },
  training_reviews: {
    group: 'main',
    label: 'Affiliate Training Reviews',
    leadCategory: 'affiliate course / training evaluation',
    replyStyle: 'cautious due-diligence: weigh cost against value, check credibility and refund terms; no hype, no guarantees',
    keywords: ['course', 'training', 'program', 'mentorship', 'coaching', 'is it worth it', 'worth the money', 'legit', 'scam', 'refund', 'honest review', 'bootcamp'],
    queries: [
      'affiliate marketing course honest review',
      'is affiliate marketing training worth it or a scam',
      'is this affiliate marketing program legit for beginners',
      'affiliate marketing coaching program review',
      'should I pay for an affiliate marketing course',
    ],
  },
  affiliate_marketing: {
    group: 'main',
    label: 'Affiliate Marketing',
    leadCategory: 'affiliate publisher / buyer intent',
    replyStyle: 'clear, practical affiliate-marketing advice with disclosure reminders when relevant',
    keywords: ['affiliate', 'commission', 'amazon associates', 'affiliate link', 'tracking', 'disclosure', 'review site', 'comparison post', 'affiliate website'],
    queries: [
      'affiliate marketing for beginners step by step',
      'how to start affiliate marketing with no money',
      'amazon affiliate marketing website for beginners',
      'affiliate marketing product review strategy',
      'is affiliate marketing worth it for beginners honest',
      'affiliate marketing first commission how long',
    ],
  },
  // ── Explore more ────────────────────────────────────────────────────────────
  ai_tools: {
    group: 'explore',
    label: 'AI Tools for Marketing',
    leadCategory: 'AI marketing tool / workflow question',
    replyStyle: 'tool-comparison for marketing workflows: focus on the task, pricing, learning curve, automation fit and limitations',
    keywords: ['ai tool', 'ai software', 'chatgpt', 'automation', 'ai writer', 'which ai tool', 'ai for marketing', 'ai workflow', 'ai content', 'prompt', 'content creation', 'pricing'],
    queries: [
      'best AI tools for affiliate marketing',
      'how to use AI for content marketing for beginners',
      'AI tools to automate your marketing workflow',
      'best AI writing tool for marketing honest review',
      'how to use ChatGPT for affiliate marketing',
    ],
  },
  biz_opp: {
    group: 'explore',
    label: 'Compare Online Businesses',
    leadCategory: 'comparing online business models',
    replyStyle: 'comparison-focused: weigh startup cost, skills, time and risk across models; no hype, emphasize due diligence',
    keywords: ['business model', 'compare', 'vs', 'which business', 'dropshipping', 'amazon fba', 'fba inventory', 'print on demand', 'ecommerce', 'best online business', 'pros and cons', 'startup cost'],
    queries: [
      'affiliate marketing vs dropshipping for beginners',
      'best online business model for beginners 2026',
      'dropshipping vs affiliate marketing vs print on demand',
      'which online business is most profitable for beginners',
      'compare online business models pros and cons',
    ],
  },
  work_from_home: {
    group: 'explore',
    label: 'Home-Based Business',
    leadCategory: 'home-based business opportunity',
    replyStyle: 'home-business focused: realistic and practical, emphasize startup costs, skills, offer quality and legitimacy checks; no hype',
    keywords: ['home based business', 'business from home', 'work from home business', 'start from home', 'online business', 'home business opportunity', 'side business', 'stay at home', 'startup cost', 'legit business'],
    queries: [
      'home based business ideas for beginners',
      'how to start a business from home with no experience',
      'online business you can run from home',
      'is a home based business legit or a scam',
      'work from home business for stay at home parents',
    ],
  },
  side_hustles: {
    group: 'explore',
    label: 'Side Hustles & Online Income',
    leadCategory: 'side hustle / realistic online income',
    replyStyle: 'concise and realistic: compare time, startup cost, difficulty and first practical step; never promise income',
    keywords: ['side hustle', 'extra income', 'online income', 'make money online', 'passive income', 'part time', 'startup cost', 'low cost', 'earn online', 'after work', 'worth it', 'time needed'],
    queries: [
      'best side hustles for beginners 2026',
      'realistic ways to make money online for beginners',
      'side hustles with low startup cost from home',
      'passive income ideas for beginners honest results',
      'side hustle vs online income which is realistic',
    ],
  },
};

// Retired profiles map to the closest surviving one so old saved scans and any
// persisted opportunity still resolve to a real profile (money-making folded into
// Side Hustles & Online Income).
export const LEGACY_PROFILE_ALIASES = Object.freeze({
  money_making: 'side_hustles',
});

export function resolveNicheProfile(profileId) {
  const id = LEGACY_PROFILE_ALIASES[profileId] || profileId;
  return NICHE_PROFILES[id] || NICHE_PROFILES.affiliate_marketing;
}

export function listNicheProfiles() {
  return Object.entries(NICHE_PROFILES).map(([id, profile]) => ({
    id,
    group: profile.group,
    label: profile.label,
    leadCategory: profile.leadCategory,
    replyStyle: profile.replyStyle,
    queries: profile.queries,
  }));
}

export function nicheScoreBoost(profileId, text = '') {
  const profile = resolveNicheProfile(profileId);
  const lower = String(text || '').toLowerCase();
  const matched = (profile.keywords || []).filter((keyword) => lower.includes(keyword.toLowerCase()));
  const boost = Math.min(14, matched.length * 4);
  return { boost, matched, profile };
}
