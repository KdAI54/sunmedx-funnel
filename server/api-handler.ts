import type { Campaign, ContentPiece, Lead } from '../src/types/funnel.ts';
import {
  chatWithVisitorAI,
  designExperimentWithAI,
  draftApprovalWithAI,
  generateCampaignKitWithAI,
  generateContentPieceWithAI,
  judgeExperimentWithAI,
  runAutopilotCycle,
  scoreLeadWithAI,
} from './ai.ts';
import {
  createInitialDb,
  ensureCatalogChannels,
  makeId,
  type SunmedxDatabase,
} from './seed.ts';

export interface DbAdapter {
  load(): Promise<SunmedxDatabase> | SunmedxDatabase;
  save(db: SunmedxDatabase): Promise<void> | void;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface ApiRuntimeInfo {
  environment?: string;
  appName?: string;
  appUrl?: string;
  storage?: string;
}

export async function handleApiRequest(
  request: Request,
  storage: DbAdapter,
  geminiApiKey?: string,
  runtimeInfo?: ApiRuntimeInfo
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  try {
    if (method === 'GET' && pathname === '/api/health') {
      const activeStorage = runtimeInfo?.storage || 'local-json';
      return json({
        ok: true,
        service: 'sunmedx-funnel-autopilot',
        environment: runtimeInfo?.environment || 'development',
        storage: activeStorage,
        cloudflarePersistent:
          activeStorage === 'cloudflare-kv' || activeStorage === 'cloudflare-d1',
        aiConfigured: Boolean(geminiApiKey),
      });
    }

    // Full state snapshot & restore for persistent cross-session mirror
    if (method === 'GET' && pathname === '/api/state') {
      const db = await storage.load();
      db.channels = ensureCatalogChannels(db.channels || []);
      return json(db);
    }

    if (method === 'PUT' && pathname === '/api/state') {
      const current = await storage.load();
      const body = await readBody(request);
      const base = createInitialDb();
      const next: SunmedxDatabase = {
        workspace: body.workspace
          ? {
              ...current.workspace,
              ...(body.workspace as Partial<SunmedxDatabase['workspace']>),
              id: current.workspace.id,
            }
          : current.workspace,
        leads: Array.isArray(body.leads)
          ? (body.leads as SunmedxDatabase['leads'])
          : current.leads,
        approvals: Array.isArray(body.approvals)
          ? (body.approvals as SunmedxDatabase['approvals'])
          : current.approvals,
        activities: Array.isArray(body.activities)
          ? (body.activities as SunmedxDatabase['activities'])
          : current.activities,
        automations: Array.isArray(body.automations)
          ? (body.automations as SunmedxDatabase['automations'])
          : current.automations.length
            ? current.automations
            : base.automations,
        channels: ensureCatalogChannels(
          Array.isArray(body.channels)
            ? (body.channels as SunmedxDatabase['channels'])
            : current.channels
        ),
        campaigns: Array.isArray(body.campaigns)
          ? (body.campaigns as SunmedxDatabase['campaigns'])
          : current.campaigns,
        content: Array.isArray(body.content)
          ? (body.content as SunmedxDatabase['content'])
          : current.content,
        experiments: Array.isArray(body.experiments)
          ? (body.experiments as SunmedxDatabase['experiments'])
          : current.experiments,
      };
      await storage.save(next);
      return json({ ok: true, state: next });
    }

    // Public brand config for /site
    if (method === 'GET' && pathname === '/api/brand') {
      const db = await storage.load();
      return json({
        brand: {
          brand: db.workspace.brand,
          headline: db.workspace.landing_headline,
          subhead: db.workspace.landing_subhead,
          greeting: db.workspace.chat_greeting,
          offers: db.workspace.offers,
        },
      });
    }

    // Workspace settings
    if (method === 'GET' && pathname === '/api/workspace') {
      const db = await storage.load();
      return json(db.workspace);
    }

    if (method === 'PUT' && pathname === '/api/workspace') {
      const db = await storage.load();
      const body = await readBody(request);
      db.workspace = {
        ...db.workspace,
        ...(body as Partial<typeof db.workspace>),
        id: db.workspace.id,
      };
      await storage.save(db);
      return json(db.workspace);
    }

    // Leads
    if (method === 'GET' && pathname === '/api/leads') {
      const db = await storage.load();
      const items = [...db.leads];
      const sort = url.searchParams.get('sort') || '-created_date';
      if (sort === '-score') {
        items.sort((a, b) => (b.score || 0) - (a.score || 0));
      } else {
        items.sort(
          (a, b) =>
            new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
        );
      }
      return json({ items });
    }

    if (method === 'POST' && pathname === '/api/leads') {
      const db = await storage.load();
      const now = new Date().toISOString();
      const body = await readBody(request);
      if (!body.full_name || !String(body.full_name).trim()) {
        return json({ error: 'Name is required' }, 400);
      }
      const lead: Lead = {
        id: makeId('lead'),
        full_name: String(body.full_name).trim(),
        email: String(body.email || '').trim().toLowerCase(),
        interest: String(body.interest || 'Digital protocol'),
        source: String(body.source || 'Manual'),
        stage: (body.stage as Lead['stage']) || 'awareness',
        temperature: (body.temperature as Lead['temperature']) || 'warm',
        score: Number(body.score) || 0,
        need_signal: String(body.need_signal || ''),
        budget_signal: String(body.budget_signal || ''),
        timeline_signal: String(body.timeline_signal || ''),
        notes: String(body.notes || ''),
        next_action: String(
          body.next_action || 'Score the lead and send the first nurture email'
        ),
        deal_value: Number(body.deal_value) || 29,
        last_touch: now,
        created_date: now,
        updated_date: now,
      };
      db.leads.unshift(lead);
      db.activities.unshift({
        id: makeId('act'),
        lead_id: lead.id,
        lead_name: lead.full_name,
        stage: lead.stage,
        type: 'note',
        summary: `${lead.full_name} added to the top of the funnel`,
        detail: `Source: ${lead.source} · Interest: ${lead.interest}`,
        status: 'done',
        automated: false,
        created_date: now,
      });
      await storage.save(db);
      return json(lead, 201);
    }

    const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
    if (leadMatch) {
      const leadId = decodeURIComponent(leadMatch[1]);
      if (method === 'GET') {
        const db = await storage.load();
        const lead = db.leads.find((l) => l.id === leadId);
        if (!lead) return json({ error: 'Lead not found' }, 404);
        return json(lead);
      }
      if (method === 'PATCH') {
        const db = await storage.load();
        const idx = db.leads.findIndex((l) => l.id === leadId);
        if (idx === -1) return json({ error: 'Lead not found' }, 404);
        const body = await readBody(request);
        const now = new Date().toISOString();
        db.leads[idx] = {
          ...db.leads[idx],
          ...(body as Partial<Lead>),
          updated_date: now,
        };
        await storage.save(db);
        return json(db.leads[idx]);
      }
    }

    // Approvals
    if (method === 'GET' && pathname === '/api/approvals') {
      const db = await storage.load();
      let items = [...db.approvals];
      const status = url.searchParams.get('status');
      if (status) {
        items = items.filter((a) => a.status === status);
      }
      items.sort(
        (a, b) =>
          new Date(b.updated_date || b.created_date).getTime() -
          new Date(a.updated_date || a.created_date).getTime()
      );
      return json({ items });
    }

    const approvalSendMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/send$/);
    if (method === 'POST' && approvalSendMatch) {
      const approvalId = decodeURIComponent(approvalSendMatch[1]);
      const db = await storage.load();
      const idx = db.approvals.findIndex((a) => a.id === approvalId);
      if (idx === -1) return json({ ok: false, error: 'Approval not found' }, 404);

      const bodyData = await readBody(request);
      const item = db.approvals[idx];
      const now = new Date().toISOString();
      const subject = String(bodyData.subject ?? item.subject).trim();
      const body = String(bodyData.body ?? item.body).trim();

      if (!item.lead_email) {
        return json({
          ok: false,
          error: 'This lead has no email address yet. Add an email before sending.',
        });
      }
      if (!subject || !body) {
        return json({
          ok: false,
          error: 'Subject and email body cannot be empty.',
        });
      }

      db.approvals[idx] = {
        ...item,
        subject,
        body,
        status: 'sent',
        send_error: undefined,
        updated_date: now,
      };

      const lead = db.leads.find((l) => l.id === item.lead_id);
      if (lead) {
        lead.last_touch = now;
        lead.updated_date = now;
        lead.next_action =
          item.kind === 'proposal' ? 'Follow up on sent offer' : 'Await buyer reply';
      }

      db.activities.unshift({
        id: makeId('act'),
        lead_id: item.lead_id,
        lead_name: item.lead_name,
        stage: lead?.stage || 'proposal',
        type: item.kind === 'proposal' ? 'proposal' : 'reply',
        summary: `${item.kind === 'proposal' ? 'Offer' : 'Reply'} approved & sent to ${item.lead_name}`,
        detail: subject,
        status: 'done',
        automated: false,
        created_date: now,
      });

      await storage.save(db);
      return json({ ok: true, approval: db.approvals[idx] });
    }

    const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/);
    if (method === 'PATCH' && approvalMatch) {
      const approvalId = decodeURIComponent(approvalMatch[1]);
      const db = await storage.load();
      const idx = db.approvals.findIndex((a) => a.id === approvalId);
      if (idx === -1) return json({ error: 'Approval not found' }, 404);
      const body = await readBody(request);
      const now = new Date().toISOString();
      db.approvals[idx] = {
        ...db.approvals[idx],
        ...(body as Partial<(typeof db.approvals)[number]>),
        updated_date: now,
      };
      if (body.status === 'rejected') {
        db.activities.unshift({
          id: makeId('act'),
          lead_id: db.approvals[idx].lead_id,
          lead_name: db.approvals[idx].lead_name,
          type: 'note',
          summary: `Draft rejected for ${db.approvals[idx].lead_name}`,
          detail: db.approvals[idx].subject,
          status: 'done',
          automated: false,
          created_date: now,
        });
      }
      await storage.save(db);
      return json(db.approvals[idx]);
    }

