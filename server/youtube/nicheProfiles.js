export const NICHE_PROFILES = {
  affiliate_marketing: {
    label: 'Affiliate marketing',
    queries: [
      'affiliate marketing for beginners',
      'amazon affiliate marketing website',
      'affiliate marketing traffic strategy',
      'affiliate marketing product review SEO',
    ],
  },
  money_making: {
    label: 'Money-making opportunities',
    queries: [
      'make money online for beginners',
      'best ways to make money online',
      'passive income ideas for beginners',
      'online income side hustle ideas',
    ],
  },
  work_from_home: {
    label: 'Work at home',
    queries: [
      'work from home jobs no experience',
      'remote work from home side hustle',
      'part time work from home jobs',
      'legit work from home opportunities',
    ],
  },
  side_hustles: {
    label: 'Side hustles',
    queries: [
      'best side hustles for beginners',
      'side hustles from home',
      'side hustle ideas 2026',
      'side hustles with low startup cost',
    ],
  },
  biz_opp: {
    label: 'Business opportunity / biz opp',
    queries: [
      'business opportunity for beginners',
      'small business ideas from home',
      'online business opportunity',
      'low cost business ideas',
    ],
  },
  ai_tools: {
    label: 'AI tools/software',
    queries: [
      'best AI tools for business',
      'AI software tools for beginners',
      'AI tools to make money online',
      'AI automation tools for small business',
    ],
  },
  traffic_leads: {
    label: 'Getting Traffic/leads',
    queries: [
      'how to get leads online',
      'lead generation for beginners',
      'how to get traffic to a website',
      'traffic and leads strategy',
    ],
  },
  organic_traffic: {
    label: 'Organic Traffic',
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
  return Object.entries(NICHE_PROFILES).map(([id, profile]) => ({ id, label: profile.label, queries: profile.queries }));
}
