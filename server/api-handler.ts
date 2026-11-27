import type {
  Campaign,
  ContentPiece,
  EmailTemplate,
  Lead,
} from '../src/types/funnel.ts';
import {
  createDefaultPromoTemplates,
  personalizeTemplate,
  renderPromoEmailHtml,
  renderPromoEmailText,
  sanitizeEmailUrl,
  type EmailTemplateDraft,
} from '../src/lib/email-template.ts';
import {
  chatWithVisitorAI,
  designExperimentWithAI,
  draftApprovalWithAI,
  generateCampaignKitWithAI,
  generateContentPieceWithAI,
  generatePromoEmailWithAI,
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
import {
  isValidEmail,
  resolveChannelSender,
  sendTransactionalEmail,
  syncBrevoContact,
  type EmailRuntimeConfig,
} from './email.ts';
import type { DbAdapter } from './d1-storage.ts';

export type { DbAdapter };

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
  brevoApiKey?: string;
  brevoSenderEmail?: string;
  brevoSenderName?: string;
  resendApiKey?: string;
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
  const emailRuntime: EmailRuntimeConfig = {
    brevoApiKey: runtimeInfo?.brevoApiKey,
    brevoSenderEmail: runtimeInfo?.brevoSenderEmail,
    brevoSenderName: runtimeInfo?.brevoSenderName,
    resendApiKey: runtimeInfo?.resendApiKey,
  };

  try {
    if (method === 'GET' && pathname === '/api/health') {
      const activeStorage = runtimeInfo?.storage || 'local-json';
      const brevoConfigured = Boolean(emailRuntime.brevoApiKey?.trim());
      const resendConfigured = Boolean(emailRuntime.resendApiKey?.trim());
      let dbConnected = true;
      let dbError = '';
      if (storage.ping) {
        const ping = await storage.ping();
        dbConnected = ping.ok;
        dbError = ping.error || '';
      } else {
        try {
          await storage.load();
        } catch (err) {
          dbConnected = false;
          dbError = err instanceof Error ? err.message : 'Storage load failed';
        }
      }
      return json({
        ok: dbConnected,
        service: 'sunmedx-funnel-autopilot',
        environment: runtimeInfo?.environment || 'development',
        storage: activeStorage,
        cloudflarePersistent:
          activeStorage === 'cloudflare-kv' || activeStorage === 'cloudflare-d1',
        dbConnected,
        dbError: dbError || undefined,
        checkedAt: new Date().toISOString(),
        aiConfigured: Boolean(geminiApiKey),
        brevoConfigured,
        resendConfigured,
        emailConfigured: brevoConfigured || resendConfigured,
        emailProvider: brevoConfigured ? 'brevo' : resendConfigured ? 'resend' : 'none',
        senderEmailConfigured: isValidEmail(emailRuntime.brevoSenderEmail),
        brevoSenderEmail: emailRuntime.brevoSenderEmail?.trim() || '',
      });
    }

    if (method === 'POST' && pathname === '/api/email/test') {
      const db = await storage.load();
      db.channels = ensureCatalogChannels(db.channels || []);
      const body = await readBody(request);
      const toEmail = String(body.toEmail || '').trim().toLowerCase();
      if (!isValidEmail(toEmail)) {
        return json({ ok: false, error: 'Enter a valid recipient email address.' }, 400);
      }
      const explicitSender = String(body.senderEmail || '').trim().toLowerCase();
      const fromEmail = isValidEmail(explicitSender)
        ? explicitSender
        : resolveChannelSender(db.channels, emailRuntime);
      const subject = String(
        body.subject || `${db.workspace.brand || 'Sunmedx'} · Brevo test email`
      ).trim();
      const textBody = String(
        body.body ||
          `Your ${db.workspace.brand || 'Sunmedx'} funnel email connection is active and delivering via Brevo.\n\nReply-to and approvals are ready.`
      ).trim();

      const result = await sendTransactionalEmail(
        {
          toEmail,
          subject,
          textBody,
          fromEmail,
          fromName: db.workspace.brand || 'Sunmedx',
        },
        emailRuntime
      );

      db.activities.unshift({
        id: makeId('act'),
        type: 'email',
        summary: result.ok
          ? `Test email delivered to ${toEmail} via ${result.provider}`
          : `Test email failed for ${toEmail}`,
        detail: result.ok
          ? `Sender: ${result.senderEmail || fromEmail} · ID: ${result.messageId || 'sent'}`
          : result.error,
        status: 'done',
        automated: false,
        created_date: new Date().toISOString(),
      });
      await storage.save(db);
      return json(result, result.ok ? 200 : 200);
    }

    // Brand Promotion Email Templates (persisted in user_config under 'email_templates')
    const loadEmailTemplates = async (db: SunmedxDatabase): Promise<EmailTemplate[]> => {
      const stored = storage.getConfigValue
        ? await storage.getConfigValue('email_templates')
        : null;
      if (Array.isArray(stored) && stored.length > 0) {
        return stored as EmailTemplate[];
      }
      const defaults = createDefaultPromoTemplates(
        db.workspace,
        runtimeInfo?.appUrl || 'https://sunmedx-funnel.workers.dev'
      );
      if (storage.setConfigValue) {
        await storage.setConfigValue('email_templates', defaults);
      }
      return defaults;
    };

    const saveEmailTemplates = async (items: EmailTemplate[]): Promise<void> => {
      if (storage.setConfigValue) {
        await storage.setConfigValue('email_templates', items);
      }
    };

    if (method === 'GET' && pathname === '/api/email-templates') {
      const db = await storage.load();
      const items = await loadEmailTemplates(db);
      return json({ items });
    }

    if (method === 'POST' && pathname === '/api/email-templates/generate') {
      const db = await storage.load();
      const body = await readBody(request);
      const goal = String(body.goal || '').trim() || 'Introduce the Sunmedx 30-Day Energy Protocol';
      const category =
        body.category === 'launch' ||
        body.category === 'nurture' ||
        body.category === 'winback'
          ? body.category
          : 'brand_promo';
      const theme =
        body.theme === 'midnight' || body.theme === 'minimal' ? body.theme : 'sunrise';
      const generated = await generatePromoEmailWithAI(
        {
          goal,
          category,
          theme,
          appUrl: runtimeInfo?.appUrl || url.origin,
        },
        db.workspace,
        geminiApiKey
      );
      return json({ draft: generated });
    }

    if (method === 'POST' && pathname === '/api/email-templates/send') {
      const db = await storage.load();
      db.channels = ensureCatalogChannels(db.channels || []);
      const body = await readBody(request);
      const templates = await loadEmailTemplates(db);
      const savedTpl = body.templateId
        ? templates.find((t) => t.id === String(body.templateId))
        : undefined;
      const inlineTpl =
        body.template && typeof body.template === 'object'
          ? (body.template as Partial<EmailTemplateDraft>)
          : undefined;
      const baseTpl: EmailTemplateDraft | undefined = inlineTpl
        ? {
            name: String(inlineTpl.name || savedTpl?.name || 'Brand Promotion'),
            category: inlineTpl.category || savedTpl?.category || 'brand_promo',
            theme: inlineTpl.theme || savedTpl?.theme || 'sunrise',
            subject: String(inlineTpl.subject || savedTpl?.subject || ''),
            preheader: String(inlineTpl.preheader || savedTpl?.preheader || ''),
            badge: String(inlineTpl.badge || savedTpl?.badge || 'Brand Promotion'),
            headline: String(inlineTpl.headline || savedTpl?.headline || ''),
            body: String(inlineTpl.body || savedTpl?.body || ''),
            offer_title:
              inlineTpl.offer_title !== undefined
                ? String(inlineTpl.offer_title)
                : savedTpl?.offer_title,
            offer_price:
              inlineTpl.offer_price !== undefined
                ? String(inlineTpl.offer_price)
                : savedTpl?.offer_price,
            cta_label: String(inlineTpl.cta_label || savedTpl?.cta_label || 'Learn more'),
            cta_url: sanitizeEmailUrl(inlineTpl.cta_url || savedTpl?.cta_url || runtimeInfo?.appUrl),
            footer_note: String(
              inlineTpl.footer_note ||
                savedTpl?.footer_note ||
                `${db.workspace.brand || 'Sunmedx'} · Precision wellness protocols.`
            ),
          }
        : savedTpl;

      if (!baseTpl || !baseTpl.subject.trim() || !baseTpl.body.trim()) {
        return json({ ok: false, error: 'Subject and email body are required.' }, 400);
      }

      const explicitSender = String(body.senderEmail || '').trim().toLowerCase();
      const fromEmail = isValidEmail(explicitSender)
        ? explicitSender
        : resolveChannelSender(db.channels, emailRuntime);
      const brandName = db.workspace.brand || 'Sunmedx';

      type RecipientTarget = { email: string; name?: string; leadId?: string };
      const targets: RecipientTarget[] = [];
      const seenEmails = new Set<string>();

      const singleEmail = String(body.toEmail || '').trim().toLowerCase();
      if (singleEmail) {
        if (!isValidEmail(singleEmail)) {
          return json({ ok: false, error: 'Enter a valid recipient email address.' }, 400);
        }
        seenEmails.add(singleEmail);
        targets.push({
          email: singleEmail,
          name: String(body.toName || '').trim() || undefined,
        });
      } else {
        const leadIds = Array.isArray(body.leadIds)
          ? new Set(body.leadIds.map((x) => String(x)))
          : null;
        const audience = String(body.audience || 'all');
        const matchingLeads = db.leads.filter((l) => {
          if (!isValidEmail(l.email)) return false;
          if (leadIds && leadIds.size > 0) return leadIds.has(l.id);
          if (audience === 'hot') return l.temperature === 'hot' || (l.score || 0) >= 70;
          if (audience === 'warm') return l.temperature === 'warm';
          return true;
        });

        for (const lead of matchingLeads) {
          const em = lead.email.trim().toLowerCase();
          if (seenEmails.has(em)) continue;
          seenEmails.add(em);
          targets.push({ email: em, name: lead.full_name, leadId: lead.id });
          if (targets.length >= 25) break;
        }
      }

      if (targets.length === 0) {
        return json(
          {
            ok: false,
            error:
              'No recipients with valid emails found. Enter a test email or capture leads first.',
          },
          400
        );
      }

      const now = new Date().toISOString();
      const results: Array<{
        email: string;
        ok: boolean;
        messageId?: string;
        error?: string;
      }> = [];
      let sentCount = 0;
      let failedCount = 0;
      let activeProvider = 'none';
      let activeSender = fromEmail;

      for (const target of targets) {
        const rawLocal = target.email.split('@')[0].split(/[._+-]/)[0] || '';
        const guessedFirst = /^[a-z]{2,}$/i.test(rawLocal)
          ? rawLocal.charAt(0).toUpperCase() + rawLocal.slice(1).toLowerCase()
          : 'there';
        const firstName = target.name
          ? target.name.trim().split(/\s+/)[0]
          : guessedFirst;
        const personalized = personalizeTemplate(baseTpl, firstName);
        const htmlContent = renderPromoEmailHtml(personalized, brandName);
        const textBody = renderPromoEmailText(personalized, brandName);

        const res = await sendTransactionalEmail(
          {
            toEmail: target.email,
            toName: target.name,
            subject: personalized.subject,
            textBody,
            htmlContent,
            fromEmail,
            fromName: brandName,
          },
          emailRuntime
        );

        activeProvider = res.provider || activeProvider;
        if (res.senderEmail) activeSender = res.senderEmail;

        if (res.ok) {
          sentCount++;
          results.push({ email: target.email, ok: true, messageId: res.messageId });
          if (target.leadId) {
            const lead = db.leads.find((l) => l.id === target.leadId);
            if (lead) {
              lead.last_touch = now;
              lead.updated_date = now;
            }
          }
        } else {
          failedCount++;
          results.push({ email: target.email, ok: false, error: res.error });
        }
      }

      db.activities.unshift({
        id: makeId('act'),
        type: 'email',
        summary:
          sentCount > 0
            ? `Brand promotion "${baseTpl.name}" sent to ${sentCount} recipient${sentCount === 1 ? '' : 's'} via ${activeProvider}`
            : `Brand promotion "${baseTpl.name}" failed to send`,
        detail:
          sentCount > 0
            ? `Subject: ${baseTpl.subject}${activeSender ? ` · From: ${activeSender}` : ''}${
                failedCount ? ` · ${failedCount} failed` : ''
              }`
            : results[0]?.error || 'Email delivery failed',
        status: 'done',
        automated: false,
        created_date: now,
      });
      await storage.save(db);

      return json({
        ok: sentCount > 0,
        provider: activeProvider,
        senderEmail: activeSender,
        sentCount,
        failedCount,
        results,
        error: sentCount === 0 ? results[0]?.error : undefined,
      });
    }

    if (method === 'POST' && pathname === '/api/email-templates') {
      const db = await storage.load();
      const body = await readBody(request);
      const templates = await loadEmailTemplates(db);
      const now = new Date().toISOString();
      const created: EmailTemplate = {
        id: makeId('tpl'),
        name: String(body.name || 'Untitled Brand Promo').trim(),
        category:
          body.category === 'launch' ||
          body.category === 'nurture' ||
          body.category === 'winback'
            ? body.category
            : 'brand_promo',
        theme: body.theme === 'midnight' || body.theme === 'minimal' ? body.theme : 'sunrise',
        subject: String(body.subject || `${db.workspace.brand || 'Sunmedx'} update`).trim(),
        preheader: String(body.preheader || '').trim(),
        badge: String(body.badge || 'Brand Promotion').trim(),
        headline: String(body.headline || db.workspace.landing_headline || '').trim(),
        body: String(body.body || '').trim(),
        offer_title: body.offer_title ? String(body.offer_title).trim() : '',
        offer_price: body.offer_price ? String(body.offer_price).trim() : '',
        cta_label: String(body.cta_label || 'Explore the protocol').trim(),
        cta_url: sanitizeEmailUrl(
          String(body.cta_url || runtimeInfo?.appUrl || 'https://sunmedx-funnel.workers.dev')
        ),
        footer_note: String(
          body.footer_note || `${db.workspace.brand || 'Sunmedx'} · Precision wellness protocols.`
        ).trim(),
        created_date: now,
        updated_date: now,
      };
      const next = [created, ...templates];
      await saveEmailTemplates(next);
      return json(created, 201);
    }

    const emailTplMatch = pathname.match(/^\/api\/email-templates\/([^/]+)$/);
    if (emailTplMatch) {
      const tplId = decodeURIComponent(emailTplMatch[1]);
      const db = await storage.load();
      const templates = await loadEmailTemplates(db);
      const idx = templates.findIndex((t) => t.id === tplId);

      if (method === 'PATCH' || method === 'PUT') {
        if (idx === -1) return json({ error: 'Template not found' }, 404);
        const body = await readBody(request);
        const cur = templates[idx];
        const updated: EmailTemplate = {
          ...cur,
          ...(body.name !== undefined ? { name: String(body.name).trim() || cur.name } : {}),
          ...(body.category === 'brand_promo' ||
          body.category === 'launch' ||
          body.category === 'nurture' ||
          body.category === 'winback'
            ? { category: body.category }
            : {}),
          ...(body.theme === 'sunrise' || body.theme === 'midnight' || body.theme === 'minimal'
            ? { theme: body.theme }
            : {}),
          ...(body.subject !== undefined ? { subject: String(body.subject) } : {}),
          ...(body.preheader !== undefined ? { preheader: String(body.preheader) } : {}),
          ...(body.badge !== undefined ? { badge: String(body.badge) } : {}),
          ...(body.headline !== undefined ? { headline: String(body.headline) } : {}),
          ...(body.body !== undefined ? { body: String(body.body) } : {}),
          ...(body.offer_title !== undefined ? { offer_title: String(body.offer_title) } : {}),
          ...(body.offer_price !== undefined ? { offer_price: String(body.offer_price) } : {}),
          ...(body.cta_label !== undefined ? { cta_label: String(body.cta_label) } : {}),
          ...(body.cta_url !== undefined
            ? { cta_url: sanitizeEmailUrl(String(body.cta_url)) }
            : {}),
          ...(body.footer_note !== undefined ? { footer_note: String(body.footer_note) } : {}),
          updated_date: new Date().toISOString(),
        };
        const next = templates.map((t, i) => (i === idx ? updated : t));
        await saveEmailTemplates(next);
        return json(updated);
      }

      if (method === 'DELETE') {
        if (idx === -1) return json({ error: 'Template not found' }, 404);
        const next = templates.filter((t) => t.id !== tplId);
        await saveEmailTemplates(next);
        return json({ ok: true, deleted: true, id: tplId });
      }
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

    // User Configuration CRUD (/api/config and /api/config/:key)
    if (pathname === '/api/config') {
      if (method === 'GET') {
        const db = await storage.load();
        db.channels = ensureCatalogChannels(db.channels || []);
        const custom = storage.listAllCustomConfig
          ? await storage.listAllCustomConfig()
          : {};
        return json({
          workspace: db.workspace,
          channels: db.channels,
          custom,
          storage: runtimeInfo?.storage || 'local-json',
        });
      }
      if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
        const db = await storage.load();
        const body = await readBody(request);
        if (body.workspace && typeof body.workspace === 'object') {
          db.workspace = {
            ...db.workspace,
            ...(body.workspace as Partial<typeof db.workspace>),
            id: db.workspace.id,
          };
        }
        if (Array.isArray(body.channels)) {
          db.channels = ensureCatalogChannels(
            body.channels as SunmedxDatabase['channels']
          );
        }
        await storage.save(db);
        if (body.custom && typeof body.custom === 'object' && storage.setConfigValue) {
          for (const [k, v] of Object.entries(body.custom as Record<string, unknown>)) {
            if (k && k !== 'workspace' && k !== 'channels') {
              await storage.setConfigValue(k, v);
            }
          }
        }
        const custom = storage.listAllCustomConfig
          ? await storage.listAllCustomConfig()
          : {};
        return json({
          ok: true,
          workspace: db.workspace,
          channels: db.channels,
          custom,
        });
      }
    }

    const configKeyMatch = pathname.match(/^\/api\/config\/([^/]+)$/);
    if (configKeyMatch) {
      const key = decodeURIComponent(configKeyMatch[1]).trim();
      if (!key) return json({ error: 'Config key is required' }, 400);

      if (method === 'GET') {
        const db = await storage.load();
        if (key === 'workspace') return json({ key, value: db.workspace });
        if (key === 'channels') {
          return json({ key, value: ensureCatalogChannels(db.channels || []) });
        }
        const val = storage.getConfigValue ? await storage.getConfigValue(key) : null;
        if (val === null) return json({ error: 'Config key not found' }, 404);
        return json({ key, value: val });
      }

      if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
        const body = await readBody(request);
        const value = 'value' in body ? body.value : body;
        const db = await storage.load();
        if (key === 'workspace' && value && typeof value === 'object') {
          db.workspace = {
            ...db.workspace,
            ...(value as Partial<typeof db.workspace>),
            id: db.workspace.id,
          };
          await storage.save(db);
          return json({ ok: true, key, value: db.workspace });
        }
        if (key === 'channels' && Array.isArray(value)) {
          db.channels = ensureCatalogChannels(value as SunmedxDatabase['channels']);
          await storage.save(db);
          return json({ ok: true, key, value: db.channels });
        }
        if (storage.setConfigValue) {
          await storage.setConfigValue(key, value);
        }
        return json({ ok: true, key, value });
      }

      if (method === 'DELETE') {
        if (key === 'workspace') {
          const db = await storage.load();
          db.workspace = createInitialDb().workspace;
          await storage.save(db);
          return json({ ok: true, deleted: true, key });
        }
        if (key === 'channels') {
          const db = await storage.load();
          db.channels = createInitialDb().channels;
          await storage.save(db);
          return json({ ok: true, deleted: true, key });
        }
        const deleted = storage.deleteConfigValue
          ? await storage.deleteConfigValue(key)
          : false;
        if (!deleted) return json({ error: 'Config key not found' }, 404);
        return json({ ok: true, deleted: true, key });
      }
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

      if (isValidEmail(lead.email) && emailRuntime.brevoApiKey?.trim()) {
        db.channels = ensureCatalogChannels(db.channels || []);
        const brevoCh = db.channels.find((c) => c.key === 'brevo');
        await syncBrevoContact(
          {
            email: lead.email,
            fullName: lead.full_name,
            source: lead.source,
            interest: lead.interest,
            listIdRaw: brevoCh?.account_id,
          },
          emailRuntime.brevoApiKey
        );

        if (
          lead.source === 'Lead magnet form' ||
          lead.source === 'Landing page'
        ) {
          const fromEmail = resolveChannelSender(db.channels, emailRuntime);
          const isMagnet = lead.source === 'Lead magnet form';
          const welcomeSubject = isMagnet
            ? `${db.workspace.brand} · Your 30-Day Energy & Cortisol Reset Blueprint`
            : `${db.workspace.brand} · Your 30-day energy protocol check-in`;
          const welcomeBody = isMagnet
            ? `Hi ${lead.full_name},\n\nThanks for requesting your 30-Day Energy & Cortisol Reset Blueprint (${lead.need_signal || 'steady energy'}).\n\nPhase 1 (Days 1–7): Get 10 minutes of natural morning light within 30 minutes of waking and delay first caffeine 60–90 minutes.\nPhase 2 (Days 8–18): Anchor lunch with 30g+ protein and a 7-minute afternoon reset walk.\nPhase 3 (Days 19–30): Dim overhead light 90 minutes before sleep.\n\nReply directly to this email anytime if you want a tailored recommendation.\n\n— ${db.workspace.brand}`
            : `Hi ${lead.full_name},\n\nThanks for starting your ${db.workspace.brand} energy check-in. Your signals are logged and we'll follow up with your clearest next step shortly.\n\n— ${db.workspace.brand}`;

          const mailRes = await sendTransactionalEmail(
            {
              toEmail: lead.email,
              toName: lead.full_name,
              subject: welcomeSubject,
              textBody: welcomeBody,
              fromEmail,
              fromName: db.workspace.brand,
            },
            emailRuntime
          );

          db.activities.unshift({
            id: makeId('act'),
            lead_id: lead.id,
            lead_name: lead.full_name,
            stage: lead.stage,
            type: 'email',
            summary: mailRes.ok
              ? `Welcome email delivered to ${lead.email} via ${mailRes.provider}`
              : `Auto-welcome email skipped for ${lead.email}`,
            detail: mailRes.ok
              ? `${welcomeSubject} · ID: ${mailRes.messageId || 'sent'}`
              : mailRes.error,
            status: 'done',
            automated: true,
            created_date: new Date().toISOString(),
          });
        }
      }

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

      db.channels = ensureCatalogChannels(db.channels || []);
      const fromEmail = resolveChannelSender(db.channels, emailRuntime);
      const sendRes = await sendTransactionalEmail(
        {
          toEmail: item.lead_email,
          toName: item.lead_name,
          subject,
          textBody: body,
          fromEmail,
          fromName: db.workspace.brand || 'Sunmedx',
        },
        emailRuntime
      );

      if (!sendRes.ok) {
        db.approvals[idx] = {
          ...item,
          subject,
          body,
          status: 'failed',
          send_error: sendRes.error,
          updated_date: now,
        };
        db.activities.unshift({
          id: makeId('act'),
          lead_id: item.lead_id,
          lead_name: item.lead_name,
          stage: 'proposal',
          type: 'email',
          summary: `Email send failed for ${item.lead_name}`,
          detail: sendRes.error || 'Provider rejected request',
          status: 'done',
          automated: false,
          created_date: now,
        });
        await storage.save(db);
        return json({
          ok: false,
          provider: sendRes.provider,
          error: sendRes.error,
          approval: db.approvals[idx],
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
        summary: `${item.kind === 'proposal' ? 'Offer' : 'Reply'} approved & sent to ${item.lead_name} via ${sendRes.provider}`,
        detail: `${subject}${sendRes.messageId ? ` · ID: ${sendRes.messageId}` : ''}`,
        status: 'done',
        automated: false,
        created_date: now,
      });

      await storage.save(db);
      return json({
        ok: true,
        provider: sendRes.provider,
        messageId: sendRes.messageId,
        senderEmail: sendRes.senderEmail,
        approval: db.approvals[idx],
      });
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

    // Activities (Funnel Activity CRUD)
    if (method === 'GET' && pathname === '/api/activities') {
      const db = await storage.load();
      let items = [...db.activities];
      const leadId = url.searchParams.get('lead_id');
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      if (leadId) {
        items = items.filter((a) => a.lead_id === leadId);
      }
      if (status) {
        items = items.filter((a) => a.status === status);
      }
      if (type && type !== 'all') {
        items = items.filter((a) => a.type === type);
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

    const activityMatch = pathname.match(/^\/api\/activities\/([^/]+)$/);
    if (activityMatch) {
      const actId = decodeURIComponent(activityMatch[1]);
      if (method === 'GET') {
        const db = await storage.load();
        const act = db.activities.find((a) => a.id === actId);
        if (!act) return json({ error: 'Activity not found' }, 404);
        return json(act);
      }
      if (method === 'PATCH' || method === 'PUT') {
        const db = await storage.load();
        const idx = db.activities.findIndex((a) => a.id === actId);
        if (idx === -1) return json({ error: 'Activity not found' }, 404);
        const body = await readBody(request);
        const current = db.activities[idx];
        db.activities[idx] = {
          ...current,
          ...(body.summary !== undefined ? { summary: String(body.summary).trim() || current.summary } : {}),
          ...(body.detail !== undefined ? { detail: String(body.detail) } : {}),
          ...(body.status === 'done' || body.status === 'queued' ? { status: body.status } : {}),
          ...(body.type ? { type: body.type as typeof current.type } : {}),
          ...(body.stage !== undefined ? { stage: body.stage ? (String(body.stage) as Lead['stage']) : undefined } : {}),
          ...(typeof body.automated === 'boolean' ? { automated: body.automated } : {}),
        };
        await storage.save(db);
        return json(db.activities[idx]);
      }
      if (method === 'DELETE') {
        const db = await storage.load();
        const before = db.activities.length;
        db.activities = db.activities.filter((a) => a.id !== actId);
        if (db.activities.length === before) {
          return json({ error: 'Activity not found' }, 404);
        }
        await storage.save(db);
        return json({ ok: true, deleted: true, id: actId });
      }
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
          const hasEnvKey =
            (ch.integration === 'brevo' && Boolean(emailRuntime.brevoApiKey?.trim())) ||
            (ch.integration === 'resend' && Boolean(emailRuntime.resendApiKey?.trim()));
          map[ch.integration] = Boolean(
            hasEnvKey ||
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
