import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, Zap } from 'lucide-react';
import { Badge, Card, EmptyState, Metric, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { STAGES } from '../data/stages';
import { api } from '../lib/api';
import { formatMoney, pct, timeAgo } from '../lib/format';
import { Link } from '../lib/router';
import type { Activity, Approval, Lead } from '../types/funnel';

export function OverviewPage() {
  const toast = useToast();
  const [state, setState] = useState<{
    loading: boolean;
    leads: Lead[];
    approvals: Approval[];
    activity: Activity[];
  }>({ loading: true, leads: [], approvals: [], activity: [] });
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [leadsRes, approvalsRes, activityRes] = await Promise.all([
        api.leads.list('-created_date'),
        api.approvals.list('pending'),
        api.activities.list({ limit: 6 }),
      ]);
      setState({
        loading: false,
        leads: leadsRes.items || [],
        approvals: (approvalsRes.items || []).slice(0, 4),
        activity: activityRes.items || [],
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAutopilot() {
    setRunning(true);
    try {
      const res = await api.ai.runAutopilot();
      const total = res.scored + res.proposals + res.retention;
      toast.success(
        total
          ? `Autopilot finished: ${res.scored} scored, ${res.proposals} offers drafted, ${res.retention} retention triggers.`
          : 'Autopilot ran. Nothing needed action right now.'
      );
      await load();
    } catch {
      toast.error('Autopilot could not finish. Try again in a moment.');
    } finally {
      setRunning(false);
    }
  }

  const { leads, approvals, activity, loading } = state;
  const hotLeads = leads.filter((l) => l.temperature === 'hot' || l.score >= 70);
  const wonLeads = leads.filter((l) => ['conversion', 'retention'].includes(l.stage));
  const wonRevenue = wonLeads.reduce((sum, l) => sum + (Number(l.deal_value) || 0), 0);
  const maxPerStage = Math.max(
    1,
    ...STAGES.map((s) => leads.filter((l) => l.stage === s.key).length)
  );

  return (
    <div className="sx-page">
      <PageHead
        meta="Sunmedx · funnel autopilot"
        title="Overview"
        lede="Every stranger, stage and automation in one place. The AI does the routine work; the offers wait for you."
      >
        <button
          type="button"
          className="sx-btn sx-btn-primary"
          onClick={runAutopilot}
          disabled={running}
        >
          {running ? <LoaderCircle className="animate-spin" /> : <Zap />}
          {running ? 'Running autopilot' : 'Run autopilot'}
        </button>
      </PageHead>

      <div className="sx-metrics">
        <Metric
          label="Leads captured"
          value={leads.length}
          delta={`${hotLeads.length} hot right now`}
          accent="violet"
        />
        <Metric
          label="Offer pipeline"
          value={formatMoney(wonRevenue)}
          delta={`${wonLeads.length} won`}
          accent="emerald"
        />
        <Metric
          label="Awaiting approval"
          value={approvals.length}
          delta="Pitches gated for you"
          accent="amber"
        />
        <Metric
          label="Activity logged"
          value={leads.filter((l) => l.last_touch).length}
          delta="Leads touched by the AI"
          accent="sky"
        />
      </div>

      <div className="sx-stack" style={{ marginTop: 28 }}>
        <Card
          title="Live funnel architecture"
          note="Six connected stages from visitor capture to repeat buyers. Click any step to inspect leads."
          action={
            <Link to="/board" className="as1-textlink">
              Open funnel board <ArrowRight size={13} />
            </Link>
          }
        >
          <div className="sx-funnel-flow">
            {STAGES.map((stage, idx) => {
              const count = leads.filter((l) => l.stage === stage.key).length;
              const share = pct(count, leads.length);
              const fillPct = Math.round((count / maxPerStage) * 100);
              return (
                <Link
                  key={stage.key}
                  to="/board"
                  className="sx-funnel-step"
                  data-tone={stage.tone}
                >
                  <div className="sx-funnel-step-top">
                    <span className="sx-funnel-num">0{idx + 1}</span>
                    <span className="sx-funnel-pct">{share}%</span>
                  </div>
                  <span className="sx-funnel-name">{stage.name}</span>
                  <span className="sx-funnel-count">{count}</span>
                  <span className="sx-funnel-bar">
                    <span className="sx-funnel-bar-fill" style={{ width: `${fillPct}%` }} />
                  </span>
                  <span className="sx-funnel-sub">{stage.activity}</span>
                </Link>
              );
            })}
          </div>
          {loading && (
            <p className="sx-muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Syncing stage counts…
            </p>
          )}
        </Card>

        <div className="sx-cols">
          <Card
            title="Needs your decision"
            note="Routine work runs itself. Anything a buyer will read waits here."
            action={
              <Link to="/approvals" className="as1-textlink">
                All approvals
              </Link>
            }
          >
            {approvals.length === 0 ? (
              <EmptyState title="Nothing waiting">
                When a hot lead is ready, the AI drafts the offer here for one-click approval.
              </EmptyState>
            ) : (
              <ul className="sx-list">
                {approvals.map((app) => (
                  <li key={app.id} className="sx-item">
                    <div className="sx-item-main">
                      <Link
                        to="/approvals"
                        className="sx-item-link"
                        style={{ display: 'block' }}
                      >
                        <span className="sx-item-title">{app.lead_name}</span>
                        <span className="sx-item-note">{app.subject}</span>
                      </Link>
                    </div>
                    <Badge tone={app.kind === 'proposal' ? 'purple' : 'blue'}>
                      {app.kind}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Live activity"
            note="What the AI did on its own."
            action={
              <Link to="/activity" className="as1-textlink">
                View all
              </Link>
            }
          >
            {activity.length === 0 ? (
              <EmptyState title="No activity yet">
                Capture a lead from the landing page chat and the log fills itself.
              </EmptyState>
            ) : (
              <ul className="sx-list">
                {activity.map((act) => (
                  <li key={act.id} className="sx-item">
                    <div className="sx-item-main">
                      <span className="sx-item-title">{act.summary}</span>
                      <span className="sx-item-note">
                        {act.detail || act.lead_name}
                      </span>
                    </div>
                    <span className="sx-item-meta">{timeAgo(act.created_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card
          title="The three verticals, in one line"
          note="Each stage has a stage node, an AI activity, and an automation that fires on its own."
        >
          <div className="sx-cols" style={{ gap: 12 }}>
            <div className="sx-node">
              <span className="sx-node-label">Funnel stage</span>
              <span className="sx-node-title">Where the lead is</span>
              <span className="sx-node-note">
                Six stages from stranger to repeat buyer.
              </span>
            </div>
            <div className="sx-node" data-kind="activity">
              <span className="sx-node-label">Activity sequence</span>
              <span className="sx-node-title">What the AI does there</span>
              <span className="sx-node-note">
                Chat, scoring, drip, pitch, objection, retention.
              </span>
            </div>
          </div>
          <div className="sx-node" data-kind="automation" style={{ marginTop: 10 }}>
            <span className="sx-node-label">Automation</span>
            <span className="sx-node-title">What fires without you</span>
            <span className="sx-node-note">
              Triggers, delays and the approval gate.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
