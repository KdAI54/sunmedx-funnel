import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  LoaderCircle,
  Mail,
  Monitor,
  Plus,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { DEFAULT_WORKSPACE } from '../data/stages';
import { api, type HealthStatus } from '../lib/api';
import {
  renderPromoEmailHtml,
  type EmailTemplateDraft,
} from '../lib/email-template';
import { timeAgo } from '../lib/format';
import type {
  BadgeTone,
  EmailTemplate,
  EmailTemplateCategory,
  EmailTemplateTheme,
  Lead,
} from '../types/funnel';

const CATEGORY_LABELS: Record<EmailTemplateCategory, string> = {
  brand_promo: 'Brand promotion',
  launch: 'Product / offer launch',
  nurture: 'Value nurture',
  winback: 'Check-in / win-back',
};

const THEME_OPTIONS: Array<{ key: EmailTemplateTheme; label: string; note: string }> = [
  { key: 'sunrise', label: 'Sunrise Coral', note: 'Dark navy hero + coral CTA' },
  { key: 'midnight', label: 'Midnight Cobalt', note: 'Executive slate + cobalt CTA' },
  { key: 'minimal', label: 'Editorial Light', note: 'Founder letter clean sheet' },
];

const CATEGORY_TONES: Record<EmailTemplateCategory, BadgeTone> = {
  brand_promo: 'warm',
  launch: 'purple',
  nurture: 'teal',
  winback: 'blue',
};

function blankDraft(brand = 'Sunmedx'): EmailTemplateDraft {
  return {
    name: `${brand} · New Brand Promo`,
    category: 'brand_promo',
    theme: 'sunrise',
    subject: `Built for steady daily energy — ${brand}`,
    preheader: 'A practical 30-day sequence without guesswork.',
    badge: 'Brand Promotion',
    headline: 'Energy you can plan around.',
    body: `Hi {{first_name}},\n\nShare your core brand story, what makes ${brand} different, and the single next step you want readers to take today.\n\nKeep paragraphs calm, clear, and focused on one outcome.`,
    offer_title: '30-Day Energy Reset Protocol — The exact daily sequence',
    offer_price: '$29',
    cta_label: 'Claim Your Protocol',
    cta_url: 'https://sunmedx-funnel.workers.dev',
    logo_url: '/sunmedx-logo.png',
    sender_name: `${brand} Team`,
    sender_role: 'Precision wellness protocols',
    sender_email: '',
    sender_website: 'https://sunmedx-funnel.workers.dev',
    sender_address: 'Delivered via Brevo · Reply directly anytime',
    footer_note: `You received this brand update from ${brand}. Reply directly anytime.`,
  };
}

function toDraft(tpl: EmailTemplate): EmailTemplateDraft {
  return {
    name: tpl.name,
    category: tpl.category,
    theme: tpl.theme,
    subject: tpl.subject,
    preheader: tpl.preheader,
    badge: tpl.badge,
    headline: tpl.headline,
    body: tpl.body,
    offer_title: tpl.offer_title || '',
    offer_price: tpl.offer_price || '',
    cta_label: tpl.cta_label,
    cta_url: tpl.cta_url,
    logo_url: tpl.logo_url || '/sunmedx-logo.png',
    sender_name: tpl.sender_name || '',
    sender_role: tpl.sender_role || '',
    sender_email: tpl.sender_email || '',
    sender_website: tpl.sender_website || '',
    sender_address: tpl.sender_address || '',
    footer_note: tpl.footer_note,
  };
}

