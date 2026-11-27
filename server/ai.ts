import { GoogleGenAI } from '@google/genai/web';
import type {
  Activity,
  Approval,
  Campaign,
  ContentPiece,
  Experiment,
  Lead,
  StageKey,
  Temperature,
  WorkspaceSettings,
} from '../src/types/funnel.ts';
import { makeId, type SunmedxDatabase } from './seed.ts';

const MODEL = 'gemini-2.5-flash';

function resolveApiKey(explicitKey?: string): string | undefined {
  const fromEnv =
    typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
  const key = explicitKey || fromEnv;
  if (!key || key === 'MY_GEMINI_API_KEY') return undefined;
  return key;
}

function getClient(explicitKey?: string): GoogleGenAI | null {
  const apiKey = resolveApiKey(explicitKey);
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function generateJson<T>(
  prompt: string,
  fallback: () => T,
  apiKey?: string
): Promise<T> {
  const ai = getClient(apiKey);
  if (!ai) return fallback();
  try {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.5,
      },
    });
    const text = resp.text;
    if (!text) return fallback();
    return JSON.parse(stripJsonFences(text)) as T;
  } catch (err) {
    console.warn('Gemini JSON fallback triggered:', (err as Error).message);
    return fallback();
  }
}

async function generateText(
  prompt: string,
  fallback: () => string,
  apiKey?: string
): Promise<string> {
  const ai = getClient(apiKey);
  if (!ai) return fallback();
  try {
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { temperature: 0.6 },
    });
    return resp.text?.trim() || fallback();
  } catch (err) {
    console.warn('Gemini text fallback triggered:', (err as Error).message);
    return fallback();
  }
}

function pickOfferForLead(lead: Lead, ws: WorkspaceSettings) {
  const interest = (lead.interest || '').toLowerCase();
  const offers = ws.offers;
  if (interest.includes('audit') || interest.includes('1:1') || interest.includes('service')) {
    return offers.find((o) => o.kind === 'service') || offers[1] || offers[0];
  }
  if (interest.includes('stack') || interest.includes('physical')) {
    return offers.find((o) => o.kind === 'physical') || offers[2] || offers[0];
  }
  return offers.find((o) => o.kind === 'digital') || offers[0];
}

