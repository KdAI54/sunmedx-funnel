import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Activity } from '../types/funnel';

const ACTIVITY_TYPES = [
  'all',
  'chat',
  'score',
  'email',
  'proposal',
  'reply',
  'payment',
  'retention',
  'content',
];

export function ActivityPage() {
  const [items, setItems] = useState<Activity[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.activities
      .list({ limit: 120 })
      .then((res) => setItems(res.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = items.filter((i) => filter === 'all' || i.type === filter);

  return (
    <div className="sx-page">
      <PageHead
        meta="Activity log"
        title="What the machine did"
        lede="Every AI action, in order. Automated work carries a teal mark; anything you did is neutral."
      />

      <div className="sx-actions" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {ACTIVITY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={filter === t ? 'sx-btn sx-btn-ghost' : 'sx-btn sx-btn-quiet'}
            style={
              filter === t
                ? { borderColor: 'var(--sx-purple-line)', color: '#ded8ff' }
                : undefined
            }
            onClick={() => setFilter(t)}
          >
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="sx-muted">Loading the log…</p>
        ) : visible.length === 0 ? (
          <EmptyState title="Nothing logged here yet">
            Run the autopilot or chat with the landing page to fill this up.
          </EmptyState>
        ) : (
          <ul className="sx-list">
            {visible.map((act) => (
              <li key={act.id} className="sx-item">
                <div className="sx-item-main">
                  <span className="sx-item-title">{act.summary}</span>
                  <span className="sx-item-note">
                    {act.detail || act.lead_name || act.stage || 'Sunmedx'}
                  </span>
                </div>
                <Badge tone={act.automated ? 'teal' : 'gray'}>{act.type}</Badge>
                <span className="sx-item-meta">{timeAgo(act.created_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