    // Activities
    if (method === 'GET' && pathname === '/api/activities') {
      const db = await storage.load();
      let items = [...db.activities];
      const leadId = url.searchParams.get('lead_id');
      const status = url.searchParams.get('status');
      if (leadId) {
        items = items.filter((a) => a.lead_id === leadId);
      }
      if (status) {
        items = items.filter((a) => a.status === status);
      }
      items.sort(
        (a, b) =>
          new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
      );
      const limit = Number(url.searchParams.get('limit')) || 120;
      return json({ items: items.slice(0, limit) });
    }

    if (method === 'POST' && pathname === '/api/activities') {
      const db = await storage.load();
      const body = await readBody(request);
      const now = new Date().toISOString();
      const act = {
        id: makeId('act'),
        lead_id: body.lead_id ? String(body.lead_id) : undefined,
        lead_name: body.lead_name ? String(body.lead_name) : undefined,
        stage: body.stage ? (String(body.stage) as Lead['stage']) : undefined,
        type: (body.type as (typeof db.activities)[number]['type']) || 'note',
        summary: String(body.summary || 'Activity recorded'),
        detail: String(body.detail || ''),
        status: (body.status as (typeof db.activities)[number]['status']) || 'done',
        automated: Boolean(body.automated),
        created_date: now,
      };
      db.activities.unshift(act);
      await storage.save(db);
      return json(act, 201);
    }