export async function scoreLeadWithAI(
  lead: Lead,
  ws: WorkspaceSettings,
  apiKey?: string
): Promise<{
  score: number;
  temperature: Temperature;
  stage: StageKey;
  score_reason: string;
  next_action: string;
  deal_value: number;
}> {
  const matchedOffer = pickOfferForLead(lead, ws);
  const fallback = () => {
    let score = 45;
    if (lead.email) score += 10;
    if (lead.need_signal && lead.need_signal.length > 8) score += 15;
    if (lead.budget_signal && !lead.budget_signal.toLowerCase().includes('not stated')) {
      score += 12;
    }
    if (
      lead.timeline_signal &&
      /week|today|soon|monday|immediate|now|days/i.test(lead.timeline_signal)
    ) {
      score += 14;
    }
    score = Math.min(96, Math.max(25, score));
    const temperature: Temperature = score >= 70 ? 'hot' : score >= 48 ? 'warm' : 'cold';
    const stage: StageKey =
      lead.stage === 'conversion' || lead.stage === 'retention'
        ? lead.stage
        : temperature === 'hot'
          ? 'proposal'
          : 'nurture';
    return {
      score,
      temperature,
      stage,
      score_reason:
        temperature === 'hot'
          ? `Clear signal alignment (${lead.need_signal || lead.interest}) with near-term readiness.`
          : `Early fit on ${lead.interest || 'energy reset'} — needs proof sequence before an offer.`,
      next_action:
        temperature === 'hot'
          ? `Draft ${matchedOffer.name} offer for approval`
          : 'Send 3-part nurture sequence',
      deal_value: Number(lead.deal_value) || matchedOffer.price,
    };
  };

  const prompt = `You are the Sunmedx funnel qualification engine.
Brand brief:
- Positioning: ${ws.positioning}
- Audience: ${ws.audience}
- Tone: ${ws.tone}
- Offers: ${JSON.stringify(ws.offers)}

Lead:
- Name: ${lead.full_name}
- Email: ${lead.email}
- Interest: ${lead.interest}
- Need signal: ${lead.need_signal || 'none'}
- Budget signal: ${lead.budget_signal || 'none'}
- Timeline signal: ${lead.timeline_signal || 'none'}
- Current stage: ${lead.stage}

Return strictly valid JSON with keys:
{
  "score": number (0-100),
  "temperature": "hot" | "warm" | "cold",
  "stage": "awareness" | "interest" | "nurture" | "proposal" | "conversion" | "retention",
  "score_reason": string (1-2 calm sentences explaining budget, need, timeline),
  "next_action": string (short concrete next move),
  "deal_value": number (matching offer price in USD)
}`;

  const result = await generateJson(prompt, fallback, apiKey);
  const score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 50)));
  const temperature: Temperature =
    result.temperature === 'hot' || result.temperature === 'warm' || result.temperature === 'cold'
      ? result.temperature
      : score >= 70
        ? 'hot'
        : score >= 48
          ? 'warm'
          : 'cold';
  return {
    score,
    temperature,
    stage:
      lead.stage === 'conversion' || lead.stage === 'retention'
        ? lead.stage
        : result.stage || (temperature === 'hot' ? 'proposal' : 'nurture'),
    score_reason: result.score_reason || fallback().score_reason,
    next_action: result.next_action || fallback().next_action,
    deal_value: Number(result.deal_value) || matchedOffer.price,
  };
}

export async function draftApprovalWithAI(
  lead: Lead,
  kind: 'proposal' | 'reply',
  ws: WorkspaceSettings,
  context?: string,
  apiKey?: string
): Promise<{
  subject: string;
  body: string;
  offer: string;
  price: number;
  confidence: number;
}> {
  const offer = pickOfferForLead(lead, ws);
  const firstName = lead.full_name.split(' ')[0] || lead.full_name;

  const fallback = () => {
    if (kind === 'reply') {
      const objection = context || 'price and commitment';
      return {
        subject: `Re: ${offer.name} — answering your question`,
        body: `Hi ${firstName},\n\nThanks for being direct about "${objection}".\n\nWe built ${offer.name} ($${offer.price}) so you don't have to guess or commit to a dozen bottles. ${offer.promise}\n\nIf starting smaller feels right, the 30-Day Energy Reset Protocol ($29) gives you the core daily sequence first — and you can apply it toward an audit later.\n\nLet me know which path fits best.\n\nBest,\n${ws.brand}`,
        offer: offer.name,
        price: offer.price,
        confidence: 83,
      };
    }
    return {
      subject: `A clear plan for your energy — ${offer.name}`,
      body: `Hi ${firstName},\n\nBased on what you shared (${lead.need_signal || lead.interest}), the cleanest fit is ${offer.name} ($${offer.price}).\n\n${offer.promise}\n\nNo hype and no complicated stack — just the sequence matched to your signals and schedule. Reply to this note if you want me to send the link to get started.\n\nBest,\n${ws.brand}`,
      offer: offer.name,
      price: offer.price,
      confidence: Math.max(76, Math.min(95, lead.score || 82)),
    };
  };

  const prompt = `Write a concise, calm, evidence-led ${kind === 'proposal' ? 'offer email' : 'objection reply email'} in the voice of ${ws.brand}.
Tone: ${ws.tone} (no hype, no exclamation marks).
Offer catalog: ${JSON.stringify(ws.offers)}
Lead: ${lead.full_name} (${lead.email}), interest: ${lead.interest}, need: ${lead.need_signal || 'general energy'}, budget: ${lead.budget_signal || 'unspecified'}, timeline: ${lead.timeline_signal || 'unspecified'}.
${context ? `Buyer objection / question: ${context}` : ''}

Return strictly valid JSON:
{
  "subject": string,
  "body": string (plain text email with line breaks),
  "offer": string,
  "price": number,
  "confidence": number (65-98)
}`;

  const result = await generateJson(prompt, fallback, apiKey);
  return {
    subject: result.subject || fallback().subject,
    body: result.body || fallback().body,
    offer: result.offer || offer.name,
    price: Number(result.price) || offer.price,
    confidence: Math.max(60, Math.min(99, Math.round(Number(result.confidence) || 84))),
  };
}