export function EmailTemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [brandName, setBrandName] = useState(DEFAULT_WORKSPACE.brand);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailTemplateDraft>(() => blankDraft());
  const [saving, setSaving] = useState(false);

  // AI prompt generator
  const [aiGoal, setAiGoal] = useState('');
  const [generating, setGenerating] = useState(false);

  // Live preview controls
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewName, setPreviewName] = useState('Alex');

  // Brevo sending controls
  const [sendMode, setSendMode] = useState<'single' | 'leads'>('single');
  const [testEmail, setTestEmail] = useState('');
  const [audience, setAudience] = useState<'all' | 'hot' | 'warm'>('all');
  const [sending, setSending] = useState(false);
  const [sendReport, setSendReport] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [tplRes, leadsRes, healthRes, cfgRes] = await Promise.all([
        api.emailTemplates.list(),
        api.leads.list('-created_date').catch(() => ({ items: [] as Lead[] })),
        api.health().catch(() => null),
        api.config.getAll().catch(() => null),
      ]);
      const items = tplRes.items || [];
      setTemplates(items);
      setLeads(leadsRes.items || []);
      if (healthRes) setHealth(healthRes);
      const resolvedBrand = cfgRes?.workspace?.brand || DEFAULT_WORKSPACE.brand;
      setBrandName(resolvedBrand);

      if (items.length > 0) {
        setSelectedId((prev) => {
          const stillExists = prev && items.some((x) => x.id === prev);
          const pick = stillExists ? items.find((x) => x.id === prev)! : items[0];
          setDraft(toDraft(pick));
          return pick.id;
        });
      } else {
        setSelectedId(null);
        setDraft(blankDraft(resolvedBrand));
      }
    } catch {
      toast.error('Could not load email templates.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function selectTemplate(tpl: EmailTemplate) {
    setSelectedId(tpl.id);
    setDraft(toDraft(tpl));
    setSendReport(null);
  }

  function startNewTemplate() {
    setSelectedId(null);
    setDraft(blankDraft(brandName));
    setSendReport(null);
  }

  function updateField<K extends keyof EmailTemplateDraft>(
    key: K,
    val: EmailTemplateDraft[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: val }));
  }

  async function saveTemplate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      toast.error('Template name, subject, and body are required.');
      return;
    }
    setSaving(true);
    try {
      if (selectedId) {
        const updated = await api.emailTemplates.update(selectedId, draft);
        setTemplates((prev) => prev.map((t) => (t.id === selectedId ? updated : t)));
        setDraft(toDraft(updated));
        toast.success('Email template saved to D1');
      } else {
        const created = await api.emailTemplates.create(draft);
        setTemplates((prev) => [created, ...prev]);
        setSelectedId(created.id);
        setDraft(toDraft(created));
        toast.success('New brand promo template created');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save template');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    try {
      await api.emailTemplates.remove(id);
      const remaining = templates.filter((t) => t.id !== id);
      setTemplates(remaining);
      if (selectedId === id) {
        if (remaining.length > 0) {
          setSelectedId(remaining[0].id);
          setDraft(toDraft(remaining[0]));
        } else {
          startNewTemplate();
        }
      }
      toast.success('Template deleted');
    } catch {
      toast.error('Could not delete template');
    }
  }

  async function generateWithAI(e: React.FormEvent) {
    e.preventDefault();
    const goal = aiGoal.trim() || `Promote ${brandName} 30-day energy protocol`;
    setGenerating(true);
    try {
      const res = await api.emailTemplates.generate({
        goal,
        category: draft.category,
        theme: draft.theme,
      });
      if (res.draft) {
        setSelectedId(null);
        setDraft(res.draft);
        toast.success('AI drafted a brand promotion template — review and save');
      }
    } catch {
      toast.error('Could not generate promo template. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  const leadsWithEmail = useMemo(
    () => leads.filter((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((l.email || '').trim())),
    [leads]
  );

  const audienceRecipients = useMemo(() => {
    const filtered = leadsWithEmail.filter((l) => {
      if (audience === 'hot') return l.temperature === 'hot' || (l.score || 0) >= 70;
      if (audience === 'warm') return l.temperature === 'warm';
      return true;
    });
    const uniqueEmails = new Set(filtered.map((l) => l.email.trim().toLowerCase()));
    return Math.min(25, uniqueEmails.size);
  }, [leadsWithEmail, audience]);

  const previewHtml = useMemo(
    () =>
      renderPromoEmailHtml(draft, brandName, previewName || 'Alex', {
        assetBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
        defaultSenderEmail: health?.brevoSenderEmail || '',
        defaultSenderName: `${brandName} Team`,
        defaultWebsite:
          typeof window !== 'undefined' ? window.location.origin : 'https://sunmedx-funnel.workers.dev',
      }),
    [draft, brandName, previewName, health?.brevoSenderEmail]
  );

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(previewHtml);
      toast.success('Responsive HTML copied to clipboard');
    } catch {
      toast.error('Clipboard permission unavailable');
    }
  }

  async function handleSendPromo(e: React.FormEvent) {
    e.preventDefault();
    setSendReport(null);

    if (sendMode === 'single') {
      const clean = testEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        setSendReport({ ok: false, message: 'Enter a valid recipient email address.' });
        return;
      }
    } else if (audienceRecipients === 0) {
      setSendReport({
        ok: false,
        message: 'No captured leads match this audience filter with a valid email.',
      });
      return;
    }

    setSending(true);
    try {
      const res = await api.emailTemplates.send({
        templateId: selectedId || undefined,
        template: draft,
        ...(sendMode === 'single' ? { toEmail: testEmail.trim().toLowerCase() } : { audience }),
      });

      if (res.ok) {
        const msg = `Sent ${res.sentCount} brand promotion email${
          res.sentCount === 1 ? '' : 's'
        } via ${res.provider} (sender: ${res.senderEmail || 'verified'})${
          res.failedCount ? ` · ${res.failedCount} failed` : ''
        }`;
        setSendReport({ ok: true, message: msg });
        toast.success(`Promotion sent via ${res.provider}`);
      } else {
        setSendReport({
          ok: false,
          message: res.error || 'Email provider rejected the send.',
        });
        toast.error('Promotion did not send');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      setSendReport({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sx-page" style={{ maxWidth: 1180 }}>
      <PageHead
        meta="Brevo Email Studio"
        title="Brand promotion templates"
        lede="Build responsive HTML brand promo emails grounded in your offers, preview desktop & mobile layouts, and deliver directly through your active Brevo connection."
      >
        <button type="button" className="sx-btn sx-btn-ghost" onClick={startNewTemplate}>
          <Plus /> New template
        </button>
        <button
          type="button"
          className="sx-btn sx-btn-primary"
          onClick={() => saveTemplate()}
          disabled={saving}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
          {selectedId ? 'Save template' : 'Create & save'}
        </button>
      </PageHead>

      <div className="sx-storage-banner" style={{ marginBottom: 20 }}>
        <div className="sx-storage-banner-main">
          <Mail size={16} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>
                Brevo delivery:{' '}
                {health?.brevoConfigured ? 'Active & ready to send' : 'Waiting for BREVO_API_KEY'}
              </strong>
              <Badge tone={health?.brevoConfigured ? 'green' : 'warm'}>
                {health?.brevoConfigured ? 'Brevo live' : 'Not detected'}
              </Badge>
              {health?.storage === 'cloudflare-d1' && (
                <Badge tone="teal">Saved in Cloudflare D1</Badge>
              )}
            </div>
            <span>
              {health?.brevoSenderEmail
                ? `Active sender: ${health.brevoSenderEmail}`
                : 'Uses your verified Brevo sender automatically or from Accounts & wiring.'}
            </span>
          </div>
        </div>
      </div>

      <Card
        title="Generate a brand promotion with AI"
        note="Describe the campaign angle, seasonal promo, or product highlight — AI writes subject, hero copy, offer box, and CTA."
      >
        <form
          onSubmit={generateWithAI}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}
        >
          <input
            className="sx-input"
            value={aiGoal}
            onChange={(e) => setAiGoal(e.target.value)}
            placeholder="e.g. Autumn energy reset promo — 20% off 1:1 Wellness Audit or $29 Reset Protocol"
            aria-label="Promotion angle or goal"
            style={{ flex: '1 1 320px' }}
          />
          <button
            type="submit"
            className="sx-btn sx-btn-cobalt"
            disabled={generating}
          >
            {generating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {generating ? 'Drafting promo…' : 'Generate with AI'}
          </button>
        </form>
      </Card>

      {loading ? (
        <p className="sx-muted" style={{ marginTop: 20 }}>
          Loading brand templates…
        </p>
      ) : (
        <div className="sx-tpl-grid" style={{ marginTop: 20 }}>
          {/* Left column: Saved Templates + Structured Editor */}
          <div className="sx-stack">
            <Card
              title={`Saved templates (${templates.length})`}
              note="Stored persistently in D1 / server config."
            >
              {templates.length === 0 ? (
                <EmptyState title="No saved templates yet">
                  Edit the draft below and click Create &amp; save.
                </EmptyState>
              ) : (
                <ul className="sx-list">
                  {templates.map((tpl) => {
                    const active = tpl.id === selectedId;
                    return (
                      <li
                        key={tpl.id}
                        className="sx-item"
                        style={
                          active
                            ? {
                                borderColor: 'rgba(59, 130, 246, 0.5)',
                                background: 'rgba(37, 99, 235, 0.1)',
                              }
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => selectTemplate(tpl)}
                          style={{
                            flex: '1 1 auto',
                            minWidth: 0,
                            background: 'none',
                            border: 0,
                            padding: 0,
                            textAlign: 'left',
                            cursor: 'pointer',
                            color: 'inherit',
                          }}
                        >
                          <div className="sx-item-main">
                            <span className="sx-item-title">{tpl.name}</span>
                            <span className="sx-item-note">{tpl.subject}</span>
                          </div>
                        </button>
                        <Badge tone={CATEGORY_TONES[tpl.category]}>
                          {tpl.category.replace('_', ' ')}
                        </Badge>
                        <span className="sx-item-meta">{timeAgo(tpl.updated_date)}</span>
                        <button
                          type="button"
                          className="sx-btn sx-btn-quiet sx-btn-sm"
                          aria-label={`Delete ${tpl.name}`}
                          onClick={() => deleteTemplate(tpl.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card
              title="Template editor"
              note="Personalize with {{first_name}} — updates live in the HTML preview."
            >
              <form onSubmit={saveTemplate} className="sx-stack" style={{ gap: 14 }}>
                <div className="sx-row-2">
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-name">
                      Template name
                    </label>
                    <input
                      id="tpl-name"
                      className="sx-input"
                      value={draft.name}
                      onChange={(e) => updateField('name', e.target.value)}
                    />
                  </div>
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-cat">
                      Campaign type
                    </label>
                    <select
                      id="tpl-cat"
                      className="sx-native"
                      value={draft.category}
                      onChange={(e) =>
                        updateField('category', e.target.value as EmailTemplateCategory)
                      }
                    >
                      {(Object.keys(CATEGORY_LABELS) as EmailTemplateCategory[]).map((k) => (
                        <option key={k} value={k}>
                          {CATEGORY_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sx-field">
                  <span className="sx-label">Visual theme</span>
                  <div className="lg-pill-row">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className="lg-chip"
                        data-on={draft.theme === opt.key ? 'true' : 'false'}
                        onClick={() => updateField('theme', opt.key)}
                        title={opt.note}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sx-row-2">
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-subject">
                      Email subject
                    </label>
                    <input
                      id="tpl-subject"
                      className="sx-input"
                      value={draft.subject}
                      onChange={(e) => updateField('subject', e.target.value)}
                    />
                  </div>
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-preheader">
                      Inbox preheader
                    </label>
                    <input
                      id="tpl-preheader"
                      className="sx-input"
                      value={draft.preheader}
                      onChange={(e) => updateField('preheader', e.target.value)}
                      placeholder="Short preview text next to subject"
                    />
                  </div>
                </div>

                <div className="sx-row-2">
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-badge">
                      Eyebrow badge
                    </label>
                    <input
                      id="tpl-badge"
                      className="sx-input"
                      value={draft.badge}
                      onChange={(e) => updateField('badge', e.target.value)}
                    />
                  </div>
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-headline">
                      Hero headline
                    </label>
                    <input
                      id="tpl-headline"
                      className="sx-input"
                      value={draft.headline}
                      onChange={(e) => updateField('headline', e.target.value)}
                    />
                  </div>
                </div>

                <div className="sx-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="sx-label" htmlFor="tpl-body" style={{ marginBottom: 4 }}>
                      Promotion body
                    </label>
                    <button
                      type="button"
                      className="sx-btn sx-btn-quiet sx-btn-sm"
                      onClick={() =>
                        updateField(
                          'body',
                          draft.body.includes('{{first_name}}')
                            ? draft.body
                            : `Hi {{first_name}},\n\n${draft.body}`
                        )
                      }
                    >
                      Insert {'{{first_name}}'}
                    </button>
                  </div>
                  <textarea
                    id="tpl-body"
                    className="sx-textarea"
                    style={{ minHeight: 136 }}
                    value={draft.body}
                    onChange={(e) => updateField('body', e.target.value)}
                  />
                </div>

                <div className="sx-row-2">
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-offer-title">
                      Featured offer card (optional)
                    </label>
                    <input
                      id="tpl-offer-title"
                      className="sx-input"
                      value={draft.offer_title || ''}
                      onChange={(e) => updateField('offer_title', e.target.value)}
                      placeholder="30-Day Energy Reset Protocol"
                    />
                  </div>
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-offer-price">
                      Offer price / tag
                    </label>
                    <input
                      id="tpl-offer-price"
                      className="sx-input"
                      value={draft.offer_price || ''}
                      onChange={(e) => updateField('offer_price', e.target.value)}
                      placeholder="$29 or 20% OFF"
                    />
                  </div>
                </div>

                <div className="sx-row-2">
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-cta-label">
                      CTA button label
                    </label>
                    <input
                      id="tpl-cta-label"
                      className="sx-input"
                      value={draft.cta_label}
                      onChange={(e) => updateField('cta_label', e.target.value)}
                    />
                  </div>
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-cta-url">
                      CTA destination URL
                    </label>
                    <input
                      id="tpl-cta-url"
                      className="sx-input"
                      value={draft.cta_url}
                      onChange={(e) => updateField('cta_url', e.target.value)}
                      placeholder="https://sunmedx-funnel.workers.dev"
                    />
                  </div>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--sx-line)',
                    paddingTop: 14,
                    marginTop: 4,
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <span className="sx-label" style={{ marginBottom: 0 }}>
                      Footer: Brand logo &amp; sender details
                    </span>
                    <button
                      type="button"
                      className="sx-btn sx-btn-quiet sx-btn-sm"
                      onClick={() => updateField('logo_url', '/sunmedx-logo.png')}
                    >
                      Use Sunmedx logo
                    </button>
                  </div>

                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-logo-url">
                      Brand logo image URL
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          background: '#080e21',
                          border: '1px solid var(--sx-line)',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={draft.logo_url?.trim() || '/sunmedx-logo.png'}
                          alt="Brand logo preview"
                          style={{ width: 24, height: 24, objectFit: 'contain' }}
                        />
                      </div>
                      <input
                        id="tpl-logo-url"
                        className="sx-input"
                        value={draft.logo_url || ''}
                        onChange={(e) => updateField('logo_url', e.target.value)}
                        placeholder="/sunmedx-logo.png or https://yourdomain.com/logo.png"
                      />
                    </div>
                  </div>

                  <div className="sx-row-2">
                    <div className="sx-field">
                      <label className="sx-label" htmlFor="tpl-sender-name">
                        Sender name
                      </label>
                      <input
                        id="tpl-sender-name"
                        className="sx-input"
                        value={draft.sender_name || ''}
                        onChange={(e) => updateField('sender_name', e.target.value)}
                        placeholder={`${brandName} Team`}
                      />
                    </div>
                    <div className="sx-field">
                      <label className="sx-label" htmlFor="tpl-sender-role">
                        Role / brand tagline
                      </label>
                      <input
                        id="tpl-sender-role"
                        className="sx-input"
                        value={draft.sender_role || ''}
                        onChange={(e) => updateField('sender_role', e.target.value)}
                        placeholder="Precision wellness protocols"
                      />
                    </div>
                  </div>

                  <div className="sx-row-2">
                    <div className="sx-field">
                      <label className="sx-label" htmlFor="tpl-sender-email">
                        Sender contact email
                      </label>
                      <input
                        id="tpl-sender-email"
                        type="email"
                        className="sx-input"
                        value={draft.sender_email || ''}
                        onChange={(e) => updateField('sender_email', e.target.value)}
                        placeholder={
                          health?.brevoSenderEmail || 'Auto-filled from active Brevo sender'
                        }
                      />
                    </div>
                    <div className="sx-field">
                      <label className="sx-label" htmlFor="tpl-sender-website">
                        Sender website URL
                      </label>
                      <input
                        id="tpl-sender-website"
                        className="sx-input"
                        value={draft.sender_website || ''}
                        onChange={(e) => updateField('sender_website', e.target.value)}
                        placeholder="https://sunmedx-funnel.workers.dev"
                      />
                    </div>
                  </div>

                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-sender-address">
                      Sender address / signature line
                    </label>
                    <input
                      id="tpl-sender-address"
                      className="sx-input"
                      value={draft.sender_address || ''}
                      onChange={(e) => updateField('sender_address', e.target.value)}
                      placeholder="Austin, TX · Delivered via Brevo"
                    />
                  </div>

                  <div className="sx-field">
                    <label className="sx-label" htmlFor="tpl-footer">
                      Footer note
                    </label>
                    <input
                      id="tpl-footer"
                      className="sx-input"
                      value={draft.footer_note}
                      onChange={(e) => updateField('footer_note', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="sx-btn sx-btn-primary"
                    disabled={saving}
                  >
                    {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
                    {selectedId ? 'Save changes' : 'Save new template'}
                  </button>
                </div>
              </form>
            </Card>
          </div>

          {/* Right column: Live HTML Preview + Send via Brevo */}
          <div className="sx-stack">
            <Card
              title="Live email preview"
              note={`Subject: ${draft.subject.replace(/\{\{\s*first_name\s*\}\}/gi, previewName || 'Alex')}`}
              action={
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`sx-btn sx-btn-sm ${
                      previewDevice === 'desktop' ? 'sx-btn-cobalt' : 'sx-btn-ghost'
                    }`}
                    onClick={() => setPreviewDevice('desktop')}
                    aria-label="Desktop preview"
                  >
                    <Monitor size={13} />
                  </button>
                  <button
                    type="button"
                    className={`sx-btn sx-btn-sm ${
                      previewDevice === 'mobile' ? 'sx-btn-cobalt' : 'sx-btn-ghost'
                    }`}
                    onClick={() => setPreviewDevice('mobile')}
                    aria-label="Mobile preview"
                  >
                    <Smartphone size={13} />
                  </button>
                  <button
                    type="button"
                    className="sx-btn sx-btn-ghost sx-btn-sm"
                    onClick={copyHtml}
                  >
                    <Copy /> Copy HTML
                  </button>
                </div>
              }
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <span className="sx-muted">Previewing as first name:</span>
                <input
                  className="sx-input"
                  value={previewName}
                  onChange={(e) => setPreviewName(e.target.value)}
                  style={{ width: 140, padding: '5px 9px', fontSize: 12 }}
                  aria-label="Preview recipient first name"
                />
              </div>

              <div className="sx-email-preview-wrap">
                <iframe
                  title="Brand promotion email preview"
                  srcDoc={previewHtml}
                  sandbox=""
                  style={{
                    width: previewDevice === 'mobile' ? 375 : '100%',
                    maxWidth: '100%',
                    height: 540,
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: 10,
                    background: '#f3f4f8',
                    margin: '0 auto',
                    display: 'block',
                  }}
                />
              </div>
            </Card>

            <Card
              title="Send promotion via Brevo"
              note="Deliver this exact responsive HTML email to a test address or captured funnel leads."
            >
              <div className="lg-pill-row" style={{ marginBottom: 14 }}>
                <button
                  type="button"
                  className="lg-chip"
                  data-on={sendMode === 'single'}
                  onClick={() => {
                    setSendMode('single');
                    setSendReport(null);
                  }}
                >
                  <Mail size={12} style={{ marginRight: 6 }} />
                  Send test / single email
                </button>
                <button
                  type="button"
                  className="lg-chip"
                  data-on={sendMode === 'leads'}
                  onClick={() => {
                    setSendMode('leads');
                    setSendReport(null);
                  }}
                >
                  <Users size={12} style={{ marginRight: 6 }} />
                  Send to funnel leads ({leadsWithEmail.length})
                </button>
              </div>

              <form onSubmit={handleSendPromo} className="sx-stack" style={{ gap: 12 }}>
                {sendMode === 'single' ? (
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="promo-test-email">
                      Recipient email
                    </label>
                    <input
                      id="promo-test-email"
                      type="email"
                      className="sx-input"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="you@domain.com"
                    />
                  </div>
                ) : (
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="promo-audience">
                      Lead segment ({audienceRecipients} recipient
                      {audienceRecipients === 1 ? '' : 's'} matched)
                    </label>
                    <select
                      id="promo-audience"
                      className="sx-native"
                      value={audience}
                      onChange={(e) =>
                        setAudience(e.target.value as 'all' | 'hot' | 'warm')
                      }
                    >
                      <option value="all">All captured leads with email</option>
                      <option value="hot">Hot leads (score 70+)</option>
                      <option value="warm">Warm leads</option>
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  className="sx-btn sx-btn-primary"
                  disabled={sending}
                >
                  {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
                  {sending
                    ? 'Delivering via Brevo…'
                    : sendMode === 'single'
                      ? 'Send test promotion'
                      : `Send to ${audienceRecipients} lead${audienceRecipients === 1 ? '' : 's'}`}
                </button>
              </form>

              {sendReport && (
                <p
                  role={sendReport.ok ? 'status' : 'alert'}
                  style={{
                    margin: '12px 0 0',
                    padding: '10px 12px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    background: sendReport.ok
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(244, 63, 94, 0.1)',
                    border: `1px solid ${
                      sendReport.ok
                        ? 'rgba(16, 185, 129, 0.35)'
                        : 'rgba(244, 63, 94, 0.35)'
                    }`,
                    color: sendReport.ok ? 'var(--sx-green-ink)' : 'var(--sx-red-ink)',
                  }}
                >
                  {sendReport.message}
                </p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