    // Automations
    if (method === 'GET' && pathname === '/api/automations') {
      const db = await storage.load();
      return json({ items: db.automations });
    }

    const automationMatch = pathname.match(/^\/api\/automations\/([^/]+)$/);
    if (method === 'PATCH' && automationMatch) {
      const autoId = decodeURIComponent(automationMatch[1]);
      const db = await storage.load();
      const idx = db.automations.findIndex((a) => a.id === autoId);
      if (idx === -1) return json({ error: 'Automation not found' }, 404);
      const body = await readBody(request);
      db.automations[idx] = {
        ...db.automations[idx],
        ...(body as Partial<(typeof db.automations)[number]>),
      };
      await storage.save(db);
      return json(db.automations[idx]);
    }

    // Channels
    if (method === 'GET' && pathname === '/api/channels') {
      const db = await storage.load();
      let items = ensureCatalogChannels(db.channels || []);
      if (url.searchParams.get('enabled') === 'true') {
        items = items.filter((c) => c.enabled);
      }
      return json({ items });
    }

    if (method === 'GET' && pathname === '/api/channels/connections') {
      const db = await storage.load();
      const channels = ensureCatalogChannels(db.channels || []);
      const map: Record<string, boolean> = {};
      for (const ch of channels) {
        if (ch.integration) {
          map[ch.integration] = Boolean(
            ch.connected ||
              ch.handle?.trim() ||
              ch.account_id?.trim() ||
              ch.sender_email?.trim() ||
              ch.wizard_completed
          );
        }
      }
      return json(map);
    }

