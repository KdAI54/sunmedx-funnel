import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Badge, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { getStage, stageTone, tempTone } from '../data/stages';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { Link, useRouter } from '../lib/router';
import type { Lead } from '../types/funnel';

const INTERESTS = ['Digital protocol', '1:1 wellness audit', 'Daily stack', 'Not sure yet'];
const SOURCES = ['Landing page', 'AI chat', 'Instagram', 'LinkedIn', 'Referral', 'Manual'];

const EMPTY_FORM = {
  full_name: '',
  email: '',
  interest: 'Digital protocol',
  source: 'Manual',
  need_signal: '',
  budget_signal: '',
  timeline_signal: '',
};

function AddLeadModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const setField = (key: keyof typeof EMPTY_FORM) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError('A name is enough to start.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.leads.create({
        ...form,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        stage: 'awareness',
        temperature: 'warm',
        score: 0,
        next_action: 'Score the lead and send the first nurture email',
        last_touch: new Date().toISOString(),
      });
      toast.success(`${form.full_name.trim()} added to the top of the funnel`);
      setForm(EMPTY_FORM);
      onCreated();
      onClose();
    } catch {
      setError('The lead could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(8,8,10,0.72)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sx-card sx-dialog" role="dialog" aria-modal="true" aria-label="Add a lead">
        <div className="sx-card-head">
          <div>
            <h2 className="sx-card-title">Add a lead</h2>
            <p className="sx-card-note">
              Signals help the AI score the fit and pick the first move.
            </p>
          </div>
          <button
            type="button"
            className="sx-btn sx-btn-quiet"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="sx-row-2">
            <div className="sx-field">
              <label className="sx-label" htmlFor="lead-name">
                Name
              </label>
              <input
                id="lead-name"
                className="sx-input"
                value={form.full_name}
                onChange={setField('full_name')}
                placeholder="Ana Mercer"
              />
            </div>
            <div className="sx-field">
              <label className="sx-label" htmlFor="lead-email">
                Email
              </label>
              <input
                id="lead-email"
                className="sx-input"
                type="email"
                value={form.email}
                onChange={setField('email')}
                placeholder="ana@company.com"
              />
            </div>
          </div>

          <div className="sx-row-2" style={{ marginTop: 14 }}>
            <div className="sx-field">
              <label className="sx-label" htmlFor="lead-interest">
                Interest
              </label>
              <select
                id="lead-interest"
                className="sx-native"
                value={form.interest}
                onChange={setField('interest')}
              >
                {INTERESTS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </div>
            <div className="sx-field">
              <label className="sx-label" htmlFor="lead-source">
                Source
              </label>
              <select
                id="lead-source"
                className="sx-native"
                value={form.source}
                onChange={setField('source')}
              >
                {SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="sx-field" style={{ marginTop: 14 }}>
            <label className="sx-label" htmlFor="lead-need">
              What do they want fixed?
            </label>
            <input
              id="lead-need"
              className="sx-input"
              value={form.need_signal}
              onChange={setField('need_signal')}
              placeholder="Low afternoon energy, sleeping badly"
            />
          </div>

          <div className="sx-row-2" style={{ marginTop: 14 }}>
            <div className="sx-field">
              <label className="sx-label" htmlFor="lead-budget">
                Budget signal
              </label>
              <input
                id="lead-budget"
                className="sx-input"
                value={form.budget_signal}
                onChange={setField('budget_signal')}
                placeholder="Will spend $50-150"
              />
            </div>
            <div className="sx-field">
              <label className="sx-label" htmlFor="lead-timeline">
                Timeline signal
              </label>
              <input
                id="lead-timeline"
                className="sx-input"
                value={form.timeline_signal}
                onChange={setField('timeline_signal')}
                placeholder="Wants to start this week"
              />
            </div>
          </div>

          {error && (
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--sx-red-ink)' }} role="alert">
              {error}
            </p>
          )}

          <div className="sx-approval-foot">
            <span className="sx-approval-spacer" />
            <button type="button" className="sx-btn sx-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="sx-btn sx-btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Add lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: 'Hot' },
  { key: 'nurture', label: 'Nurture' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'conversion', label: 'Won' },
];

export function LeadsPage() {
  const { search, navigate } = useRouter();
  const q = search.q || '';
  const isNew = search.new === '1';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await api.leads.list('-created_date');
      setLeads(res.items || []);
    } catch {
      // Keep UI responsive on transient fetch failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const query = q.toLowerCase();
  const filtered = leads
    .filter((l) => {
      if (filter === 'all') return true;
      if (filter === 'hot') return l.temperature === 'hot' || l.score >= 70;
      return l.stage === filter;
    })
    .filter(
      (l) =>
        !query ||
        [l.full_name, l.email, l.interest]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query))
    );

  return (
    <div className="sx-page">
      <PageHead
        meta="Leads"
        title="Everyone in the machine"
        lede="Scored, staged and owned. Open a lead to see the AI's reasoning and act on it."
      >
        <div
          className="as1-search"
          style={{ display: 'flex', width: 220, minWidth: 180, marginLeft: 0 }}
        >
          <span className="as1-search-lens" aria-hidden="true">
            <Search className="as1-search-icon" strokeWidth={1.7} />
          </span>
          <input
            className="as1-search-input"
            placeholder="Filter this list"
            aria-label="Filter leads"
            value={q}
            onChange={(e) =>
              navigate({
                to: '/leads',
                search: e.target.value ? { q: e.target.value } : {},
                replace: true,
              })
            }
          />
        </div>
        <button
          type="button"
          className="sx-btn sx-btn-primary"
          onClick={() => navigate({ to: '/leads', search: { new: '1' } })}
        >
          <Plus /> Add lead
        </button>
      </PageHead>

      <div className="sx-actions" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? 'sx-btn sx-btn-ghost' : 'sx-btn sx-btn-quiet'}
            style={
              filter === f.key
                ? { borderColor: '#3b82f6', color: '#bfdbfe', background: 'rgba(37, 99, 235, 0.16)' }
                : undefined
            }
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="sx-muted">Loading leads…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={query ? 'No lead matches that' : 'No leads yet'}>
          {query
            ? 'Try a different name, email or interest.'
            : 'Add one by hand, or let the landing page chat do it.'}
        </EmptyState>
      ) : (
        <ul className="sx-list">
          {filtered.map((lead) => (
            <li key={lead.id} className="sx-item">
              <Link
                to={`/leads/${lead.id}`}
                className="sx-item-link"
                style={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div className="sx-item-main">
                  <span className="sx-item-title">{lead.full_name}</span>
                  <span className="sx-item-note">
                    {lead.interest || 'No interest'} · {lead.email || 'no email'} ·{' '}
                    {timeAgo(lead.last_touch || lead.created_date)}
                  </span>
                </div>
                <Badge tone={stageTone(lead.stage)}>{getStage(lead.stage).name}</Badge>
                <Badge tone={tempTone(lead.temperature)}>{lead.temperature || 'new'}</Badge>
                <span className="sx-item-meta" style={{ width: 38, textAlign: 'right' }}>
                  {lead.score ?? 0}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AddLeadModal
        open={isNew}
        onClose={() => navigate({ to: '/leads', search: {}, replace: true })}
        onCreated={load}
      />
    </div>
  );
}
