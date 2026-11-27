import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, Mail, RefreshCw, Send, X } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { api, type HealthStatus } from '../lib/api';
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
      toast.success(
        `Sent to ${item.lead_name}${res.provider ? ` via ${res.provider}` : ''}`
      );
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
  const toast = useToast();
  const [pending, setPending] = useState<Approval[]>([]);
  const [handled, setHandled] = useState<Approval[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [retryingId, setRetryingId] = useState('');

  const load = useCallback(async () => {
    try {
      const [pRes, allRes, hRes] = await Promise.all([
        api.approvals.list('pending'),
        api.approvals.list(),
        api.health().catch(() => null),
      ]);
      setPending(pRes.items || []);
      setHandled(
        (allRes.items || []).filter((a) => a.status !== 'pending').slice(0, 8)
      );
      if (hRes) setHealth(hRes);
    } catch {
      // Keep UI responsive on transient network failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendTestEmail(e: React.FormEvent) {
    e.preventDefault();
    const target = testEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setTestResult({ ok: false, message: 'Enter a valid recipient email address.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.email.test({ toEmail: target });
      if (res.ok) {
        const msg = `Delivered to ${target} via ${res.provider} (sender: ${
          res.senderEmail || 'verified'
        }${res.messageId ? ` · ID: ${res.messageId}` : ''})`;
        setTestResult({ ok: true, message: msg });
        toast.success(`Test email sent via ${res.provider}`);
      } else {
        setTestResult({
          ok: false,
          message: res.error || 'Email provider rejected the test send.',
        });
        toast.error('Test email did not send');
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Test send failed.',
      });
    } finally {
      setTesting(false);
    }
  }

  async function retryHandled(item: Approval) {
    setRetryingId(item.id);
    try {
      const res = await api.approvals.send(item.id, {
        subject: item.subject,
        body: item.body,
      });
      if (res.ok) {
        toast.success(`Sent to ${item.lead_name} via ${res.provider || 'Brevo'}`);
      } else {
        toast.error(res.error || 'Retry failed');
      }
      await load();
    } catch {
      toast.error('Retry failed');
    } finally {
      setRetryingId('');
    }
  }

  return (
    <div className="sx-page">
      <PageHead
        meta="Approval inbox"
        title="Nothing goes out without you"
        lede="The AI writes the pitch, the price and the objection replies. You read, edit if you like, and send via Brevo."
      >
        <Link to="/email-templates" className="sx-btn sx-btn-ghost">
          Brand promo templates
        </Link>
        <Link to="/channels" className="sx-btn sx-btn-ghost">
          Email &amp; Channel Setup
        </Link>
        <Link to="/automations" className="sx-btn sx-btn-ghost">
          Automations
        </Link>
      </PageHead>

      <div className="sx-storage-banner" style={{ marginBottom: 18 }}>
        <div className="sx-storage-banner-main">
          <Mail size={16} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong>
                Email delivery:{' '}
                {health?.brevoConfigured
                  ? 'Brevo API active'
                  : health?.resendConfigured
                    ? 'Resend API active'
                    : 'Waiting for BREVO_API_KEY'}
              </strong>
              <Badge tone={health?.emailConfigured ? 'green' : 'warm'}>
                {health?.emailConfigured
                  ? health.emailProvider || 'configured'
                  : 'Missing BREVO_API_KEY'}
              </Badge>
            </div>
            <span>
              {health?.emailConfigured
                ? `Active sender: ${
                    health.brevoSenderEmail ||
                    'Auto-detected from your verified Brevo sender or Channel Wizard'
                  }.`
                : 'If you already added BREVO_API_KEY in Cloudflare, ensure it is under Settings → Variables and Secrets (Runtime, not Build variables) and redeploy. RESEND_API_KEY is NOT needed when using Brevo.'}
            </span>
          </div>
        </div>

        <form
          onSubmit={sendTestEmail}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            flex: '1 1 320px',
            justifyContent: 'flex-end',
          }}
        >
          <input
            type="email"
            className="sx-input"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@domain.com"
            aria-label="Test recipient email"
            style={{ minWidth: 210, maxWidth: 260 }}
          />
          <button
            type="submit"
            className="sx-btn sx-btn-cobalt sx-btn-sm"
            disabled={testing}
          >
            {testing ? <LoaderCircle className="animate-spin" /> : <Send />}
            Send test email
          </button>
        </form>
      </div>

      {testResult && (
        <p
          role={testResult.ok ? 'status' : 'alert'}
          style={{
            margin: '-8px 0 18px',
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 12.5,
            lineHeight: 1.5,
            background: testResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
            border: `1px solid ${
              testResult.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'
            }`,
            color: testResult.ok ? 'var(--sx-green-ink)' : 'var(--sx-red-ink)',
          }}
        >
          {testResult.message}
        </p>
      )}

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
                  {item.status === 'failed' && (
                    <button
                      type="button"
                      className="sx-btn sx-btn-ghost sx-btn-sm"
                      onClick={() => retryHandled(item)}
                      disabled={retryingId === item.id}
                    >
                      {retryingId === item.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <RefreshCw />
                      )}
                      Retry send
                    </button>
                  )}
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