    if (method === 'PUT' && pathname === '/api/channels/bulk') {
      const db = await storage.load();
      db.channels = ensureCatalogChannels(db.channels || []);
      const body = await readBody(request);
      const incoming = Array.isArray(body.channels) ? body.channels : [];
      for (const rawRow of incoming) {
        const row = rawRow as Partial<(typeof db.channels)[number]>;
        const idx = db.channels.findIndex((c) => c.key === row.key);
        const existing = idx >= 0 ? db.channels[idx] : undefined;
        const handle = String(row.handle ?? existing?.handle ?? '');
        const account_id = String(row.account_id ?? existing?.account_id ?? '');
        const sender_email = String(row.sender_email ?? existing?.sender_email ?? '');
        const secret_env_key = String(row.secret_env_key ?? existing?.secret_env_key ?? '');
        const wizard_completed =
          typeof row.wizard_completed === 'boolean'
            ? row.wizard_completed
            : existing?.wizard_completed || false;
        const connected =
          (row.kind || existing?.kind) === 'web' ||
          Boolean(handle.trim() || account_id.trim() || sender_email.trim() || wizard_completed);
        if (idx >= 0) {
          db.channels[idx] = {
            ...db.channels[idx],
            ...row,
            handle,
            account_id,
            sender_email,
            secret_env_key,
            wizard_completed,
            connected,
          };
        } else {
          db.channels.push({
            id: makeId('ch'),
            key: String(row.key || makeId('k')),
            name: String(row.name || 'Channel'),
            kind: row.kind || 'social',
            integration: String(row.integration || ''),
            handle,
            account_id,
            sender_email,
            secret_env_key,
            wizard_completed,
            automation_key: String(row.automation_key || 'nurture_sequence'),
            delay_days: Number(row.delay_days) || 0,
            cadence: String(row.cadence || ''),
            enabled: Boolean(row.enabled),
            connected,
          });
        }
      }
      await storage.save(db);
      return json({ items: db.channels });
    }

    // Campaigns (Lead engine)
    if (method === 'GET' && pathname === '/api/campaigns') {
      const db = await storage.load();
      const items = [...db.campaigns].sort(
        (a, b) =>
          new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
      );
      return json({ items });
    }