export async function runAutopilotCycle(
  db: SunmedxDatabase,
  apiKey?: string
): Promise<{ scored: number; proposals: number; retention: number }> {
  const now = new Date().toISOString();
  const isEnabled = (key: string) =>
    db.automations.find((a) => a.key === key)?.enabled !== false;

  const bumpAutomation = (key: string) => {
    const auto = db.automations.find((a) => a.key === key);
    if (auto) {
      auto.run_count = (auto.run_count || 0) + 1;
      auto.last_run = now;
    }
  };

  let scored = 0;
  let proposals = 0;
  let retention = 0;

  if (isEnabled('lead_scoring')) {
    const unscored = db.leads.filter((l) => !l.score || l.score === 0);
    for (const lead of unscored.slice(0, 4)) {
      const res = await scoreLeadWithAI(lead, db.workspace, apiKey);
      lead.score = res.score;
      lead.temperature = res.temperature;
      lead.stage = res.stage;
      lead.score_reason = res.score_reason;
      lead.next_action = res.next_action;
      lead.deal_value = res.deal_value;
      lead.last_touch = now;
      lead.updated_date = now;
      scored++;
      db.activities.unshift({
        id: makeId('act'),
        lead_id: lead.id,
        lead_name: lead.full_name,
        stage: lead.stage,
        type: 'score',
        summary: `${lead.full_name} scored ${lead.score}/100 (${lead.temperature})`,
        detail: lead.score_reason,
        status: 'done',
        automated: true,
        created_date: now,
      });
    }
    if (scored > 0) bumpAutomation('lead_scoring');
  }

  if (isEnabled('offer_gate')) {
    const pendingLeadIds = new Set(
      db.approvals.filter((a) => a.status === 'pending').map((a) => a.lead_id)
    );
    const readyLeads = db.leads.filter(
      (l) =>
        (l.temperature === 'hot' || l.score >= 70) &&
        !['conversion', 'retention'].includes(l.stage) &&
        !pendingLeadIds.has(l.id)
    );
    for (const lead of readyLeads.slice(0, 3)) {
      const draft = await draftApprovalWithAI(lead, 'proposal', db.workspace, undefined, apiKey);
      lead.stage = 'proposal';
      lead.next_action = 'Awaiting owner approval in Approvals';
      lead.last_touch = now;
      lead.updated_date = now;
      const approval: Approval = {
        id: makeId('app'),
        lead_id: lead.id,
        lead_name: lead.full_name,
        lead_email: lead.email,
        kind: 'proposal',
        status: 'pending',
        subject: draft.subject,
        body: draft.body,
        offer: draft.offer,
        price: draft.price,
        confidence: draft.confidence,
        created_date: now,
        updated_date: now,
      };
      db.approvals.unshift(approval);
      proposals++;
      db.activities.unshift({
        id: makeId('act'),
        lead_id: lead.id,
        lead_name: lead.full_name,
        stage: 'proposal',
        type: 'proposal',
        summary: `Offer drafted for ${lead.full_name} — waiting in Approvals`,
        detail: `${draft.offer} ($${draft.price}) queued for one-click review.`,
        status: 'done',
        automated: true,
        created_date: now,
      });
    }
    if (proposals > 0) bumpAutomation('offer_gate');
  }

  if (isEnabled('nurture_sequence')) {
    const nurtureLeads = db.leads.filter((l) => l.stage === 'nurture' && l.temperature !== 'hot');
    if (nurtureLeads.length > 0 && scored === 0 && proposals === 0) {
      const target = nurtureLeads[0];
      target.last_touch = now;
      target.updated_date = now;
      db.activities.unshift({
        id: makeId('act'),
        lead_id: target.id,
        lead_name: target.full_name,
        stage: 'nurture',
        type: 'email',
        summary: `Nurture drip logged for ${target.full_name}`,
        detail: 'Case study & morning sequence tip delivered.',
        status: 'done',
        automated: true,
        created_date: now,
      });
      bumpAutomation('nurture_sequence');
    }
  }

  if (isEnabled('retention_30')) {
    const thirtyDaysMs = 30 * 86400 * 1000;
    const dueForRetention = db.leads.filter(
      (l) =>
        l.stage === 'conversion' &&
        l.won_at &&
        Date.now() - new Date(l.won_at).getTime() >= thirtyDaysMs
    );
    for (const lead of dueForRetention.slice(0, 2)) {
      lead.stage = 'retention';
      lead.next_action = '30-day check-in sent';
      lead.last_touch = now;
      lead.updated_date = now;
      retention++;
      db.activities.unshift({
        id: makeId('act'),
        lead_id: lead.id,
        lead_name: lead.full_name,
        stage: 'retention',
        type: 'retention',
        summary: `30-day retention check-in triggered for ${lead.full_name}`,
        detail: 'Suggested next-month protocol adjustment and Daily Stack renewal.',
        status: 'done',
        automated: true,
        created_date: now,
      });
    }
    if (retention > 0) bumpAutomation('retention_30');
  }

  return { scored, proposals, retention };
}

