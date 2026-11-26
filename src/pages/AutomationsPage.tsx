import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Zap } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { AUTOMATION_DEFAULTS } from '../data/stages';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Automation } from '../types/funnel';

export function AutomationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.automations.list();
      const order = AUTOMATION_DEFAULTS.map((d) => d.key);
      const list = [...(res.items || [])].sort(
        (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
      );
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(item: Automation) {
    const next = !item.enabled;
    setItems((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, enabled: next } : a))
    );
    try {
      await api.automations.update(item.id, { enabled: next });
    } catch {
      toast.error('That toggle did not save.');
      load();
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await api.ai.runAutopilot();
      toast.success(
        res.scored + res.proposals + res.retention
          ? `Ran: ${res.scored} scored · ${res.proposals} offers · ${res.retention} retention`
          : 'Ran. Nothing needed action.'
      );
      await load();
    } catch {
      toast.error('The autopilot run failed. Try again.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="sx-page">
      <PageHead
        meta="Automations"
        title="What fires without you"
        lede="Every switch here is a real trigger the autopilot checks. Turn one off and it stops acting on the next run."
      >
        <button
          type="button"
          className="sx-btn sx-btn-primary"
          onClick={runNow}
          disabled={running}
        >
          {running ? <LoaderCircle className="animate-spin" /> : <Zap />}
          {running ? 'Running' : 'Run autopilot now'}
        </button>
      </PageHead>

      {loading ? (
        <p className="sx-muted">Loading automations…</p>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing configured" />
      ) : (
        <div className="sx-stack">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="sx-split" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <h2 className="sx-card-title">{item.name}</h2>
                    <Badge
                      tone={
                        item.vertical === 'automation'
                          ? 'teal'
                          : item.vertical === 'activity'
                            ? 'purple'
                            : 'gray'
                      }
                    >
                      {item.vertical}
                    </Badge>
                  </div>
                  <p className="sx-card-note">{item.description}</p>
                  <p className="sx-muted" style={{ marginTop: 8 }}>
                    {item.trigger}
                    {item.delay_days
                      ? ` · +${item.delay_days} day${item.delay_days > 1 ? 's' : ''}`
                      : ''}
                    {' · '}
                    {item.run_count || 0} run{(item.run_count || 0) === 1 ? '' : 's'}
                    {item.last_run ? ` · last ${timeAgo(item.last_run)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="sx-switch"
                  role="switch"
                  aria-checked={item.enabled ? 'true' : 'false'}
                  aria-label={`${item.name} ${item.enabled ? 'on' : 'off'}`}
                  onClick={() => toggle(item)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
