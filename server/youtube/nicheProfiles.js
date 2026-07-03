export const NICHE_PROFILES = {
  affiliate_marketing: {
    label: 'Affiliate marketing',
    leadCategory: 'affiliate publisher / buyer intent',
    replyStyle: 'clear, practical affiliate-marketing advice with disclosure reminders when relevant',
    keywords: ['affiliate', 'commission', 'amazon associates', 'affiliate link', 'tracking', 'disclosure', 'review site', 'comparison post', 'traffic', 'seo'],
    queries: [
      'affiliate marketing for beginners',
      'amazon affiliate marketing website',
      'affiliate marketing traffic strategy',
      'affiliate marketing product review SEO',
    ],
  },
  money_making: {
    label: 'Money-making opportunities',
    leadCategory: 'online income / beginner opportunity',
    replyStyle: 'grounded, realistic, no hype, emphasize costs, skills, time, and no income guarantees',
    keywords: ['make money', 'online income', 'passive income', 'beginner', 'startup cost', 'get paid', 'legit', 'scam', 'how much can i make', 'earn online'],
    queries: [
      'make money online for beginners',
      'best ways to make money online',
      'passive income ideas for beginners',
      'online income side hustle ideas',
    ],
  },
  work_from_home: {
    label: 'Work at/from home business',
    leadCategory: 'home-based business opportunity',
    replyStyle: 'business-opportunity focused: realistic, practical, no hype, emphasize startup costs, skills, traffic, offer quality, and legitimacy checks',
    keywords: ['home based business', 'business from home', 'work from home business', 'start from home', 'online business', 'home business opportunity', 'side business', 'business model', 'startup cost', 'legit business'],
    queries: [
      'home based business opportunities',
      'business from home for beginners',
      'online business ideas from home',
      'work from home business opportunity',
    ],
  },
  side_hustles: {
    label: 'Side hustles',
    leadCategory: 'side hustle / extra income',
    replyStyle: 'concise and realistic, compare time required, startup cost, difficulty, and first practical step',
    keywords: ['side hustle', 'extra income', 'part time', 'startup cost', 'low cost', 'beginner', 'weekend', 'after work', 'time needed', 'worth it'],
    queries: [
      'best side hustles for beginners',
      'side hustles from home',
      'side hustle ideas 2026',
      'side hustles with low startup cost',
    ],
  },
  biz_opp: {
    label: 'Business opportunity / biz opp',
    leadCategory: 'business opportunity evaluation',
    replyStyle: 'cautious and due-diligence focused, avoid hype, emphasize proof, costs, risks, and legitimacy checks',
    keywords: ['business opportunity', 'biz opp', 'franchise', 'startup', 'investment', 'legit', 'scam', 'business model', 'cost to start', 'profit'],
    queries: [
      'business opportunity for beginners',
      'small business ideas from home',
      'online business opportunity',
      'low cost business ideas',
    ],
  },
  ai_tools: {
    label: 'AI tools/software',
    leadCategory: 'AI tool/software buyer question',
    replyStyle: 'tool-comparison oriented, focus on use case, pricing, learning curve, automation fit, and limitations',
    keywords: ['ai tool', 'ai software', 'automation', 'chatgpt', 'best ai', 'which tool', 'pricing', 'workflow', 'use case', 'software'],
    queries: [
      'best AI tools for business',
      'AI software tools for beginners',
      'AI tools to make money online',
      'AI automation tools for small business',
    ],
  },
  traffic_leads: {
    label: 'Getting Traffic/leads',
    leadCategory: 'lead generation / traffic acquisition',
    replyStyle: 'diagnostic and tactical, ask about offer/audience/channel, then suggest one measurable traffic or lead step',
    keywords: ['lead generation', 'leads', 'traffic', 'get clients', 'conversion', 'landing page', 'funnel', 'ads', 'seo', 'email list'],
    queries: [
      'how to get leads online',
      'lead generation for beginners',
      'how to get traffic to a website',
      'traffic and leads strategy',
    ],
  },
  organic_traffic: {
    label: 'Organic Traffic',
    leadCategory: 'organic traffic / SEO growth',
    replyStyle: 'SEO/content focused, emphasize search intent, consistency, content quality, and measurable next steps',
    keywords: ['organic traffic', 'seo', 'rank', 'google traffic', 'keywords', 'content strategy', 'blog traffic', 'free traffic', 'search intent', 'backlinks'],
    queries: [
      'organic traffic strategy',
      'SEO traffic for beginners',
      'how to get organic traffic',
      'free traffic methods for affiliate marketing',
    ],
  },
};

export function resolveNicheProfile(profileId) {
  return NICHE_PROFILES[profileId] || NICHE_PROFILES.affiliate_marketing;
}

export function listNicheProfiles() {
  return Object.entries(NICHE_PROFILES).map(([id, profile]) => ({
    id,
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