export async function generateCampaignKitWithAI(
  params: {
    type: Campaign['type'];
    topic: string;
    audience?: string;
    channels: string[];
  },
  ws: WorkspaceSettings,
  apiKey?: string
): Promise<Omit<Campaign, 'id' | 'created_date' | 'status'>> {
  const audience = params.audience || ws.audience;
  const fallback = () => ({
    name: params.topic.length > 42 ? `${params.topic.slice(0, 39)}...` : params.topic,
    type: params.type,
    topic: params.topic,
    promise: `A calm, repeatable protocol for ${params.topic.toLowerCase()}.`,
    audience,
    channels: params.channels,
    pieces_sent: 0,
    magnet_title: `Field Guide: ${params.topic}`,
    magnet_body: `A concise 3-day diagnostic sheet built for ${audience}. Track sleep timing, first-meal protein, and afternoon alertness without changing everything at once.`,
    landing_headline: params.topic,
    landing_subhead: `${ws.positioning} Built for ${audience}.`,
    landing_proof: 'Grounded in structured 30-day energy resets, with zero proprietary hype.',
    landing_cta: 'Get the guide',
    webinar_title: `Workshop: ${params.topic}`,
    webinar_description:
      'A 25-minute calm walkthrough of the daily anchors that move sleep and stamina first.',
    webinar_outline:
      '1. Why standard fixes miss timing\n2. Mapping your 24-hour energy curve\n3. Choosing between digital protocol, stack, or 1:1 audit\n4. Live Q&A',
    emails: [
      {
        day: 0,
        subject: `Your guide: ${params.topic}`,
        body: `Here is the breakdown you requested. Start with the morning timing shift tomorrow and note what changes by 3pm.`,
      },
      {
        day: 3,
        subject: 'The single lever most people miss on day three',
        body: `When people test ${params.topic.toLowerCase()}, consistency beats intensity. Keep the evening wind-down fixed for 72 hours.`,
      },
      {
        day: 7,
        subject: 'Ready to turn this into a 30-day plan?',
        body: `If you want the full sequence, the 30-Day Energy Reset Protocol ($29) maps every morning and evening step.`,
      },
    ],
    social: params.channels.map((ch) => ({
      channel: ch,
      hook: `${params.topic} — what actually moves the needle.`,
      body: `Most advice ignores timing. Anchor light, meal one, and caffeine cutoffs for seven days before adding another pill.`,
      cta: `Reply or visit sunmedx.app for the 30-day reset.`,
    })),
  });

  const prompt = `Generate a Sunmedx marketing campaign kit in JSON.
Brand: ${ws.brand}
Tone: ${ws.tone}
Audience: ${audience}
Offers: ${JSON.stringify(ws.offers)}
Kit type: ${params.type}
Topic: ${params.topic}
Target channels: ${params.channels.join(', ')}

Return strictly valid JSON:
{
  "name": string (short kit title),
  "promise": string (1 sentence value promise),
  "magnet_title": string,
  "magnet_body": string,
  "landing_headline": string,
  "landing_subhead": string,
  "landing_proof": string,
  "landing_cta": string,
  "webinar_title": string,
  "webinar_description": string,
  "webinar_outline": string,
  "emails": [{ "day": number, "subject": string, "body": string }],
  "social": [{ "channel": string, "hook": string, "body": string, "cta": string }]
}`;

  const generated = await generateJson(prompt, fallback, apiKey);
  const fb = fallback();
  return {
    name: generated.name || fb.name,
    type: params.type,
    topic: params.topic,
    promise: generated.promise || fb.promise,
    audience,
    channels: params.channels,
    pieces_sent: 0,
    magnet_title: generated.magnet_title || fb.magnet_title,
    magnet_body: generated.magnet_body || fb.magnet_body,
    landing_headline: generated.landing_headline || fb.landing_headline,
    landing_subhead: generated.landing_subhead || fb.landing_subhead,
    landing_proof: generated.landing_proof || fb.landing_proof,
    landing_cta: generated.landing_cta || fb.landing_cta,
    webinar_title: generated.webinar_title || fb.webinar_title,
    webinar_description: generated.webinar_description || fb.webinar_description,
    webinar_outline: generated.webinar_outline || fb.webinar_outline,
    emails: Array.isArray(generated.emails) && generated.emails.length ? generated.emails : fb.emails,
    social: Array.isArray(generated.social) && generated.social.length ? generated.social : fb.social,
  };
}

