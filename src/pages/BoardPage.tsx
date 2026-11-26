import { useCallback, useEffect, useState } from 'react';
import { Badge, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { getStage, STAGES, tempTone } from '../data/stages';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { Link } from '../lib/router';
import type { Lead, StageKey } from '../types/funnel';

export function BoardPage() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageKey | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.leads.list('-score');
      setLeads(res.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function moveLead(leadId: string, destinationStage: StageKey) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === destinationStage) return;

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: destinationStage } : l))
    );
    try {
      await api.leads.update(leadId, { stage: destinationStage });
      await api.activities.create({
        lead_id: lead.id,
        lead_name: lead.full_name,
        stage: destinationStage,
        type: 'note',
        summary: `${lead.full_name} moved to ${getStage(destinationStage).name}`,
        detail: 'Moved by hand on the funnel board.',
        status: 'done',
        automated: false,
      });
      toast.success(`${lead.full_name} moved to ${getStage(destinationStage).name}`);
    } catch {
      toast.error('That move did not save.');
      load();
    }
  }

  return (
    <div className="sx-page">
      <PageHead
        meta="Funnel board"
        title="Six stages, three verticals"
        lede="Drag a lead to move it. Every column shows the stage, the AI activity and the automation that fires there."
      >
        <Link to="/leads" search={{ new: '1' }} className="sx-btn sx-btn-ghost">
          Add a lead
        </Link>
      </PageHead>

      {loading ? (
        <p className="sx-muted">Loading the board…</p>
      ) : (
        <div className="sx-board">
          {STAGES.map((stage) => {
            const colLeads = leads.filter((l) => l.stage === stage.key);
            return (
              <section key={stage.key} className="sx-col">
                <div className="sx-col-head">
                  <Badge
                    tone={
                      stage.tone === 'conversion'
                        ? 'green'
                        : stage.tone === 'activity'
                          ? 'purple'
                          : 'blue'
                    }
                  >
                    {stage.name}
                  </Badge>
                  <span className="sx-col-count">{colLeads.length}</span>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <div className="sx-node">
                    <span className="sx-node-label">Stage</span>
                    <span className="sx-node-title">{stage.name}</span>
                    <span className="sx-node-note">{stage.goal}</span>
                  </div>
                  <div className="sx-node" data-kind="activity">
                    <span className="sx-node-label">Activity</span>
                    <span className="sx-node-title">{stage.activity}</span>
                    <span className="sx-node-note">{stage.activity_channel}</span>
                  </div>
                  <div
                    className="sx-node"
                    data-kind={stage.tone === 'conversion' ? 'conversion' : 'automation'}
                  >
                    <span className="sx-node-label">Automation</span>
                    <span className="sx-node-title">{stage.automation}</span>
                    <span className="sx-node-note">{stage.target_metric}</span>
                  </div>
                </div>

                <div
                  className="sx-col-body"
                  data-over={overStage === stage.key ? 'true' : undefined}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overStage !== stage.key) setOverStage(stage.key);
                  }}
                  onDragLeave={() => {
                    if (overStage === stage.key) setOverStage(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain') || draggingId;
                    setOverStage(null);
                    setDraggingId(null);
                    if (id) moveLead(id, stage.key);
                  }}
                >
                  {colLeads.length === 0 && overStage !== stage.key && (
                    <p className="sx-muted" style={{ padding: '8px 2px', margin: 0 }}>
                      Empty
                    </p>
                  )}
                  {colLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      to={`/leads/${lead.id}`}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(lead.id);
                        e.dataTransfer.setData('text/plain', lead.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStage(null);
                      }}
                      className="sx-lead"
                      data-dragging={draggingId === lead.id ? 'true' : undefined}
                    >
                      <div className="sx-lead-top">
                        <span className="sx-lead-name">{lead.full_name}</span>
                        <Badge tone={tempTone(lead.temperature)}>
                          {lead.temperature || 'new'}
                        </Badge>
                      </div>
                      <div className="sx-lead-meta">
                        {lead.interest || 'No interest captured'}
                      </div>
                      <div className="sx-lead-foot">
                        <span className="sx-score">Score {lead.score ?? 0}</span>
                        <span className="sx-score">
                          {lead.deal_value ? formatMoney(lead.deal_value) : ''}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!loading && leads.length === 0 && (
        <EmptyState title="No leads yet">
          The chat on the{' '}
          <Link to="/site" className="as1-textlink">
            public landing page
          </Link>{' '}
          creates them, or add one by hand.
        </EmptyState>
      )}
    </div>
  );
}
