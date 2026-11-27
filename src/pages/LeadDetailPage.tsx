import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CircleCheck, LoaderCircle, Send, Zap } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { getStage, stageTone, tempTone } from '../data/stages';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { Link, useRouter } from '../lib/router';
import type { Activity, Lead } from '../types/funnel';

export function LeadDetailPage({ leadId }: { leadId: string }) {
  const { navigate } = useRouter();
  const toast = useToast();
  const [lead, setLead] = useState<Lead | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
  const [busy, setBusy] = useState('');
  const [objection, setObjection] = useState("It's too expensive for me right now");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [leadRes, actRes] = await Promise.all([
        api.leads.get(leadId),
        api.activities.list({ lead_id: leadId, limit: 30 }),
      ]);
      setLead(leadRes);
      setHistory(actRes.items || []);
    } catch {
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  async function scoreLead() {
    setBusy('score');
    try {
      await api.ai.scoreLead(leadId);
      await load();
      toast.success('Lead scored');
    } catch {
      toast.error('Scoring failed. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function draftApproval(kind: 'proposal' | 'reply') {
    setBusy(kind);
    try {
      await api.ai.draftApproval(leadId, kind, kind === 'reply' ? objection : undefined);
      await load();
      toast.success(
        kind === 'reply'
          ? 'Reply drafted — review it in Approvals'
          : 'Offer drafted — review it in Approvals'
      );
      navigate({ to: '/approvals' });
    } catch {
      toast.error('The draft could not be written. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function markWon() {
    if (!lead) return;
    setBusy('won');
    try {
      await api.leads.update(leadId, {
        stage: 'conversion',
        won_at: new Date().toISOString(),
        deal_value: Number(lead.deal_value) || 0,
        next_action: 'Send the onboarding welcome',
      });
      await api.activities.create({
        lead_id: leadId,
        lead_name: lead.full_name,
        stage: 'conversion',
        type: 'payment',
        summary: `${lead.full_name} converted — onboarding fired`,
        detail: 'Marked won by the owner.',
        status: 'done',
        automated: false,
      });
      await load();
      toast.success('Marked won. Onboarding logged.');
    } catch {
      toast.error('Could not mark won. Try again.');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="sx-page">
        <p className="sx-muted">Loading lead…</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="sx-page">
        <Link to="/leads" className="as1-textlink">
          <ArrowLeft size={13} /> All leads
        </Link>
        <p className="sx-muted" style={{ marginTop: 24 }}>
          This lead could not be opened.
        </p>
      </div>
    );
  }

  return (
    <div className="sx-page">
      <Link to="/leads" className="as1-textlink" style={{ marginBottom: 12 }}>
        <ArrowLeft size={13} /> All leads
      </Link>

      <PageHead
        meta={lead.email || 'No email captured'}
        title={lead.full_name}
        lede={
          lead.score_reason ||
          'Not scored yet — the AI reads the signals and decides the next move.'
        }
      >
        <Badge tone={stageTone(lead.stage)}>{getStage(lead.stage).name}</Badge>
        <Badge tone={tempTone(lead.temperature)}>{lead.temperature || 'new'}</Badge>
      </PageHead>

      <div className="sx-metrics">
        <div className="sx-metric">
          <div className="sx-metric-label">Fit score</div>
          <div className="sx-metric-value">{lead.score ?? 0}</div>
          <div className="sx-metric-delta">out of 100</div>
        </div>
        <div className="sx-metric">
          <div className="sx-metric-label">Interest</div>
          <div className="sx-metric-value" style={{ fontSize: 17, lineHeight: 1.5 }}>
            {lead.interest || '—'}
          </div>
          <div className="sx-metric-delta">{lead.source || 'Unknown source'}</div>
        </div>
        <div className="sx-metric">
          <div className="sx-metric-label">Next action</div>
          <div className="sx-metric-value" style={{ fontSize: 15, lineHeight: 1.5 }}>
            {lead.next_action || 'Decide the next step'}
          </div>
          <div className="sx-metric-delta">
            {timeAgo(lead.last_touch || lead.created_date)}
          </div>
        </div>
      </div>

      <div className="sx-cols" style={{ marginTop: 28 }}>
        <Card
          title="Signals the AI reads"
          note="Budget, need and timeline decide hot or cold."
        >
          <ul className="sx-list">
            {(
              [
                ['Need', lead.need_signal],
                ['Budget', lead.budget_signal],
                ['Timeline', lead.timeline_signal],
                ['Notes', lead.notes],
              ] as Array<[string, string | undefined]>
            ).map(([label, val]) => (
              <li key={label} className="sx-item">
                <div className="sx-item-main">
                  <span className="sx-item-title">{label}</span>
                  <span className="sx-item-note">{val || 'Nothing captured yet'}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Act on this lead"
          note="Routine replies run themselves; offers come to you."
        >
          <div className="sx-actions">
            <button
              type="button"
              className="sx-btn sx-btn-ghost"
              onClick={scoreLead}
              disabled={!!busy}
            >
              {busy === 'score' ? <LoaderCircle className="animate-spin" /> : <Zap />}
              Score with AI
            </button>
            <button
              type="button"
              className="sx-btn sx-btn-ghost"
              onClick={() => draftApproval('proposal')}
              disabled={!!busy}
            >
              {busy === 'proposal' ? <LoaderCircle className="animate-spin" /> : <Send />}
              Draft offer
            </button>
            <button
              type="button"
              className="sx-btn sx-btn-ghost"
              onClick={markWon}
              disabled={!!busy}
            >
              {busy === 'won' ? <LoaderCircle className="animate-spin" /> : <CircleCheck />}
              Mark won
            </button>
          </div>

          <div className="sx-field" style={{ marginTop: 16 }}>
            <label className="sx-label" htmlFor="objection">
              Buyer objection
            </label>
            <input
              id="objection"
              className="sx-input"
              value={objection}
              onChange={(e) => setObjection(e.target.value)}
            />
            <button
              type="button"
              className="sx-btn sx-btn-ghost sx-btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => draftApproval('reply')}
              disabled={!!busy}
            >
              {busy === 'reply' ? 'Drafting…' : 'Draft a reply'}
            </button>
          </div>
        </Card>
      </div>

      <div className="sx-stack" style={{ marginTop: 28 }}>
        <Card
          title="Everything that has happened"
          note="Chat, scoring, offers and sends in one thread."
        >
          {history.length === 0 ? (
            <EmptyState title="No history yet">
              Score the lead to start the timeline.
            </EmptyState>
          ) : (
            <ul className="sx-list">
              {history.map((item) => (
                <li key={item.id} className="sx-item">
                  <div className="sx-item-main">
                    <span className="sx-item-title">{item.summary}</span>
                    <span className="sx-item-note">{item.detail}</span>
                  </div>
                  <Badge tone={item.automated ? 'teal' : 'gray'}>{item.type}</Badge>
                  <span className="sx-item-meta">{timeAgo(item.created_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