export async function generateContentPieceWithAI(
  channel: string,
  topic: string,
  ws: WorkspaceSettings,
  apiKey?: string
): Promise<Omit<ContentPiece, 'id' | 'created_date' | 'status'>> {
  const fallback = () => ({
    title: topic,
    channel,
    hook: `${topic} — the quiet signal most people overlook.`,
    body: `Before adding another routine, check the sequence: morning light within 20 minutes, protein at meal one, and a clean caffeine cutoff.\n\nWhen those three hold, energy stops swinging across the afternoon.`,
    cta: 'Start the 30-day reset at sunmedx.app',
  });

  const prompt = `Write one ${channel} content piece for ${ws.brand}.
Tone: ${ws.tone}
Audience: ${ws.audience}
Topic: ${topic}

Return strictly valid JSON:
{
  "title": string,
  "hook": string,
  "body": string,
  "cta": string
}`;

  const g = await generateJson(prompt, fallback, apiKey);
  const fb = fallback();
  return {
    title: g.title || fb.title,
    channel,
    hook: g.hook || fb.hook,
    body: g.body || fb.body,
    cta: g.cta || fb.cta,
  };
}

export async function designExperimentWithAI(
  topic: string,
  ws: WorkspaceSettings,
  apiKey?: string
): Promise<Omit<Experiment, 'id' | 'created_date'>> {
  const fallback = () => ({
    name: topic,
    hypothesis:
      'Framing around predictable daily energy outperforms generic symptom language for busy professionals.',
    metric: 'Lead capture rate',
    variant_a: `${topic} — control copy`,
    variant_b: `Predictable energy in 30 days — ${topic.toLowerCase()}`,
    a_visits: 40,
    a_conversions: 3,
    b_visits: 40,
    b_conversions: 6,
    winner: 'undecided' as const,
  });

  const prompt = `Design an A/B funnel copy test for ${ws.brand}.
Tone: ${ws.tone}
Topic: ${topic}

Return strictly valid JSON:
{
  "name": string,
  "hypothesis": string,
  "metric": string,
  "variant_a": string,
  "variant_b": string
}`;

  const g = await generateJson(prompt, fallback, apiKey);
  const fb = fallback();
  return {
    ...fb,
    name: g.name || fb.name,
    hypothesis: g.hypothesis || fb.hypothesis,
    metric: g.metric || fb.metric,
    variant_a: g.variant_a || fb.variant_a,
    variant_b: g.variant_b || fb.variant_b,
  };
}

