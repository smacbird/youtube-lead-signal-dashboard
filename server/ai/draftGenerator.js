const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function clean(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function inferQuestionType(commentText) {
  const text = commentText.toLowerCase();
  if (text.includes('amazon') || text.includes('affiliate') || text.includes('commission') || text.includes('website')) return 'affiliate_publisher';
  if (text.includes(' vs ') || text.includes('worth') || text.includes('best') || text.includes('buy') || text.includes('recommend')) return 'consumer_buyer';
  return 'general_affiliate';
}

function fallbackDrafts(opportunity) {
  const comment = opportunity.comment || {};
  const video = opportunity.video || {};
  const name = clean(comment.authorDisplayName || 'there');
  const text = clean(comment.textOriginal || '');
  const qtype = inferQuestionType(text);
  const now = new Date().toISOString();
  const base = `ai_${opportunity.id}_${now.replace(/[-:.TZ]/g, '')}`;

  if (qtype === 'affiliate_publisher') {
    return [
      {
        id: `${base}_short`,
        opportunityId: opportunity.id,
        style: 'ai_short_helpful',
        body: `Good question, ${name}. In most affiliate programs, the merchant pays the commission: not the buyer. If you already have a site, the next step is usually to join the program, add a clear affiliate disclosure, and place links inside genuinely helpful content like reviews, comparisons, or buyer guides rather than dropping links everywhere.`,
        complianceNotes: ['Manual approval required', 'No earnings guarantee', 'Include affiliate disclosure where relevant'],
        createdAt: now,
        createdBy: 'server_ai_fallback',
      },
      {
        id: `${base}_consultative`,
        opportunityId: opportunity.id,
        style: 'ai_consultative',
        body: `I’d start simple: pick one product category your audience already cares about, create one useful review or comparison page, add the required affiliate disclosure, then track clicks before expanding. The biggest mistake is adding a bunch of links before you know which pages have buyer intent.`,
        complianceNotes: ['Manual approval required', 'No private-data request', 'Educational wording only'],
        createdAt: now,
        createdBy: 'server_ai_fallback',
      },
      {
        id: `${base}_content_angle`,
        opportunityId: opportunity.id,
        style: 'ai_content_angle',
        body: `This would actually make a good checklist topic: “How to add Amazon affiliate links to an existing site without hurting trust.” Cover joining Associates, disclosures, where links belong, and how to track clicks/conversions before scaling.`,
        complianceNotes: ['Content idea, not a pitch', 'Do not imply guaranteed income', 'Manual approval required'],
        createdAt: now,
        createdBy: 'server_ai_fallback',
      },
    ];
  }

  if (qtype === 'consumer_buyer') {
    return [
      {
        id: `${base}_short`,
        opportunityId: opportunity.id,
        style: 'ai_short_helpful',
        body: `I’d narrow it down by use case first: what matters more for you, price, durability, performance, or ease of use? Once that’s clear, comparing the top 2–3 options gets much easier than trying to find one universal “best” pick.`,
        complianceNotes: ['Manual approval required', 'No fake endorsement', 'Avoid unsupported product claims'],
        createdAt: now,
        createdBy: 'server_ai_fallback',
      },
      {
        id: `${base}_consultative`,
        opportunityId: opportunity.id,
        style: 'ai_consultative',
        body: `If you’re choosing between options, I’d compare them on the few things that actually affect your day-to-day use: budget, must-have features, warranty/support, and what people complain about after a few months. The “best” choice is usually the one that fits your use case, not the one with the biggest spec sheet.`,
        complianceNotes: ['Manual approval required', 'No guaranteed results', 'Keep it educational'],
        createdAt: now,
        createdBy: 'server_ai_fallback',
      },
      {
        id: `${base}_content_angle`,
        opportunityId: opportunity.id,
        style: 'ai_content_angle',
        body: `Good buyer-guide angle: turn this into a quick “best option for X vs Y” comparison and include who each product is best for, who should skip it, and the main tradeoff buyers should know before clicking.`,
        complianceNotes: ['Content idea', 'Disclose affiliate relationships where applicable', 'Manual approval required'],
        createdAt: now,
        createdBy: 'server_ai_fallback',
      },
    ];
  }

  return [
    {
      id: `${base}_short`,
      opportunityId: opportunity.id,
      style: 'ai_short_helpful',
      body: `Helpful question, ${name}. I’d answer this by starting with the goal, then working backward to the one next step that gives you useful data without overcomplicating it.`,
      complianceNotes: ['Manual approval required', 'No guarantees', 'No private-data request'],
      createdAt: now,
      createdBy: 'server_ai_fallback',
    },
  ];
}

function parseDraftJson(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI response did not contain a JSON array.');
  return JSON.parse(match[0]);
}

export async function generateReplyDrafts(opportunity) {
  if (!process.env.OPENAI_API_KEY) return { provider: 'server_fallback', drafts: fallbackDrafts(opportunity) };

  const comment = opportunity.comment || {};
  const video = opportunity.video || {};
  const prompt = `You write safe YouTube comment reply drafts for Steve, an affiliate marketer.\n\nRules:\n- No auto-posting. Steve manually approves/copies/posts.\n- No income guarantees.\n- No fake endorsement or claims not supported by the comment.\n- No private-data requests in public comments.\n- Mention affiliate disclosures when relevant.\n- Keep drafts helpful, natural, and concise.\n\nReturn ONLY JSON array of 3 objects with fields: style, body, complianceNotes. Styles: ai_short_helpful, ai_consultative, ai_content_angle.\n\nVideo title: ${clean(video.title)}\nChannel: ${clean(video.channelName)}\nOpportunity type: ${opportunity.opportunityType}\nRisk: ${opportunity.riskLevel}\nComment author: ${clean(comment.authorDisplayName)}\nComment: ${clean(comment.textOriginal)}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You write safe, practical, human-reviewed YouTube reply drafts for affiliate marketing opportunities.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI draft generation failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const body = await response.json();
  const content = body.choices?.[0]?.message?.content || '';
  const now = new Date().toISOString();
  const base = `ai_${opportunity.id}_${now.replace(/[-:.TZ]/g, '')}`;
  const drafts = parseDraftJson(content).slice(0, 3).map((draft, index) => ({
    id: `${base}_${index + 1}`,
    opportunityId: opportunity.id,
    style: draft.style || ['ai_short_helpful', 'ai_consultative', 'ai_content_angle'][index] || `ai_draft_${index + 1}`,
    body: clean(draft.body),
    complianceNotes: Array.isArray(draft.complianceNotes) ? draft.complianceNotes.map(clean).filter(Boolean) : ['Manual approval required'],
    createdAt: now,
    createdBy: 'openai',
  }));

  return { provider: 'openai', drafts: drafts.length ? drafts : fallbackDrafts(opportunity) };
}
