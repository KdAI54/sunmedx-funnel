import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Download,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  Share2,
  Sliders,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { Badge, Card, Metric, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import {
  AUTOMATION_DEFAULTS,
  CHANNEL_CATALOG,
  type ChannelCatalogItem,
} from '../data/stages';
import { api, type AppStateSnapshot, type HealthStatus } from '../lib/api';
import type { BadgeTone, Channel } from '../types/funnel';

const KIND_TONES: Record<Channel['kind'], BadgeTone> = {
  social: 'blue',
  email: 'purple',
  web: 'teal',
};

const SETUP_TABS = ['Accounts & Wizards', 'Automation', 'Cadence & Save'];
const WIZARD_STEPS = [
  '1. Credentials & Secret',
  '2. Account Identity',
  '3. Funnel Trigger',
  '4. Verify & Activate',
];

type CategoryFilter = 'all' | 'social' | 'email' | 'web';

interface ChannelConfig {
  handle: string;
  account_id: string;
  sender_email: string;
  secret_env_key: string;
  wizard_completed: boolean;
  automation_key: string;
  delay_days: number;
  cadence: string;
  enabled: boolean;
}

function defaultConfigs(): Record<string, ChannelConfig> {
  return Object.fromEntries(
    CHANNEL_CATALOG.map((c) => [
      c.key,
      {
        handle: c.kind === 'web' ? 'sunmedx.app' : '',
        account_id: '',
        sender_email: '',
        secret_env_key: c.secret_env_key,
        wizard_completed: c.kind === 'web',
        automation_key: c.automation_key,
        delay_days: c.kind === 'email' ? 1 : 0,
        cadence: c.cadence,
        enabled: c.kind === 'web',
      },
    ])
  );
}

function storageLabel(mode?: string): string {
  if (mode === 'cloudflare-d1') return 'Cloudflare D1 (Persistent SQLite)';
  if (mode === 'cloudflare-kv') return 'Cloudflare Workers KV (Persistent Edge Store)';
  if (mode === 'memory') return 'Worker Memory + Browser Mirror';
  return 'Local JSON + Browser Mirror';
}

export function ChannelsPage() {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [config, setConfig] = useState<Record<string, ChannelConfig>>(defaultConfigs);
  const [automations, setAutomations] = useState(
    AUTOMATION_DEFAULTS.map((a) => ({ key: a.key, name: a.name }))
  );
  const [live, setLive] = useState<Record<string, boolean> | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [showCloudflareGuide, setShowCloudflareGuide] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  // Per-channel Setup Wizard state
  const [wizardItem, setWizardItem] = useState<ChannelCatalogItem | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardDraft, setWizardDraft] = useState<ChannelConfig | null>(null);
  const [wizardError, setWizardError] = useState('');
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizTestEmail, setWizTestEmail] = useState('');
  const [wizTesting, setWizTesting] = useState(false);
  const [wizTestResult, setWizTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [chRes, autoRes, healthRes] = await Promise.all([
        api.channels.list(),
        api.automations.list(),
        api.health().catch(() => null),
      ]);
      const next = defaultConfigs();
      (chRes.items || []).forEach((ch) => {
        if (next[ch.key]) {
          next[ch.key] = {
            handle: ch.handle || '',
            account_id: ch.account_id || '',
            sender_email: ch.sender_email || '',
            secret_env_key: ch.secret_env_key || next[ch.key].secret_env_key,
            wizard_completed: Boolean(ch.wizard_completed),
            automation_key: ch.automation_key || next[ch.key].automation_key,
            delay_days: ch.delay_days ?? next[ch.key].delay_days,
            cadence: ch.cadence || next[ch.key].cadence,
            enabled: Boolean(ch.enabled),
          };
        }
      });
      if (autoRes.items?.length) {
        setAutomations(autoRes.items.map((a) => ({ key: a.key, name: a.name })));
      }
      if (healthRes) {
        setHealth(healthRes);
      }
      setConfig(next);
      setSavedOnce((chRes.items || []).length > 0);
    } catch {
      // Keep UI responsive on transient network failure
    } finally {
      setLoading(false);
    }
  }, []);

  const checkConnections = useCallback(async () => {
    setChecking(true);
    try {
      const map = await api.channels.connections();
      setLive(map || {});
    } catch {
      setLive({});
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    load();
    checkConnections();
  }, [load, checkConnections]);

  function updateField(key: string, patch: Partial<ChannelConfig>) {
    setConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  async function saveAll(overrideConfig?: Record<string, ChannelConfig>, toastMessage = 'Wiring saved') {
    if (saving) return;
    setSaving(true);
    const source = overrideConfig || config;
    try {
      const payload = CHANNEL_CATALOG.map((item) => {
        const cfg = source[item.key] || defaultConfigs()[item.key];
        return {
          key: item.key,
          name: item.name,
          kind: item.kind,
          integration: item.integration || '',
          handle: cfg.handle || '',
          account_id: cfg.account_id || '',
          sender_email: cfg.sender_email || '',
          secret_env_key: cfg.secret_env_key || item.secret_env_key,
          wizard_completed: Boolean(cfg.wizard_completed),
          automation_key: cfg.automation_key || '',
          delay_days: Math.max(0, Math.min(90, Number(cfg.delay_days) || 0)),
          cadence: cfg.cadence || '',
          enabled: Boolean(cfg.enabled),
        };
      });
      await api.channels.saveBulk(payload);
      await load();
      await checkConnections();
      setSavedOnce(true);
      toast.success(toastMessage);
    } catch {
      toast.error('That save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function openWizard(item: ChannelCatalogItem) {
    const current = config[item.key] || defaultConfigs()[item.key];
    setWizardItem(item);
    setWizardDraft({ ...current });
    setWizardStep(1);
    setWizardError('');
    setWizTestEmail(current.sender_email || '');
    setWizTestResult(null);
  }

  function closeWizard() {
    if (wizardSaving) return;
    setWizardItem(null);
    setWizardDraft(null);
    setWizardError('');
    setWizTestResult(null);
  }

  async function sendWizardTestEmail() {
    const target = wizTestEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setWizTestResult({ ok: false, message: 'Enter a valid recipient email address.' });
      return;
    }
    setWizTesting(true);
    setWizTestResult(null);
    try {
      const res = await api.email.test({
        toEmail: target,
        senderEmail: wizardDraft?.sender_email?.trim() || undefined,
      });
      if (res.ok) {
        setWizTestResult({
          ok: true,
          message: `Delivered to ${target} via ${res.provider} (sender: ${
            res.senderEmail || 'verified'
          }${res.messageId ? ` · ID: ${res.messageId}` : ''})`,
        });
        toast.success(`Test email sent via ${res.provider}`);
      } else {
        setWizTestResult({
          ok: false,
          message: res.error || 'Email provider rejected the test send.',
        });
      }
    } catch (err) {
      setWizTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Test send failed.',
      });
    } finally {
      setWizTesting(false);
    }
  }

  function nextWizardStep() {
    if (!wizardItem || !wizardDraft) return;
    if (wizardStep === 2) {
      if (wizardItem.kind !== 'web' && !(wizardDraft.handle || '').trim()) {
        setWizardError(`Enter your ${wizardItem.handle_label.toLowerCase()} to continue.`);
        return;
      }
      if (wizardItem.needs_sender_email && (wizardDraft.sender_email || '').trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((wizardDraft.sender_email || '').trim())) {
          setWizardError('Enter a valid sender email address.');
          return;
        }
      }
      if (wizardItem.needs_sender_email && !(wizardDraft.sender_email || '').trim()) {
        setWizardError('Enter the verified sender email address for this provider.');
        return;
      }
    }
    setWizardError('');
    setWizardStep((s) => Math.min(4, s + 1));
  }

  async function completeWizard() {
    if (!wizardItem || !wizardDraft || wizardSaving) return;
    if (wizardItem.kind !== 'web' && !(wizardDraft.handle || '').trim()) {
      setWizardError(`Enter your ${wizardItem.handle_label.toLowerCase()} first.`);
      setWizardStep(2);
      return;
    }
    if (
      wizardItem.needs_sender_email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((wizardDraft.sender_email || '').trim())
    ) {
      setWizardError('Enter a valid verified sender email address.');
      setWizardStep(2);
      return;
    }
    setWizardSaving(true);
    setWizardError('');
    try {
      const completedDraft: ChannelConfig = {
        ...wizardDraft,
        handle: (wizardDraft.handle || '').trim(),
        account_id: (wizardDraft.account_id || '').trim(),
        sender_email: (wizardDraft.sender_email || '').trim().toLowerCase(),
        wizard_completed: true,
        enabled: true,
      };
      const nextConfig = {
        ...config,
        [wizardItem.key]: completedDraft,
      };
      setConfig(nextConfig);
      await saveAll(nextConfig, `${wizardItem.name} setup saved & activated`);
      setWizardItem(null);
      setWizardDraft(null);
    } catch {
      setWizardError('Could not save wizard setup right now. Try again.');
    } finally {
      setWizardSaving(false);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Clipboard permission unavailable');
    }
  }

  async function exportBackup() {
    try {
      const snapshot = await api.state.get();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sunmedx-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Full state backup downloaded');
    } catch {
      toast.error('Export failed. Try again.');
    }
  }

  async function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppStateSnapshot>;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid backup format');
      }
      await api.state.restore(parsed);
      await load();
      await checkConnections();
      toast.success('Backup restored across workspace');
    } catch {
      toast.error('Could not import backup JSON file.');
    }
  }

  const visibleCatalog = CHANNEL_CATALOG.filter((c) =>
    category === 'all' ? true : c.kind === category
  );

  const socialCount = CHANNEL_CATALOG.filter((c) => c.kind === 'social').length;
  const emailCount = CHANNEL_CATALOG.filter((c) => c.kind === 'email').length;
  const liveCount = CHANNEL_CATALOG.filter((c) => {
    const cfg = config[c.key];
    return (
      c.kind === 'web' ||
      Boolean(
        (live && live[c.integration]) ||
          cfg?.handle?.trim() ||
          cfg?.account_id?.trim() ||
          cfg?.sender_email?.trim() ||
          cfg?.wizard_completed
      )
    );
  }).length;
  const wizardDoneCount = CHANNEL_CATALOG.filter(
    (c) => c.kind === 'web' || config[c.key]?.wizard_completed
  ).length;
  const wiredCount = CHANNEL_CATALOG.filter(
    (c) => config[c.key]?.enabled && config[c.key]?.automation_key
  ).length;
  const pausedCount = CHANNEL_CATALOG.filter((c) => !config[c.key]?.enabled).length;

  return (
    <div className="sx-page">
      <PageHead
        meta="Setup · Social, Email & Cloudflare Persistence"
        title="Accounts, wizards & Cloudflare storage"
        lede="Run guided setup wizards for Pinterest, social platforms, and Brevo/email providers, wire each channel to an automation, and store everything durably in Cloudflare."
      >
        <button
          type="button"
          className="sx-btn sx-btn-ghost"
          onClick={() => setShowCloudflareGuide((v) => !v)}
        >
          <Cloud /> {showCloudflareGuide ? 'Hide Cloudflare guide' : 'Cloudflare storage guide'}
        </button>
      </PageHead>

      <div className="sx-storage-banner">
        <div className="sx-storage-banner-main">
          <Database size={16} />
          <div>
            <strong>Active persistence: {storageLabel(health?.storage)}</strong>
            <span>
              {health?.cloudflarePersistent
                ? 'Edge persistence is active on Cloudflare — all leads, wizards, campaigns, and settings save permanently.'
                : 'Changes auto-mirror cleanly in this browser across exits. Bind SUNMEDX_KV or SUNMEDX_DB in Cloudflare for shared multi-device edge storage.'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="sx-btn sx-btn-ghost sx-btn-sm"
            onClick={() => setShowCloudflareGuide((v) => !v)}
          >
            {showCloudflareGuide ? 'Close instructions' : 'Setup Cloudflare KV / D1'}
          </button>
          <button type="button" className="sx-btn sx-btn-ghost sx-btn-sm" onClick={exportBackup}>
            <Download /> Export JSON
          </button>
          <button
            type="button"
            className="sx-btn sx-btn-ghost sx-btn-sm"
            onClick={() => importInputRef.current?.click()}
          >
            <Upload /> Restore JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportBackup}
          />
        </div>
      </div>

      {showCloudflareGuide && (
        <div style={{ marginBottom: 22 }}>
          <Card
            title="How data is stored in Cloudflare (no Firebase needed)"
            note="Your Cloudflare Worker already supports both Cloudflare D1 (SQLite) and Cloudflare Workers KV out of the box in worker/index.ts."
          >
            <div className="sx-cf-grid">
              <div className="sx-cf-box">
                <div className="sx-cf-head">
                  <strong>Option A · Cloudflare Workers KV (Fastest setup)</strong>
                  <Badge tone="blue">SUNMEDX_KV</Badge>
                </div>
                <ol className="sx-cf-steps">
                  <li>
                    Run in your terminal:{' '}
                    <code className="sx-code">npx wrangler kv namespace create SUNMEDX_KV</code>
                  </li>
                  <li>
                    In Cloudflare Dashboard, go to <strong>Workers &amp; Pages -&gt; sunmedx-funnel-autopilot -&gt; Settings -&gt; Bindings</strong>, click <strong>Add -&gt; KV Namespace</strong>, set Variable name <code className="sx-code">SUNMEDX_KV</code>.
                  </li>
                  <li>
                    Or paste the generated namespace ID into <code className="sx-code">wrangler.jsonc</code> under <code className="sx-code">kv_namespaces</code> and redeploy.
                  </li>
                </ol>
                <button
                  type="button"
                  className="sx-btn sx-btn-ghost sx-btn-sm"
                  onClick={() =>
                    copyText('npx wrangler kv namespace create SUNMEDX_KV', 'KV command')
                  }
                >
                  <Copy /> Copy KV command
                </button>
              </div>

              <div className="sx-cf-box">
                <div className="sx-cf-head">
                  <strong>Option B · Cloudflare D1 (Relational SQLite)</strong>
                  <Badge tone="teal">SUNMEDX_DB</Badge>
                </div>
                <ol className="sx-cf-steps">
                  <li>
                    Run in your terminal:{' '}
                    <code className="sx-code">npx wrangler d1 create sunmedx-db</code>
                  </li>
                  <li>
                    In Cloudflare Dashboard -&gt; <strong>Settings -&gt; Bindings</strong>, add a <strong>D1 Database</strong> binding named <code className="sx-code">SUNMEDX_DB</code>.
                  </li>
                  <li>
                    No SQL migration required — <code className="sx-code">worker/index.ts</code> automatically creates <code className="sx-code">sunmedx_state</code> on first request and persists every change.
                  </li>
                </ol>
                <button
                  type="button"
                  className="sx-btn sx-btn-ghost sx-btn-sm"
                  onClick={() => copyText('npx wrangler d1 create sunmedx-db', 'D1 command')}
                >
                  <Copy /> Copy D1 command
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="lg-steps" role="tablist" aria-label="Setup steps">
        {SETUP_TABS.map((label, idx) => {
          const n = idx + 1;
          const state = step === n ? 'active' : savedOnce && n === 1 ? 'done' : 'idle';
          return (
            <React.Fragment key={label}>
              {idx > 0 && <span className="lg-step-sep" aria-hidden="true" />}
              <button
                type="button"
                role="tab"
                aria-selected={step === n}
                className="lg-step"
                data-state={state}
                onClick={() => setStep(n)}
              >
                <span className="lg-step-index">
                  {state === 'done' && step !== n ? '✓' : n}
                </span>
                {label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="sx-cat-bar" role="group" aria-label="Filter channel category">
        <button
          type="button"
          className="lg-chip"
          data-on={category === 'all'}
          onClick={() => setCategory('all')}
        >
          All platforms ({CHANNEL_CATALOG.length})
        </button>
        <button
          type="button"
          className="lg-chip"
          data-on={category === 'social'}
          onClick={() => setCategory('social')}
        >
          <Share2 size={12} style={{ marginRight: 6 }} /> Social media ({socialCount})
        </button>
        <button
          type="button"
          className="lg-chip"
          data-on={category === 'email'}
          onClick={() => setCategory('email')}
        >
          <Mail size={12} style={{ marginRight: 6 }} /> Email marketing ({emailCount})
        </button>
        <button
          type="button"
          className="lg-chip"
          data-on={category === 'web'}
          onClick={() => setCategory('web')}
        >
          Web funnel (1)
        </button>
      </div>

      {loading ? (
        <p className="sx-muted">Loading your accounts &amp; wizards…</p>
      ) : (
        <>
          {step === 1 && (
            <Card
              title="Connected accounts & Setup Wizards"
              note="Launch the guided wizard on any social platform (Pinterest, Instagram, Facebook, LinkedIn, X, TikTok, YouTube) or email platform (Brevo, Mailchimp, Klaviyo, Kit, ActiveCampaign, Resend, Gmail)."
              action={
                <button
                  type="button"
                  className="sx-btn sx-btn-ghost sx-btn-sm"
                  onClick={checkConnections}
                  disabled={checking}
                >
                  {checking ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  Check connections
                </button>
              }
            >
              {visibleCatalog.map((ch) => {
                const cfg = config[ch.key] || defaultConfigs()[ch.key];
                const isLive =
                  ch.kind === 'web' ||
                  Boolean(
                    (live && live[ch.integration]) ||
                      cfg?.handle?.trim() ||
                      cfg?.account_id?.trim() ||
                      cfg?.sender_email?.trim() ||
                      cfg?.wizard_completed
                  );
                return (
                  <div key={ch.key} className="lg-row lg-row-wizard">
                    <div style={{ minWidth: 0 }}>
                      <div className="lg-name">
                        <strong>{ch.name}</strong>
                        <Badge tone={KIND_TONES[ch.kind]}>{ch.kind}</Badge>
                        {ch.kind !== 'web' && cfg.wizard_completed && (
                          <Badge tone="green">Wizard complete</Badge>
                        )}
                        {ch.key === 'brevo' && health && (
                          <Badge tone={health.brevoConfigured ? 'green' : 'warm'}>
                            {health.brevoConfigured ? 'Server key active' : 'BREVO_API_KEY missing'}
                          </Badge>
                        )}
                      </div>
                      <p className="lg-hint">
                        {ch.kind === 'web'
                          ? 'Built-in landing page, Lead Magnet form, and AI chat advisor.'
                          : [
                              cfg.secret_env_key ? `Secret: ${cfg.secret_env_key}` : '',
                              cfg.account_id ? `ID: ${cfg.account_id}` : '',
                              cfg.sender_email ? `From: ${cfg.sender_email}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Run the 4-step wizard to configure keys, IDs, and cadence.'}
                      </p>
                    </div>

                    <div className="sx-field">
                      <label className="sx-label" htmlFor={`handle-${ch.key}`}>
                        {ch.handle_label}
                      </label>
                      <input
                        id={`handle-${ch.key}`}
                        className="sx-input"
                        value={cfg.handle || ''}
                        onChange={(e) => updateField(ch.key, { handle: e.target.value })}
                        placeholder={ch.handle_placeholder}
                        disabled={ch.kind === 'web'}
                      />
                    </div>

                    <div className="lg-row-actions">
                      {ch.kind === 'web' ? (
                        <Badge tone="teal">Built in</Badge>
                      ) : (
                        <Badge tone={isLive ? 'green' : 'gray'}>
                          {checking ? 'Checking…' : isLive ? 'Connected' : 'Not connected'}
                        </Badge>
                      )}
                      <button
                        type="button"
                        className={`sx-btn sx-btn-sm ${
                          cfg.wizard_completed ? 'sx-btn-ghost' : 'sx-btn-cobalt'
                        }`}
                        onClick={() => openWizard(ch)}
                      >
                        {cfg.wizard_completed ? <Sliders /> : <Wand2 />}
                        {cfg.wizard_completed ? 'Reconfigure' : 'Setup Wizard'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {step === 2 && (
            <Card
              title="Automation wiring"
              note="Each channel points at one trigger. That is what fires when a lead arrives from it, and what generated kits activate against."
            >
              {visibleCatalog.map((ch) => {
                const cfg = config[ch.key] || defaultConfigs()[ch.key];
                return (
                  <div key={ch.key} className="lg-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="lg-name">
                        <strong>{ch.name}</strong>
                        <Badge tone={KIND_TONES[ch.kind]}>{ch.kind}</Badge>
                      </div>
                    </div>
                    <div className="sx-field">
                      <label className="sx-label" htmlFor={`auto-${ch.key}`}>
                        Fires
                      </label>
                      <select
                        id={`auto-${ch.key}`}
                        className="sx-native"
                        value={cfg.automation_key || ''}
                        onChange={(e) =>
                          updateField(ch.key, { automation_key: e.target.value })
                        }
                      >
                        <option value="">No automation</option>
                        {automations.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                      <div className="sx-field" style={{ width: 80 }}>
                        <label className="sx-label" htmlFor={`delay-${ch.key}`}>
                          + days
                        </label>
                        <input
                          id={`delay-${ch.key}`}
                          type="number"
                          min="0"
                          max="90"
                          className="sx-input"
                          value={cfg.delay_days ?? 0}
                          onChange={(e) =>
                            updateField(ch.key, { delay_days: Number(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="sx-switch"
                        role="switch"
                        aria-checked={cfg.enabled ? 'true' : 'false'}
                        aria-label={`${ch.name} ${cfg.enabled ? 'on' : 'off'}`}
                        onClick={() => updateField(ch.key, { enabled: !cfg.enabled })}
                      />
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {step === 3 && (
            <div className="sx-stack">
              <Card
                title="Channel readiness summary"
                note="Live status across all social, email, and web channels."
              >
                <div className="sx-metrics">
                  <Metric
                    label="Accounts connected"
                    value={`${liveCount} / ${CHANNEL_CATALOG.length}`}
                    accent="emerald"
                  />
                  <Metric
                    label="Wizards completed"
                    value={`${wizardDoneCount} / ${CHANNEL_CATALOG.length}`}
                    accent="sky"
                  />
                  <Metric label="Channels wired" value={wiredCount} accent="violet" />
                  <Metric label="Paused" value={pausedCount} accent="amber" />
                </div>
              </Card>
              <Card
                title="Cadence"
                note="How often the console expects a post, pin, or email sequence on each account."
              >
                {visibleCatalog.map((ch) => {
                  const cfg = config[ch.key] || defaultConfigs()[ch.key];
                  return (
                    <div key={ch.key} className="lg-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="lg-name">
                          <strong>{ch.name}</strong>
                          <Badge tone={KIND_TONES[ch.kind]}>{ch.kind}</Badge>
                        </div>
                        <p className="lg-hint">
                          {cfg.enabled
                            ? cfg.automation_key
                              ? `Wired to ${cfg.automation_key.replace(/_/g, ' ')}`
                              : 'Not wired to an automation yet'
                            : 'Switched off — autopilot skips it'}
                        </p>
                      </div>
                      <div className="sx-field">
                        <label className="sx-label" htmlFor={`cadence-${ch.key}`}>
                          Cadence
                        </label>
                        <input
                          id={`cadence-${ch.key}`}
                          className="sx-input"
                          value={cfg.cadence || ''}
                          onChange={(e) =>
                            updateField(ch.key, { cadence: e.target.value })
                          }
                          disabled={ch.kind === 'web'}
                        />
                      </div>
                      <Badge tone={cfg.enabled ? 'teal' : 'gray'}>
                        {cfg.enabled ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          <div className="lg-footer">
            <button
              type="button"
              className="sx-btn sx-btn-ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              Back
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="sx-btn sx-btn-ghost"
                onClick={() => saveAll()}
                disabled={saving}
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
                Save changes
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  className="sx-btn sx-btn-primary"
                  onClick={() => setStep((s) => Math.min(3, s + 1))}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="sx-btn sx-btn-primary"
                  onClick={() => saveAll()}
                  disabled={saving}
                >
                  {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
                  {savedOnce ? 'Save & sync wiring' : 'Save wiring'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {wizardItem && wizardDraft && (
        <div
          className="sx-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wiz-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeWizard();
          }}
        >
          <div className="sx-card sx-dialog sx-wizard-dialog">
            <div className="sx-card-head" style={{ alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 id="wiz-title" className="sx-card-title" style={{ fontSize: 17 }}>
                    {wizardItem.name} Setup Wizard
                  </h2>
                  <Badge tone={KIND_TONES[wizardItem.kind]}>{wizardItem.kind}</Badge>
                </div>
                <p className="sx-card-note">
                  Guided 4-step configuration · saves to server storage &amp; browser mirror
                </p>
              </div>
              <button
                type="button"
                className="cw-close"
                onClick={closeWizard}
                aria-label="Close wizard"
              >
                <X size={16} />
              </button>
            </div>

            <div className="sx-wiz-steps">
              {WIZARD_STEPS.map((label, idx) => {
                const n = idx + 1;
                const state = wizardStep === n ? 'active' : wizardStep > n ? 'done' : 'idle';
                return (
                  <button
                    key={label}
                    type="button"
                    className="lg-step"
                    data-state={state}
                    onClick={() => {
                      setWizardError('');
                      setWizardStep(n);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {wizardStep === 1 && (
              <div className="sx-wiz-body">
                <p className="sx-card-note" style={{ marginTop: 0 }}>
                  Follow these steps in <strong>{wizardItem.portal_label}</strong>, then store your API token safely as a Cloudflare Worker secret (never inside frontend source code):
                </p>
                <ol className="sx-cf-steps">
                  {wizardItem.setup_steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>

                {wizardItem.secret_env_key && (
                  <div className="sx-wiz-secret-box">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span className="sx-label" style={{ marginBottom: 0 }}>
                          Cloudflare Worker Runtime Secret
                        </span>
                        {wizardItem.key === 'brevo' && health && (
                          <Badge tone={health.brevoConfigured ? 'green' : 'warm'}>
                            {health.brevoConfigured ? 'Detected live' : 'Not detected on Worker'}
                          </Badge>
                        )}
                        {wizardItem.key === 'resend' && health && (
                          <Badge tone={health.resendConfigured ? 'green' : 'warm'}>
                            {health.resendConfigured ? 'Detected live' : 'Not detected on Worker'}
                          </Badge>
                        )}
                      </div>
                      <code className="sx-code" style={{ fontSize: 12.5 }}>
                        {wizardItem.secret_env_key}
                      </code>
                      {(wizardItem.key === 'brevo' || wizardItem.key === 'resend') && (
                        <p className="lg-hint" style={{ marginTop: 4 }}>
                          {wizardItem.key === 'brevo'
                            ? 'Add BREVO_API_KEY under Cloudflare Dashboard → Workers & Pages → Settings → Variables and Secrets (Runtime, not Build variables), then redeploy. RESEND_API_KEY is not needed for Brevo.'
                            : 'Optional alternative if you do not use Brevo. Add under Cloudflare Dashboard → Workers & Pages → Settings → Variables and Secrets (Runtime), then redeploy.'}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="sx-btn sx-btn-ghost sx-btn-sm"
                      onClick={() =>
                        copyText(
                          `npx wrangler secret put ${wizardItem.secret_env_key}`,
                          'Wrangler secret command'
                        )
                      }
                    >
                      <Copy /> Copy CLI cmd
                    </button>
                  </div>
                )}

                <div className="sx-wiz-secret-box">
                  <div style={{ minWidth: 0 }}>
                    <span className="sx-label" style={{ marginBottom: 3 }}>
                      Developer Console URL
                    </span>
                    <span
                      className="sx-code"
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {wizardItem.portal_url}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sx-btn sx-btn-ghost sx-btn-sm"
                    onClick={() => copyText(wizardItem.portal_url, 'Portal URL')}
                  >
                    <Copy /> Copy URL
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="sx-wiz-body">
                <div className="sx-field">
                  <label className="sx-label" htmlFor="wiz-handle">
                    {wizardItem.handle_label}
                  </label>
                  <input
                    id="wiz-handle"
                    className="sx-input"
                    value={wizardDraft.handle}
                    onChange={(e) => {
                      setWizardDraft({ ...wizardDraft, handle: e.target.value });
                      if (wizardError) setWizardError('');
                    }}
                    placeholder={wizardItem.handle_placeholder}
                    disabled={wizardItem.kind === 'web'}
                  />
                </div>

                {wizardItem.account_id_label && (
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="wiz-account-id">
                      {wizardItem.account_id_label}
                    </label>
                    <input
                      id="wiz-account-id"
                      className="sx-input"
                      value={wizardDraft.account_id}
                      onChange={(e) =>
                        setWizardDraft({ ...wizardDraft, account_id: e.target.value })
                      }
                      placeholder={wizardItem.account_id_placeholder}
                    />
                  </div>
                )}

                {wizardItem.needs_sender_email && (
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="wiz-sender-email">
                      Verified Sender Email
                    </label>
                    <input
                      id="wiz-sender-email"
                      type="email"
                      className="sx-input"
                      value={wizardDraft.sender_email}
                      onChange={(e) => {
                        setWizardDraft({ ...wizardDraft, sender_email: e.target.value });
                        if (wizardError) setWizardError('');
                      }}
                      placeholder="founder@sunmedx.app"
                    />
                  </div>
                )}
              </div>
            )}

            {wizardStep === 3 && (
              <div className="sx-wiz-body">
                <div className="sx-row-2">
                  <div className="sx-field">
                    <label className="sx-label" htmlFor="wiz-auto">
                      Trigger Automation
                    </label>
                    <select
                      id="wiz-auto"
                      className="sx-native"
                      value={wizardDraft.automation_key}
                      onChange={(e) =>
                        setWizardDraft({ ...wizardDraft, automation_key: e.target.value })
                      }
                    >
                      <option value="">No automation</option>
                      {automations.map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sx-field">
                    <label className="sx-label" htmlFor="wiz-delay">
                      Delay (days)
                    </label>
                    <input
                      id="wiz-delay"
                      type="number"
                      min="0"
                      max="90"
                      className="sx-input"
                      value={wizardDraft.delay_days}
                      onChange={(e) =>
                        setWizardDraft({
                          ...wizardDraft,
                          delay_days: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="sx-field">
                  <label className="sx-label" htmlFor="wiz-cadence">
                    Publishing / Sending Cadence
                  </label>
                  <input
                    id="wiz-cadence"
                    className="sx-input"
                    value={wizardDraft.cadence}
                    onChange={(e) =>
                      setWizardDraft({ ...wizardDraft, cadence: e.target.value })
                    }
                    placeholder={wizardItem.cadence}
                  />
                </div>

                <div
                  className="sx-wiz-secret-box"
                  style={{ marginTop: 14, alignItems: 'center' }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>Enable channel in Autopilot</strong>
                    <p className="lg-hint" style={{ marginTop: 2 }}>
                      Included when generating &amp; activating campaign kits
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sx-switch"
                    role="switch"
                    aria-checked={wizardDraft.enabled ? 'true' : 'false'}
                    onClick={() =>
                      setWizardDraft({ ...wizardDraft, enabled: !wizardDraft.enabled })
                    }
                  />
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="sx-wiz-body">
                <div className="sx-wiz-review">
                  <div>
                    <span>Platform</span>
                    <strong>{wizardItem.name}</strong>
                  </div>
                  <div>
                    <span>{wizardItem.handle_label}</span>
                    <strong>{wizardDraft.handle || '—'}</strong>
                  </div>
                  {wizardItem.account_id_label && (
                    <div>
                      <span>{wizardItem.account_id_label}</span>
                      <strong>{wizardDraft.account_id || 'Optional (not specified)'}</strong>
                    </div>
                  )}
                  {wizardItem.needs_sender_email && (
                    <div>
                      <span>Verified Sender Email</span>
                      <strong>{wizardDraft.sender_email || '—'}</strong>
                    </div>
                  )}
                  <div>
                    <span>Automation</span>
                    <strong>
                      {automations.find((a) => a.key === wizardDraft.automation_key)?.name ||
                        'None'}{' '}
                      (+{wizardDraft.delay_days}d)
                    </strong>
                  </div>
                  <div>
                    <span>Cadence</span>
                    <strong>{wizardDraft.cadence || wizardItem.cadence}</strong>
                  </div>
                  {wizardItem.secret_env_key && (
                    <div>
                      <span>Cloudflare Worker Secret</span>
                      <code className="sx-code">{wizardItem.secret_env_key}</code>
                    </div>
                  )}
                </div>

                {(wizardItem.key === 'brevo' || wizardItem.key === 'resend') && (
                  <div
                    className="sx-wiz-secret-box"
                    style={{ marginTop: 14, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>Send live test email</strong>
                      <Badge
                        tone={
                          (wizardItem.key === 'brevo'
                            ? health?.brevoConfigured
                            : health?.resendConfigured)
                            ? 'green'
                            : 'warm'
                        }
                      >
                        {(wizardItem.key === 'brevo'
                          ? health?.brevoConfigured
                          : health?.resendConfigured)
                          ? 'Worker key active'
                          : 'Key missing in Runtime Secrets'}
                      </Badge>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <input
                        type="email"
                        className="sx-input"
                        value={wizTestEmail}
                        onChange={(e) => setWizTestEmail(e.target.value)}
                        placeholder="Recipient email (e.g. you@gmail.com)"
                        aria-label="Test recipient email"
                        style={{ flex: '1 1 200px' }}
                      />
                      <button
                        type="button"
                        className="sx-btn sx-btn-cobalt sx-btn-sm"
                        onClick={sendWizardTestEmail}
                        disabled={wizTesting}
                      >
                        {wizTesting ? <LoaderCircle className="animate-spin" /> : <Send />}
                        Send test
                      </button>
                    </div>
                    {wizTestResult && (
                      <p
                        role={wizTestResult.ok ? 'status' : 'alert'}
                        style={{
                          margin: 0,
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: wizTestResult.ok ? 'var(--sx-green-ink)' : 'var(--sx-red-ink)',
                        }}
                      >
                        {wizTestResult.message}
                      </p>
                    )}
                  </div>
                )}

                <p className="lg-hint" style={{ marginTop: 10 }}>
                  Saving now marks <strong>{wizardItem.name}</strong> as configured and persists immediately across sessions.
                </p>
              </div>
            )}

            {wizardError && (
              <p role="alert" style={{ color: '#fda4af', fontSize: 12.5, margin: '12px 0 0' }}>
                {wizardError}
              </p>
            )}

            <div className="lg-footer" style={{ marginTop: 18 }}>
              <button
                type="button"
                className="sx-btn sx-btn-ghost"
                onClick={() =>
                  wizardStep === 1 ? closeWizard() : setWizardStep((s) => Math.max(1, s - 1))
                }
              >
                {wizardStep === 1 ? 'Cancel' : 'Back'}
              </button>

              {wizardStep < 4 ? (
                <button
                  type="button"
                  className="sx-btn sx-btn-primary"
                  onClick={nextWizardStep}
                >
                  Next step <ArrowRight />
                </button>
              ) : (
                <button
                  type="button"
                  className="sx-btn sx-btn-primary"
                  onClick={completeWizard}
                  disabled={wizardSaving}
                >
                  {wizardSaving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CheckCircle2 />
                  )}
                  Complete Setup &amp; Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