export async function judgeExperimentWithAI(
  exp: Experiment,
  ws: WorkspaceSettings,
  apiKey?: string
): Promise<{ winner: 'undecided' | 'A' | 'B'; insight: string }> {
  const rateA = exp.a_visits ? exp.a_conversions / exp.a_visits : 0;
  const rateB = exp.b_visits ? exp.b_conversions / exp.b_visits : 0;
  const totalVisits = exp.a_visits + exp.b_visits;

  const fallback = () => {
    if (totalVisits < 50 || Math.abs(rateA - rateB) < 0.02) {
      return {
        winner: 'undecided' as const,
        insight: `Sample is still close (${Math.round(rateA * 100)}% vs ${Math.round(rateB * 100)}%). Collect another 40 visits per variant before promoting one.`,
      };
    }
    const winner = rateB >= rateA ? ('B' as const) : ('A' as const);
    const winRate = Math.round((winner === 'B' ? rateB : rateA) * 100);
    const loseRate = Math.round((winner === 'B' ? rateA : rateB) * 100);
    return {
      winner,
      insight: `Variant ${winner} leads at ${winRate}% vs ${loseRate}% on ${exp.metric}. Promote Variant ${winner} to the top of the funnel and test a sharper subhead next.`,
    };
  };

  const prompt = `Judge this A/B test for ${ws.brand}:
Name: ${exp.name}
Hypothesis: ${exp.hypothesis}
Metric: ${exp.metric}
Variant A: "${exp.variant_a}" (${exp.a_conversions}/${exp.a_visits})
Variant B: "${exp.variant_b}" (${exp.b_conversions}/${exp.b_visits})

Return strictly valid JSON:
{
  "winner": "A" | "B" | "undecided",
  "insight": string (1-2 calm, actionable sentences)
}`;

  const g = await generateJson(prompt, fallback, apiKey);
  const fb = fallback();
  const winner =
    g.winner === 'A' || g.winner === 'B' || g.winner === 'undecided' ? g.winner : fb.winner;
  return {
    winner,
    insight: g.insight || fb.insight,
  };
}

