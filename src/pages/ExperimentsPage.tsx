import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, LoaderCircle, Zap } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { pct } from '../lib/format';
import type { Experiment } from '../types/funnel';

export function ExperimentsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Experiment[]>([]);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.experiments.list();
      setItems(res.items || []);
    } catch {
      // Keep UI responsive on transient fetch failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function designTest() {
    if (topic.trim().length < 4) return;
    setBusy('design');
    try {
      await api.ai.designExperiment(topic.trim());
      await load();
      toast.success('A/B test designed');
    } catch {
      toast.error('The test could not be designed. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function judgeTest(exp: Experiment) {
    setBusy(exp.id);
    try {
      const updated = await api.ai.judgeExperiment(exp.id);
      setItems((prev) => prev.map((x) => (x.id === exp.id ? updated : x)));
      toast.success(
        updated.winner === 'undecided'
          ? 'No winner yet'
          : `Variant ${updated.winner} wins`
      );
    } catch {
      toast.error('The verdict failed. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function logVisits(exp: Experiment, variant: 'a' | 'b') {
    const patch =
      variant === 'a'
        ? {
            a_visits: (exp.a_visits || 0) + 20,
            a_conversions: (exp.a_conversions || 0) + 2,
          }
        : {
            b_visits: (exp.b_visits || 0) + 20,
            b_conversions: (exp.b_conversions || 0) + 4,
          };
    try {
      const updated = await api.experiments.update(exp.id, patch);
      setItems((prev) => prev.map((x) => (x.id === exp.id ? updated : x)));
    } catch {
      toast.error('Could not log visits. Try again.');
    }
  }

  return (
    <div className="sx-page">
      <PageHead
        meta="Experiments"
        title="Let the copy compete"
        lede="Two variants, one metric. When the data speaks, the AI names the winner and says what to put back at the top of the funnel."
      />

      <Card
        title="Design a test"
        note="Describe the thing you want to improve. The AI writes both variants."
      >
        <div className="sx-row-2" style={{ alignItems: 'end' }}>
          <div className="sx-field">
            <label className="sx-label" htmlFor="exp-topic">
              What are we testing?
            </label>
            <input
              id="exp-topic"
              className="sx-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Landing page headline or offer framing"
            />
          </div>
          <div>
            <button
              type="button"
              className="sx-btn sx-btn-primary"
              onClick={designTest}
              disabled={busy === 'design'}
            >
              {busy === 'design' ? <LoaderCircle className="animate-spin" /> : <Zap />}
              Design with AI
            </button>
          </div>
        </div>
      </Card>

      <div className="sx-stack" style={{ marginTop: 24 }}>
        {loading ? (
          <p className="sx-muted">Loading experiments…</p>
        ) : items.length === 0 ? (
          <EmptyState title="No experiments yet">
            Design one above — the AI writes both variants for you.
          </EmptyState>
        ) : (
          items.map((exp) => {
            const rateA = pct(exp.a_conversions, exp.a_visits);
            const rateB = pct(exp.b_conversions, exp.b_visits);
            const variants = [
              {
                key: 'A' as const,
                copy: exp.variant_a,
                rate: rateA,
                n: exp.a_conversions,
                visits: exp.a_visits,
              },
              {
                key: 'B' as const,
                copy: exp.variant_b,
                rate: rateB,
                n: exp.b_conversions,
                visits: exp.b_visits,
              },
            ];
            return (
              <Card key={exp.id}>
                <div className="sx-split" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <h2 className="sx-card-title">{exp.name}</h2>
                      <Badge tone={exp.winner === 'undecided' ? 'gray' : 'green'}>
                        {exp.winner === 'undecided'
                          ? 'running'
                          : `winner ${exp.winner}`}
                      </Badge>
                      <Badge tone="gray">{exp.metric}</Badge>
                    </div>
                    <p className="sx-card-note">{exp.hypothesis}</p>
                  </div>
                  <button
                    type="button"
                    className="sx-btn sx-btn-ghost sx-btn-sm"
                    onClick={() => judgeTest(exp)}
                    disabled={!!busy}
                  >
                    {busy === exp.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <FlaskConical />
                    )}
                    Judge
                  </button>
                </div>

                <div className="sx-cols" style={{ marginTop: 14, gap: 12 }}>
                  {variants.map((v) => (
                    <div
                      key={v.key}
                      className="sx-node"
                      data-kind={exp.winner === v.key ? 'conversion' : undefined}
                    >
                      <span className="sx-node-label">Variant {v.key}</span>
                      <span className="sx-node-title">{v.copy || '—'}</span>
                      <span className="sx-node-note">
                        {v.rate}% · {v.n}/{v.visits} ·{' '}
                        <button
                          type="button"
                          className="sx-btn sx-btn-quiet sx-btn-sm"
                          style={{ padding: 0, minHeight: 0 }}
                          onClick={() =>
                            logVisits(exp, v.key.toLowerCase() as 'a' | 'b')
                          }
                        >
                          log +20 visits
                        </button>
                      </span>
                    </div>
                  ))}
                </div>

                {exp.insight && (
                  <p
                    style={{
                      margin: '12px 0 0',
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      color: 'var(--sx-ink-2)',
                    }}
                  >
                    {exp.insight}
                  </p>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
