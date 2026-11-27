import { useEffect, useState } from 'react';
import { Card, EmptyState, Metric, PageHead } from '../components/UI';
import { STAGES } from '../data/stages';
import { api } from '../lib/api';
import { formatMoney, pct } from '../lib/format';
import type { Activity, Approval, Lead } from '../types/funnel';

export function MetricsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      api.leads.list(),
      api.activities.list({ limit: 300 }),
      api.approvals.list(),
    ])
      .then(([lRes, acRes, apRes]) => {
        setLeads(lRes.items || []);
        setActivity(acRes.items || []);
        setApprovals(apRes.items || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="sx-page">
        <PageHead meta="Metrics" title="The funnel in numbers" />
        <p className="sx-muted">Reading the funnel…</p>
      </div>
    );
  }

  const stageCounts = STAGES.map((s) => ({
    short: `${s.name.slice(0, 4)}.`,
    full: s.name,
    leads: leads.filter((l) => l.stage === s.key).length,
  }));

  const wonLeads = leads.filter((l) => ['conversion', 'retention'].includes(l.stage));
  const revenue = wonLeads.reduce((sum, l) => sum + (Number(l.deal_value) || 0), 0);
  const totalLeads = leads.length;
  const sendsLogged = activity.filter((a) => a.type === 'email' || a.type === 'reply').length;
  const sentApprovals = approvals.filter((a) => a.status === 'sent').length;
  const totalApprovals = approvals.length;
  const maxStageLeads = Math.max(1, ...stageCounts.map((s) => s.leads));

  return (
    <div className="sx-page">
      <PageHead
        meta="Metrics"
        title="The funnel in numbers"
        lede="Measured from real records, not estimates. Watch the conversion rate climb as the AI learns what lands."
      />

      <div className="sx-metrics">
        <Metric
          label="Leads captured"
          value={totalLeads}
          delta={`${leads.filter((l) => l.score >= 70).length} hot`}
          accent="violet"
        />
        <Metric
          label="Conversion rate"
          value={`${pct(wonLeads.length, totalLeads)}%`}
          delta={`${wonLeads.length} of ${totalLeads} leads`}
          accent="emerald"
        />
        <Metric
          label="Revenue won"
          value={formatMoney(revenue)}
          delta="Digital, service and physical"
          accent="sky"
        />
        <Metric
          label="Approval rate"
          value={`${pct(sentApprovals, totalApprovals)}%`}
          delta={`${sentApprovals} of ${totalApprovals} drafts sent`}
          accent="amber"
        />
      </div>

      <div className="sx-stack" style={{ marginTop: 28 }}>
        <Card title="Leads per stage" note="Where the funnel is heavy, and where it leaks.">
          <div style={{ position: 'relative', width: '100%', height: 228 }}>
            <svg
              viewBox="0 0 640 208"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
              role="img"
              aria-label="Leads per stage bar chart"
            >
              <defs>
                <linearGradient id="sx-bar-stage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.82" />
                </linearGradient>
                <linearGradient id="sx-bar-activity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.82" />
                </linearGradient>
                <linearGradient id="sx-bar-conversion" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.84" />
                </linearGradient>
                <linearGradient id="sx-bar-hover" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fed7aa" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = 24 + (1 - t) * 140;
                const tickVal = Math.round(t * maxStageLeads);
                return (
                  <g key={t}>
                    <line
                      x1="34"
                      x2="624"
                      y1={y}
                      y2={y}
                      stroke="rgba(148, 163, 184, 0.14)"
                      strokeWidth="1"
                    />
                    <text
                      x="24"
                      y={y + 4}
                      textAnchor="end"
                      fill="#6f82a6"
                      fontSize="11"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {tickVal}
                    </text>
                  </g>
                );
              })}

              {stageCounts.map((s, idx) => {
                const slotW = 580 / stageCounts.length;
                const barW = 48;
                const x = 42 + idx * slotW + (slotW - barW) / 2;
                const h = Math.max(s.leads > 0 ? 8 : 0, (s.leads / maxStageLeads) * 140);
                const y = 164 - h;
                const isHovered = hoveredIdx === idx;
                const tone = STAGES[idx]?.tone;
                const fillId = isHovered
                  ? 'url(#sx-bar-hover)'
                  : tone === 'conversion'
                    ? 'url(#sx-bar-conversion)'
                    : tone === 'activity'
                      ? 'url(#sx-bar-activity)'
                      : 'url(#sx-bar-stage)';
                return (
                  <g
                    key={s.full}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      rx="6"
                      fill={fillId}
                      style={{ transition: 'opacity 0.16s ease' }}
                    />
                    {s.leads > 0 && (
                      <text
                        x={x + barW / 2}
                        y={Math.max(14, y - 6)}
                        textAnchor="middle"
                        fill={isHovered ? '#ffffff' : '#a5b4cf'}
                        fontSize="11"
                        fontWeight="600"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {s.leads}
                      </text>
                    )}
                    <text
                      x={x + barW / 2}
                      y="188"
                      textAnchor="middle"
                      fill={isHovered ? '#f8fafc' : '#9baed0'}
                      fontSize="11.5"
                      fontWeight={isHovered ? '600' : '500'}
                    >
                      {s.short}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hoveredIdx !== null && stageCounts[hoveredIdx] && (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 12,
                  background: '#0d1529',
                  border: '1px solid rgba(59, 130, 246, 0.42)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  boxShadow: '0 10px 28px rgba(2, 4, 12, 0.6)',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ color: '#f8fafc', fontWeight: 600 }}>
                  {stageCounts[hoveredIdx].full}
                </div>
                <div style={{ color: '#93c5fd', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                  {stageCounts[hoveredIdx].leads} leads
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="sx-cols">
          <Card title="Stage by stage" note="How many made it through each gate.">
            <div className="sx-meter">
              {STAGES.map((stage) => {
                const count = leads.filter((l) => l.stage === stage.key).length;
                return (
                  <div
                    key={stage.key}
                    className="sx-meter-row"
                    data-kind={stage.tone}
                  >
                    <span className="sx-meter-name">{stage.name}</span>
                    <span className="sx-meter-track">
                      <span
                        className="sx-meter-fill"
                        style={{
                          width: `${totalLeads ? Math.round((count / totalLeads) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="sx-meter-value">{pct(count, totalLeads)}%</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card
            title="Email and offers"
            note="Only what the system actually recorded."
          >
            <ul className="sx-list">
              <li className="sx-item">
                <div className="sx-item-main">
                  <span className="sx-item-title">Sends logged</span>
                  <span className="sx-item-note">
                    Offers, replies and nurture emails
                  </span>
                </div>
                <span className="sx-item-meta">{sendsLogged}</span>
              </li>
              <li className="sx-item">
                <div className="sx-item-main">
                  <span className="sx-item-title">Drafts waiting</span>
                  <span className="sx-item-note">Gated offers and replies</span>
                </div>
                <span className="sx-item-meta">
                  {approvals.filter((a) => a.status === 'pending').length}
                </span>
              </li>
              <li className="sx-item">
                <div className="sx-item-main">
                  <span className="sx-item-title">Chat conversations</span>
                  <span className="sx-item-note">
                    Visitors who talked to the assistant
                  </span>
                </div>
                <span className="sx-item-meta">
                  {activity.filter((a) => a.type === 'chat').length}
                </span>
              </li>
            </ul>
            <p className="sx-muted" style={{ marginTop: 12 }}>
              Opens and clicks appear here once email is connected to your own domain.
            </p>
          </Card>
        </div>

        {totalLeads === 0 && (
          <EmptyState title="No data yet">
            Capture your first lead and this page fills itself.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