export async function chatWithVisitorAI(
  messages: Array<{ role: string; content: string }>,
  db: SunmedxDatabase,
  apiKey?: string
): Promise<{ reply: string; capturedLead?: Lead }> {
  const ws = db.workspace;
  const visitorText = messages
    .filter((m) => m.role === 'visitor' || m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  const emailMatch = visitorText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  let capturedLead: Lead | undefined;

  if (emailMatch) {
    const email = emailMatch[0].toLowerCase();
    const existing = db.leads.find((l) => l.email.toLowerCase() === email);
    const now = new Date().toISOString();

    if (!existing) {
      const nameMatch =
        visitorText.match(/(?:i'm|i am|name is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) ||
        visitorText.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)/);
      const derivedName = nameMatch
        ? nameMatch[1].trim()
        : email
            .split('@')[0]
            .replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

      const interest = /audit|1:1|call|coach/i.test(visitorText)
        ? '1:1 wellness audit'
        : /stack|supplement|pill/i.test(visitorText)
          ? 'Daily stack'
          : 'Digital protocol';

      const newLead: Lead = {
        id: makeId('lead'),
        full_name: derivedName,
        email,
        interest,
        source: 'AI chat',
        stage: 'awareness',
        temperature: 'warm',
        score: 0,
        need_signal: visitorText.slice(0, 140),
        budget_signal: 'Not stated yet',
        timeline_signal: 'Active chat inquiry',
        notes: 'Captured automatically via public landing page assistant.',
        next_action: 'Score lead and suggest best offer',
        deal_value: interest === '1:1 wellness audit' ? 180 : interest === 'Daily stack' ? 59 : 29,
        last_touch: now,
        created_date: now,
        updated_date: now,
      };
      db.leads.unshift(newLead);
      db.activities.unshift({
        id: makeId('act'),
        lead_id: newLead.id,
        lead_name: newLead.full_name,
        stage: 'awareness',
        type: 'chat',
        summary: `${newLead.full_name} captured from landing page chat`,
        detail: visitorText.slice(0, 120),
        status: 'done',
        automated: true,
        created_date: now,
      });
      capturedLead = newLead;
    }
  }

  const offersSummary = ws.offers
    .map((o) => `${o.name} ($${o.price}, ${o.kind}): ${o.promise}`)
    .join('\n');

  const prompt = `You are the ${ws.brand} public landing page assistant.
Voice & tone: ${ws.tone}
Positioning: ${ws.positioning}
Offers:
${offersSummary}

Rules:
- Keep answers short (2-4 sentences), calm, and practical. No exclamation marks, no medical claims.
- Ask about their sleep, afternoon energy, or stress window, or recommend ONE matching Sunmedx offer.
- If they have not shared an email yet and seem interested, invite them to share their email so the founder can follow up personally.
- If they just shared their email, confirm we saved their note and will follow up personally.

Conversation:
${messages.map((m) => `${m.role}: ${m.content}`).join('\n')}
assistant:`;

  const reply = await generateText(prompt, () => {
    if (emailMatch) {
      return `Got it — I have passed your note and ${emailMatch[0]} along so the founder can follow up personally. In the meantime, the 30-Day Energy Reset Protocol ($29) is the cleanest place to start.`;
    }
    const last = messages[messages.length - 1]?.content.toLowerCase() || '';
    if (last.includes('sleep') || last.includes('wake') || last.includes('tired')) {
      return `Broken sleep or a mid-afternoon dip usually comes down to timing before supplements. If you want a structured sequence you can run tomorrow, look at the 30-Day Energy Reset Protocol ($29) — or drop your email here and tell me what time you usually crash.`;
    }
    if (last.includes('price') || last.includes('cost') || last.includes('offer')) {
      return `There are three ways to start: the 30-Day Energy Reset Protocol ($29), the Daily Stack ($59), or a 1:1 Wellness Audit ($180) with the founder. Share what you are trying to fix and your email if you would like a personal recommendation.`;
    }
    return `Tell me a little about when your energy drops during the day or how you have been sleeping. Once I know what is off, I can point you to the single Sunmedx offer that fits — or drop your email if you want the founder to reply directly.`;
  }, apiKey);

  return { reply, capturedLead };
}

export async function generatePromoEmailWithAI(
  params: {
    goal: string;
    category?: 'brand_promo' | 'launch' | 'nurture' | 'winback';
    theme?: 'sunrise' | 'midnight' | 'minimal';
    appUrl?: string;
  },
  ws: WorkspaceSettings,
  apiKey?: string
): Promise<{
  name: string;
  category: 'brand_promo' | 'launch' | 'nurture' | 'winback';
  theme: 'sunrise' | 'midnight' | 'minimal';
  subject: string;
  preheader: string;
  badge: string;
  headline: string;
  body: string;
  offer_title: string;
  offer_price: string;
  cta_label: string;
  cta_url: string;
  logo_url: string;
  sender_name: string;
  sender_role: string;
  sender_email: string;
  sender_website: string;
  sender_address: string;
  footer_note: string;
}> {
  const category = params.category || 'brand_promo';
  const theme = params.theme || 'sunrise';
  const brand = ws.brand || 'Sunmedx';
  const offer = ws.offers?.[0];
  const appUrl = params.appUrl || 'https://sunmedx-funnel.workers.dev';

  const fallback = () => ({
    name: `${brand} · ${params.goal.slice(0, 36)}`,
    category,
    theme,
    subject: `${params.goal} — a calmer plan from ${brand}`,
    preheader: `${ws.positioning} Built for steady daily focus.`,
    badge:
      category === 'launch'
        ? 'New Release'
        : category === 'winback'
          ? 'Check-In Offer'
          : 'Brand Promotion',
    headline: params.goal.length > 10 ? params.goal : ws.landing_headline,
    body: `Hi {{first_name}},\n\nIf you have tried complicated routines that never stuck, you are not alone — timing matters more than piling on extra steps.\n\n${brand} keeps it practical: ${ws.positioning} No bloated stack, no guesswork — just one clear daily rhythm.\n\nClick below to explore the full plan and start this week.`,
    offer_title: offer ? `${offer.name} — ${offer.promise}` : '30-Day Energy Reset Protocol',
    offer_price: offer ? `$${offer.price}` : '$29',
    cta_label: 'Explore the Protocol',
    cta_url: appUrl,
    logo_url: '/sunmedx-logo.png',
    sender_name: `${brand} Team`,
    sender_role: ws.positioning || 'Precision wellness protocols',
    sender_email: '',
    sender_website: appUrl,
    sender_address: 'Delivered via Brevo · Reply directly anytime',
    footer_note: `You received this brand update from ${brand}. Reply directly if you have any questions.`,
  });

  const prompt = `Write a high-converting brand promotion email template in JSON for ${brand}.
Voice & tone: ${ws.tone}
Positioning: ${ws.positioning}
Audience: ${ws.audience}
Offers: ${JSON.stringify(ws.offers)}
Promotion goal / angle: ${params.goal}
Category: ${category}

Rules:
- Use "{{first_name}}" in the greeting inside body.
- Address the reader directly ("you"), never third-person ("they").
- Keep copy crisp, credible, and persuasion-focused without spammy hype.
- Return strictly valid JSON with keys:
{
  "name": string (short internal template title),
  "subject": string (compelling subject line under 65 chars),
  "preheader": string (inbox preview line under 90 chars),
  "badge": string (2-3 word eyebrow tag like "BRAND PROMOTION"),
  "headline": string (strong hero headline),
  "body": string (2-4 short paragraphs separated by \\n\\n),
  "offer_title": string (featured offer & short promise),
  "offer_price": string (e.g. "$29"),
  "cta_label": string (2-4 word button label)
}`;

  const g = await generateJson(prompt, fallback, apiKey);
  const fb = fallback();
  return {
    name: g.name || fb.name,
    category,
    theme,
    subject: g.subject || fb.subject,
    preheader: g.preheader || fb.preheader,
    badge: g.badge || fb.badge,
    headline: g.headline || fb.headline,
    body: g.body || fb.body,
    offer_title: g.offer_title || fb.offer_title,
    offer_price: g.offer_price || fb.offer_price,
    cta_label: g.cta_label || fb.cta_label,
    cta_url: appUrl,
    logo_url: fb.logo_url,
    sender_name: fb.sender_name,
    sender_role: fb.sender_role,
    sender_email: fb.sender_email,
    sender_website: fb.sender_website,
    sender_address: fb.sender_address,
    footer_note: fb.footer_note,
  };
}

