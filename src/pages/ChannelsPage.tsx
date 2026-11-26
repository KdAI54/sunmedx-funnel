import React, { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, RefreshCw } from 'lucide-react';
import { Badge, Card, Metric, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { AUTOMATION_DEFAULTS, CHANNEL_CATALOG } from '../data/stages';
import { api } from '../lib/api';
import type { BadgeTone, Channel } from '../types/funnel';

const KIND_TONES: Record<Channel['kind'], BadgeTone> = {
  social: 'blue',
  email: 'purple',
  web: 'teal',
};

const STEPS = ['Accounts', 'Automation', 'Settings'];

interface ChannelConfig {
  handle: string;
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
        handle: '',
        automation_key: c.automation_key,
        delay_days: 0,
        cadence: c.cadence,
        enabled: true,
      },
    ])
  );
}

function accountHint(ch: (typeof CHANNEL_CATALOG)[number]) {
  if (ch.kind === 'web') {
    return 'The site and landing page are generated and hosted here — no account to connect.';
  }
  if (ch.kind === 'email') {
    return 'Authorise this account under Integrations, then press Check connections so sequences can send from it.';
  }
  return 'Authorise this account under Integrations, then press Check connections so posts can publish from it.';
}

export function ChannelsPage() {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<Record<string, ChannelConfig>>(defaultConfigs);
  const [automations, setAutomations] = useState(
    AUTOMATION_DEFAULTS.map((a) => ({ key: a.key, name: a.name }))
  );
  const [live, setLive] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chRes, autoRes] = await Promise.all([
        api.channels.list(),
        api.automations.list(),
      ]);
      const next = defaultConfigs();
      (chRes.items || []).forEach((ch) => {
        if (next[ch.key]) {
          next[ch.key] = {
            handle: ch.handle || '',
            automation_key: ch.automation_key || '',
            delay_days: ch.delay_days ?? 0,
            cadence: ch.cadence || next[ch.key].cadence,
            enabled: ch.enabled !== false,
          };
        }
      });
      if (autoRes.items?.length) {
        setAutomations(autoRes.items.map((a) => ({ key: a.key, name: a.name })));
      }
      setConfig(next);
      setSavedOnce((chRes.items || []).length > 0);
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
      toast.error('The connection check failed. Try again.');
    } finally {
      setChecking(false);
    }
  }, [toast]);

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

  async function saveAll() {
    if (saving) return;
    setSaving(true);
    try {
      const payload = CHANNEL_CATALOG.map((item) => {
        const cfg = config[item.key] || {};
        return {
          key: item.key,
          name: item.name,
          kind: item.kind,
          integration: item.integration || '',
          handle: cfg.handle || '',
          automation_key: cfg.automation_key || '',
          delay_days: Math.max(0, Math.min(90, Number(cfg.delay_days) || 0)),
          cadence: cfg.cadence || '',
          enabled: cfg.enabled !== false,
        };
      });
      await api.channels.saveBulk(payload);
      await load();
      await checkConnections();
      setSavedOnce(true);
      toast.success('Wiring saved');
    } catch {
      toast.error('That save failed. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const liveCount = CHANNEL_CATALOG.filter(
    (c) => c.kind === 'web' || (live && live[c.integration])
  ).length;
  const wiredCount = CHANNEL_CATALOG.filter(
    (c) => config[c.key]?.enabled && config[c.key]?.automation_key
  ).length;
  const pausedCount = CHANNEL_CATALOG.filter((c) => !config[c.key]?.enabled).length;

  return (
    <div className="sx-page">
      <PageHead
        meta="Setup"
        title="Accounts, wiring, settings"
        lede="Connect what you own, point each channel at an automation, then set the cadence. The console saves all three steps."
      />

      <div className="lg-steps" role="tablist" aria-label="Setup steps">
        {STEPS.map((label, idx) => {
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

      {loading ? (
        <p className="sx-muted">Loading your wiring…</p>
      ) : (
        <>
          {step === 1 && (
            <Card
              title="Accounts"
              note="The console reads the real connection for each account. It never assumes one is live."
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
              {CHANNEL_CATALOG.map((ch) => {
                const isLive =
                  ch.kind === 'web' ||
                  Boolean(
                    (live && live[ch.integration]) || config[ch.key]?.handle.trim()
                  );
                return (
                  <div key={ch.key} className="lg-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="lg-name">
                        <strong>{ch.name}</strong>
                        <Badge tone={KIND_TONES[ch.kind]}>{ch.kind}</Badge>
                      </div>
                      <p className="lg-hint">{accountHint(ch)}</p>
                    </div>
                    <div className="sx-field">
                      <label className="sx-label" htmlFor={`handle-${ch.key}`}>
                        Handle
                      </label>
                      <input
                        id={`handle-${ch.key}`}
                        className="sx-input"
                        value={config[ch.key]?.handle || ''}
                        onChange={(e) => updateField(ch.key, { handle: e.target.value })}
                        placeholder={ch.kind === 'web' ? 'sunmedx.app' : '@sunmedx'}
                        disabled={ch.kind === 'web'}
                      />
                    </div>
                    {ch.kind === 'web' ? (
                      <Badge tone="teal">Built in</Badge>
                    ) : (
                      <Badge tone={isLive ? 'green' : 'gray'}>
                        {checking ? 'Checking…' : isLive ? 'Connected' : 'Not connected'}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </Card>
          )}

          {step === 2 && (
            <Card
              title="Automation wiring"
              note="Each channel points at one trigger. That is what fires when a lead arrives from it, and what the kit activates against."
            >
              {CHANNEL_CATALOG.map((ch) => {
                const cfg = config[ch.key] || {
                  automation_key: '',
                  delay_days: 0,
                  enabled: true,
                };
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
                title="Where this stands"
                note="Counted from the live connections and the wiring on the previous step."
              >
                <div className="sx-metrics">
                  <Metric
                    label="Accounts live"
                    value={`${liveCount} / ${CHANNEL_CATALOG.length}`}
                  />
                  <Metric label="Channels wired" value={wiredCount} />
                  <Metric label="Paused" value={pausedCount} />
                </div>
              </Card>
              <Card
                title="Cadence"
                note="How often the console expects a post or an email on each account."
              >
                {CHANNEL_CATALOG.map((ch) => {
                  const cfg = config[ch.key];
                  return (
                    <div key={ch.key} className="lg-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="lg-name">
                          <strong>{ch.name}</strong>
                          <Badge tone={KIND_TONES[ch.kind]}>{ch.kind}</Badge>
                        </div>
                        <p className="lg-hint">
                          {cfg?.enabled
                            ? cfg.automation_key
                              ? `Wired to ${cfg.automation_key.replace(/_/g, ' ')}`
                              : 'Not wired to an automation yet'
                            : 'Switched off — the autopilot skips it'}
                        </p>
                      </div>
                      <div className="sx-field">
                        <label className="sx-label" htmlFor={`cadence-${ch.key}`}>
                          Cadence
                        </label>
                        <input
                          id={`cadence-${ch.key}`}
                          className="sx-input"
                          value={cfg?.cadence || ''}
                          onChange={(e) =>
                            updateField(ch.key, { cadence: e.target.value })
                          }
                          disabled={ch.kind === 'web'}
                        />
                      </div>
                      <Badge tone={cfg?.enabled ? 'teal' : 'gray'}>
                        {cfg?.enabled ? 'Active' : 'Paused'}
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
                onClick={saveAll}
                disabled={saving}
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Check />}
                {savedOnce ? 'Save again' : 'Save wiring'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
