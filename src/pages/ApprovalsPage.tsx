import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { formatMoney, timeAgo } from '../lib/format';
import { Link } from '../lib/router';
import type { Approval } from '../types/funnel';

function ApprovalCard({
  item,
  onDone,
}: {
  item: Approval;
  onDone: () => void;
}) {
  const toast = useToast();
  const [subject, setSubject] = useState(item.subject || '');
  const [body, setBody] = useState(item.body || '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function approveAndSend() {
    setBusy('send');
    setError('');
    try {
      const res = await api.approvals.send(item.id, { subject, body });
      if (!res.ok) {
        setError(res.error || 'Could not send.');
        toast.error('Not sent yet — see the note below.');
        return;
      }
      toast.success(`Sent to ${item.lead_name}`);
      onDone();
    } catch {
      setError('The send failed. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function reject() {
    setBusy('reject');
    try {
      await api.approvals.update(item.id, { status: 'rejected' });
      toast.success(`Draft rejected for ${item.lead_name}`);
      onDone();
    } finally {
      setBusy('');
    }
  }

  return (
    <article className="sx-approval">
      <div className="sx-approval-head">
        <Badge tone={item.kind === 'proposal' ? 'purple' : 'teal'}>{item.kind}</Badge>
        <span style={{ fontSize: 12.5, color: 'var(--sx-ink-2)' }}>
          {item.lead_name} · {item.lead_email || 'no email'} · {item.confidence ?? 70}%
          confidence
        </span>
        <span style={{ flex: '1 1 auto' }} />
        <span className="sx-muted">{timeAgo(item.created_date)}</span>
      </div>

      <input
        className="sx-input"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        aria-label="Subject"
        style={{ marginBottom: 10, fontWeight: 500 }}
      />
      <textarea
        className="sx-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Email body"
      />

      <div className="sx-approval-foot">
        {item.offer && <Badge tone="gray">{item.offer}</Badge>}
        {item.price ? <span className="sx-muted">{formatMoney(item.price)}</span> : null}
        <span className="sx-approval-spacer" />
        <button
          type="button"
          className="sx-btn sx-btn-danger sx-btn-sm"
          onClick={reject}
          disabled={!!busy}
        >
          <X /> Reject
        </button>
        <button
          type="button"
          className="sx-btn sx-btn-primary sx-btn-sm"
          onClick={approveAndSend}
          disabled={!!busy}
        >
          {busy === 'send' ? <LoaderCircle className="animate-spin" /> : <Check />}
          Approve &amp; send
        </button>
      </div>

      {error && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--sx-red-ink)',
          }}
          role="alert"
        >
          {error}
        </p>
      )}
    </article>
  );
}

export function ApprovalsPage() {
  const [pending, setPending] = useState<Approval[]>([]);
  const [handled, setHandled] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [pRes, allRes] = await Promise.all([
        api.approvals.list('pending'),
        api.approvals.list(),
      ]);
      setPending(pRes.items || []);
      setHandled(
        (allRes.items || []).filter((a) => a.status !== 'pending').slice(0, 8)
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="sx-page">
      <PageHead
        meta="Approval inbox"
        title="Nothing goes out without you"
        lede="The AI writes the pitch, the price and the objection replies. You read, edit if you like, and send."
      >
        <Link to="/automations" className="sx-btn sx-btn-ghost">
          Automations
        </Link>
      </PageHead>

      {loading ? (
        <p className="sx-muted">Loading the queue…</p>
      ) : pending.length === 0 ? (
        <EmptyState title="The queue is clear">
          Run the autopilot and any hot lead gets a drafted offer here.
        </EmptyState>
      ) : (
        pending.map((item) => <ApprovalCard key={item.id} item={item} onDone={load} />)
      )}

      {handled.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <Card
            title="Recently handled"
            note="Sent, rejected or failed — the record is kept."
          >
            <ul className="sx-list">
              {handled.map((item) => (
                <li key={item.id} className="sx-item">
                  <div className="sx-item-main">
                    <span className="sx-item-title">{item.subject}</span>
                    <span className="sx-item-note">
                      {item.lead_name}
                      {item.send_error ? ` · ${item.send_error}` : ''}
                    </span>
                  </div>
                  <Badge
                    tone={
                      item.status === 'sent'
                        ? 'green'
                        : item.status === 'failed'
                          ? 'red'
                          : 'gray'
                    }
                  >
                    {item.status}
                  </Badge>
                  <span className="sx-item-meta">{timeAgo(item.updated_date)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