    const campaignActivateMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/activate$/);
    if (method === 'POST' && campaignActivateMatch) {
      const campId = decodeURIComponent(campaignActivateMatch[1]);
      const db = await storage.load();
      const idx = db.campaigns.findIndex((c) => c.id === campId);
      if (idx === -1) return json({ error: 'Campaign not found' }, 404);
      const kit = db.campaigns[idx];
      const now = new Date().toISOString();
      const channelMap = new Map(db.channels.map((c) => [c.name.toLowerCase(), c]));
      for (const chName of kit.channels || []) {
        const ch = channelMap.get(String(chName).toLowerCase());
        const suffix = ch?.automation_key
          ? ` · ${ch.automation_key.replace(/_/g, ' ')}`
          : '';
        db.activities.unshift({
          id: makeId('act'),
          type: 'content',
          summary: `Kit live on ${chName}${suffix}`,
          detail: kit.promise || kit.topic,
          status: 'done',
          automated: true,
          created_date: now,
        });
      }
      db.campaigns[idx] = {
        ...kit,
        status: 'active',
        activated_at: now,
      };
      await storage.save(db);
      return json(db.campaigns[idx]);
    }

    const campaignMatch = pathname.match(/^\/api\/campaigns\/([^/]+)$/);
    if (campaignMatch) {
      const campId = decodeURIComponent(campaignMatch[1]);
      if (method === 'GET') {
        const db = await storage.load();
        const camp = db.campaigns.find((c) => c.id === campId);
        if (!camp) return json({ error: 'Campaign not found' }, 404);
        return json(camp);
      }
      if (method === 'PATCH') {
        const db = await storage.load();
        const idx = db.campaigns.findIndex((c) => c.id === campId);
        if (idx === -1) return json({ error: 'Campaign not found' }, 404);
        const body = await readBody(request);
        db.campaigns[idx] = {
          ...db.campaigns[idx],
          ...(body as Partial<Campaign>),
        };
        await storage.save(db);
        return json(db.campaigns[idx]);
      }
    }

    // Content Studio
    if (method === 'GET' && pathname === '/api/content') {
      const db = await storage.load();
      const items = [...db.content].sort(
        (a, b) =>
          new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
      );
      return json({ items });
    }

    if (method === 'POST' && pathname === '/api/content/bulk') {
      const db = await storage.load();
      const body = await readBody(request);
      const pieces = Array.isArray(body.pieces) ? body.pieces : [];
      const now = new Date().toISOString();
      const created: ContentPiece[] = pieces.map((raw) => {
        const p = raw as Partial<ContentPiece>;
        return {
          id: makeId('cnt'),
          title: p.title || 'Untitled piece',
          channel: p.channel || 'Instagram',
          hook: p.hook || '',
          body: p.body || '',
          cta: p.cta || '',
          status: p.status || 'draft',
          created_date: now,
        };
      });
      db.content.unshift(...created);
      await storage.save(db);
      return json({ items: created }, 201);
    }

    const contentMatch = pathname.match(/^\/api\/content\/([^/]+)$/);
    if (method === 'PATCH' && contentMatch) {
      const cntId = decodeURIComponent(contentMatch[1]);
      const db = await storage.load();
      const idx = db.content.findIndex((c) => c.id === cntId);
      if (idx === -1) return json({ error: 'Content piece not found' }, 404);
      const body = await readBody(request);
      db.content[idx] = {
        ...db.content[idx],
        ...(body as Partial<ContentPiece>),
      };
      await storage.save(db);
      return json(db.content[idx]);
    }

    // Experiments
    if (method === 'GET' && pathname === '/api/experiments') {
      const db = await storage.load();
      const items = [...db.experiments].sort(
        (a, b) =>
          new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
      );
      return json({ items });
    }

    const experimentMatch = pathname.match(/^\/api\/experiments\/([^/]+)$/);
    if (method === 'PATCH' && experimentMatch) {
      const expId = decodeURIComponent(experimentMatch[1]);
      const db = await storage.load();
      const idx = db.experiments.findIndex((e) => e.id === expId);
      if (idx === -1) return json({ error: 'Experiment not found' }, 404);
      const body = await readBody(request);
      db.experiments[idx] = {
        ...db.experiments[idx],
        ...(body as Partial<(typeof db.experiments)[number]>),
      };
      await storage.save(db);
      return json(db.experiments[idx]);
    }

    // AI Endpoints
    if (method === 'POST' && pathname === '/api/ai/autopilot') {
      const db = await storage.load();
      const summary = await runAutopilotCycle(db, geminiApiKey);
      await storage.save(db);
      return json(summary);
    }

    if (method === 'POST' && pathname === '/api/ai/score') {
      const db = await storage.load();
      const body = await readBody(request);
      const lead = db.leads.find((l) => l.id === body.leadId);
      if (!lead) return json({ error: 'Lead not found' }, 404);
      const scored = await scoreLeadWithAI(lead, db.workspace, geminiApiKey);
      const now = new Date().toISOString();
      lead.score = scored.score;
      lead.temperature = scored.temperature;
      lead.stage = scored.stage;
      lead.score_reason = scored.score_reason;
      lead.next_action = scored.next_action;
      lead.deal_value = scored.deal_value;
      lead.last_touch = now;
      lead.updated_date = now;

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

      const scoreAuto = db.automations.find((a) => a.key === 'lead_scoring');
      if (scoreAuto) {
        scoreAuto.run_count = (scoreAuto.run_count || 0) + 1;
        scoreAuto.last_run = now;
      }

      await storage.save(db);
      return json(lead);
    }

    if (method === 'POST' && pathname === '/api/ai/draft') {
      const db = await storage.load();
      const body = await readBody(request);
      const lead = db.leads.find((l) => l.id === body.leadId);
      if (!lead) return json({ error: 'Lead not found' }, 404);
      const kind: 'reply' | 'proposal' = body.kind === 'reply' ? 'reply' : 'proposal';
      const draft = await draftApprovalWithAI(
        lead,
        kind,
        db.workspace,
        body.context ? String(body.context) : undefined,
        geminiApiKey
      );
      const now = new Date().toISOString();
      const approval = {
        id: makeId('app'),
        lead_id: lead.id,
        lead_name: lead.full_name,
        lead_email: lead.email,
        kind,
        status: 'pending' as const,
        subject: draft.subject,
        body: draft.body,
        offer: draft.offer,
        price: draft.price,
        confidence: draft.confidence,
        created_date: now,
        updated_date: now,
      };
      db.approvals.unshift(approval);
      lead.last_touch = now;
      lead.updated_date = now;
      if (kind === 'proposal' && !['conversion', 'retention'].includes(lead.stage)) {
        lead.stage = 'proposal';
      }
      db.activities.unshift({
        id: makeId('act'),
        lead_id: lead.id,
        lead_name: lead.full_name,
        stage: lead.stage,
        type: kind === 'reply' ? 'reply' : 'proposal',
        summary: `${kind === 'reply' ? 'Reply' : 'Offer'} drafted for ${lead.full_name} — waiting in Approvals`,
        detail: draft.subject,
        status: 'done',
        automated: true,
        created_date: now,
      });
      await storage.save(db);
      return json(approval, 201);
    }

    if (method === 'POST' && pathname === '/api/ai/campaign') {
      const db = await storage.load();
      const body = await readBody(request);
      const type = (body.type as Campaign['type']) || 'full_campaign';
      const topic = body.topic;
      const audience = body.audience;
      const channels = Array.isArray(body.channels)
        ? body.channels.map(String)
        : ['Instagram', 'Email'];
      if (!topic || String(topic).trim().length < 4) {
        return json({ error: 'Topic is required' }, 400);
      }
      const kitData = await generateCampaignKitWithAI(
        {
          type,
          topic: String(topic).trim(),
          audience: audience ? String(audience).trim() : undefined,
          channels,
        },
        db.workspace,
        geminiApiKey
      );
      const now = new Date().toISOString();
      const campaign: Campaign = {
        id: makeId('camp'),
        ...kitData,
        status: 'draft',
        created_date: now,
      };
      db.campaigns.unshift(campaign);
      db.activities.unshift({
        id: makeId('act'),
        type: 'content',
        summary: `Campaign kit generated: ${campaign.name}`,
        detail: `${campaign.emails?.length || 0} emails · ${campaign.social?.length || 0} posts`,
        status: 'done',
        automated: true,
        created_date: now,
      });
      await storage.save(db);
      return json(campaign, 201);
    }

    if (method === 'POST' && pathname === '/api/ai/content') {
      const db = await storage.load();
      const body = await readBody(request);
      const channel = String(body.channel || 'Instagram');
      const topic = body.topic;
      if (!topic || String(topic).trim().length < 4) {
        return json({ error: 'Topic is required' }, 400);
      }
      const pieceData = await generateContentPieceWithAI(
        channel,
        String(topic).trim(),
        db.workspace,
        geminiApiKey
      );
      const now = new Date().toISOString();
      const piece: ContentPiece = {
        id: makeId('cnt'),
        ...pieceData,
        status: 'draft',
        created_date: now,
      };
      db.content.unshift(piece);
      db.activities.unshift({
        id: makeId('act'),
        type: 'content',
        summary: `${piece.channel} piece written: ${piece.title}`,
        detail: piece.hook || '',
        status: 'done',
        automated: true,
        created_date: now,
      });
      await storage.save(db);
      return json(piece, 201);
    }

    if (method === 'POST' && pathname === '/api/ai/experiments/design') {
      const db = await storage.load();
      const body = await readBody(request);
      const topic = String(body.topic || '').trim();
      if (topic.length < 4) {
        return json({ error: 'Topic is required' }, 400);
      }
      const expData = await designExperimentWithAI(topic, db.workspace, geminiApiKey);
      const exp = {
        id: makeId('exp'),
        ...expData,
        created_date: new Date().toISOString(),
      };
      db.experiments.unshift(exp);
      await storage.save(db);
      return json(exp, 201);
    }

    const expJudgeMatch = pathname.match(/^\/api\/ai\/experiments\/([^/]+)\/judge$/);
    if (method === 'POST' && expJudgeMatch) {
      const expId = decodeURIComponent(expJudgeMatch[1]);
      const db = await storage.load();
      const idx = db.experiments.findIndex((e) => e.id === expId);
      if (idx === -1) return json({ error: 'Experiment not found' }, 404);
      const verdict = await judgeExperimentWithAI(
        db.experiments[idx],
        db.workspace,
        geminiApiKey
      );
      db.experiments[idx] = {
        ...db.experiments[idx],
        winner: verdict.winner,
        insight: verdict.insight,
      };
      await storage.save(db);
      return json(db.experiments[idx]);
    }

    if (method === 'POST' && pathname === '/api/ai/chat') {
      const db = await storage.load();
      const body = await readBody(request);
      const messages = Array.isArray(body.messages)
        ? (body.messages as Array<{ role: string; content: string }>)
        : [];
      const result = await chatWithVisitorAI(messages, db, geminiApiKey);
      await storage.save(db);
      return json({
        reply: result.reply,
        capturedLeadId: result.capturedLead?.id || null,
      });
    }

    return json({ error: 'API route not found' }, 404);
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal server error' }, 500);
  }
}
