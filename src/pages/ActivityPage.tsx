import React, { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Activity, ActivityType } from '../types/funnel';

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
  'note',
];

const CREATABLE_TYPES: ActivityType[] = [
  'note',
  'email',
  'chat',
  'score',
  'proposal',
  'reply',
  'payment',
  'retention',
  'content',
];

export function ActivityPage() {
  const toast = useToast();
  const [items, setItems] = useState<Activity[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [newSummary, setNewSummary] = useState('');
  const [newDetail, setNewDetail] = useState('');
  const [newType, setNewType] = useState<ActivityType>('note');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [editDetail, setEditDetail] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.activities.list({ limit: 120 });
      setItems(res.items || []);
    } catch {
      // Keep UI responsive on transient error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const summary = newSummary.trim();
    if (!summary) return;
    setCreating(true);
    try {
      const created = await api.activities.create({
        type: newType,
        summary,
        detail: newDetail.trim(),
        status: 'done',
        automated: false,
      });
      setItems((prev) => [created, ...prev]);
      setNewSummary('');
      setNewDetail('');
      toast.success('Funnel activity saved');
    } catch {
      toast.error('Could not save activity');
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(act: Activity) {
    const nextStatus = act.status === 'done' ? 'queued' : 'done';
    setItems((prev) =>
      prev.map((a) => (a.id === act.id ? { ...a, status: nextStatus } : a))
    );
    try {
      const updated = await api.activities.update(act.id, { status: nextStatus });
      setItems((prev) => prev.map((a) => (a.id === act.id ? updated : a)));
    } catch {
      toast.error('Could not update activity status');
      await load();
    }
  }

  async function saveEdit(id: string) {
    const summary = editSummary.trim();
    if (!summary) return;
    try {
      const updated = await api.activities.update(id, {
        summary,
        detail: editDetail.trim(),
      });
      setItems((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setEditingId(null);
      toast.success('Activity updated');
    } catch {
      toast.error('Could not update activity');
    }
  }

  async function removeActivity(id: string) {
    try {
      await api.activities.remove(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
      toast.success('Activity deleted');
    } catch {
      toast.error('Could not delete activity');
    }
  }

  const visible = items.filter((i) => filter === 'all' || i.type === filter);

  return (
    <div className="sx-page">
      <PageHead
        meta="Activity log"
        title="What the machine did"
        lede="Log, review, update, or remove funnel activity entries. All records persist across browser refreshes."
      />

      <Card
        title="Log funnel activity"
        note="Create a manual touchpoint or funnel note stored in D1 / server state."
      >
        <form onSubmit={handleCreate} className="sx-row-2" style={{ alignItems: 'end' }}>
          <div className="sx-field">
            <label className="sx-label" htmlFor="act-summary">
              Summary
            </label>
            <input
              id="act-summary"
              className="sx-input"
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              placeholder="e.g. Sent personalized follow-up after webinar"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="sx-field" style={{ flex: '1 1 160px' }}>
              <label className="sx-label" htmlFor="act-detail">
                Detail (optional)
              </label>
              <input
                id="act-detail"
                className="sx-input"
                value={newDetail}
                onChange={(e) => setNewDetail(e.target.value)}
                placeholder="Context or next step"
              />
            </div>
            <div className="sx-field" style={{ width: 120 }}>
              <label className="sx-label" htmlFor="act-type">
                Type
              </label>
              <select
                id="act-type"
                className="sx-native"
                value={newType}
                onChange={(e) => setNewType(e.target.value as ActivityType)}
              >
                {CREATABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="sx-btn sx-btn-primary"
              disabled={creating || !newSummary.trim()}
              style={{ alignSelf: 'end' }}
            >
              <Plus /> {creating ? 'Saving…' : 'Log activity'}
            </button>
          </div>
        </form>
      </Card>

      <div className="sx-actions" style={{ marginTop: 20, marginBottom: 16, flexWrap: 'wrap' }}>
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
            Log an activity above, run the autopilot, or capture a lead on the landing page.
          </EmptyState>
        ) : (
          <ul className="sx-list">
            {visible.map((act) => {
              const isEditing = editingId === act.id;
              return (
                <li key={act.id} className="sx-item" style={{ flexWrap: 'wrap' }}>
                  {isEditing ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        flex: '1 1 100%',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        className="sx-input"
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        aria-label="Edit summary"
                        style={{ flex: '1 1 220px' }}
                      />
                      <input
                        className="sx-input"
                        value={editDetail}
                        onChange={(e) => setEditDetail(e.target.value)}
                        aria-label="Edit detail"
                        placeholder="Detail"
                        style={{ flex: '1 1 180px' }}
                      />
                      <button
                        type="button"
                        className="sx-btn sx-btn-primary sx-btn-sm"
                        onClick={() => saveEdit(act.id)}
                      >
                        <Check /> Save
                      </button>
                      <button
                        type="button"
                        className="sx-btn sx-btn-ghost sx-btn-sm"
                        onClick={() => setEditingId(null)}
                      >
                        <X /> Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="sx-item-main">
                        <span className="sx-item-title">{act.summary}</span>
                        <span className="sx-item-note">
                          {act.detail || act.lead_name || act.stage || 'Sunmedx'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="sx-btn sx-btn-quiet sx-btn-sm"
                        onClick={() => toggleStatus(act)}
                        title="Toggle done/queued"
                      >
                        <Badge tone={act.status === 'done' ? 'green' : 'warm'}>
                          {act.status}
                        </Badge>
                      </button>
                      <Badge tone={act.automated ? 'teal' : 'gray'}>{act.type}</Badge>
                      <span className="sx-item-meta">{timeAgo(act.created_date)}</span>
                      <button
                        type="button"
                        className="sx-btn sx-btn-quiet sx-btn-sm"
                        aria-label="Edit activity"
                        onClick={() => {
                          setEditingId(act.id);
                          setEditSummary(act.summary);
                          setEditDetail(act.detail || '');
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="sx-btn sx-btn-quiet sx-btn-sm"
                        aria-label="Delete activity"
                        onClick={() => removeActivity(act.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
