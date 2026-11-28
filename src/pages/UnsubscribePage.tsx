import React, { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, MailX, RotateCcw } from 'lucide-react';
import { RisingSunBackdrop } from '../components/RisingSunBackdrop';
import { api } from '../lib/api';
import { Link, useRouter } from '../lib/router';

const REASONS = [
  'Too many emails',
  'Content is not relevant to me',
  'I did not mean to subscribe',
  'Prefer not to say',
];

export function UnsubscribePage() {
  const { search } = useRouter();
  const email = (search.email || '').trim().toLowerCase();
  const token = (search.t || '').trim();

  const [loading, setLoading] = useState(Boolean(email && token));
  const [brand, setBrand] = useState('Sunmedx');
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!email || !token) {
      setLoading(false);
      return;
    }
    let active = true;
    api.unsubscribe
      .status(email, token)
      .then((res) => {
        if (!active) return;
        setBrand(res.brand || 'Sunmedx');
        setUnsubscribed(Boolean(res.unsubscribed));
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'This unsubscribe link is invalid or has expired.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [email, token]);

  async function handleAction(action: 'unsubscribe' | 'resubscribe') {
    if (!email || !token) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.unsubscribe.submit({
        email,
        t: token,
        action,
        reason: action === 'unsubscribe' ? reason : undefined,
      });
      setUnsubscribed(Boolean(res.unsubscribed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update mailing preferences.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="sx-sunrise-bg"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px 16px',
        position: 'relative',
      }}
    >
      <RisingSunBackdrop />
      <div
        className="sx-card"
        style={{
          width: 'min(480px, 100%)',
          position: 'relative',
          zIndex: 2,
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: '#080e21',
              border: '1px solid var(--sx-line)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <img
              src="/sunmedx-logo.png"
              alt={brand}
              style={{ width: 22, height: 22, objectFit: 'contain' }}
            />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#ffffff' }}>{brand}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1' }}>
            <LoaderCircle className="animate-spin" size={18} />
            <span>Checking your mailing preferences…</span>
          </div>
        ) : !email || !token ? (
          <div>
            <h1 className="sx-card-title" style={{ fontSize: 20, marginBottom: 8 }}>
              Manage mailing preferences
            </h1>
            <p className="sx-card-note" style={{ lineHeight: 1.6 }}>
              To stop receiving messages from {brand}, click the{' '}
              <strong>Unsubscribe</strong> link at the bottom of any email sent from this
              mailing.
            </p>
            <div style={{ marginTop: 18 }}>
              <Link to="/" className="sx-btn sx-btn-ghost sx-btn-sm">
                Back to {brand}
              </Link>
            </div>
          </div>
        ) : unsubscribed ? (
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#6ee7b7',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              <CheckCircle2 size={14} /> Unsubscribed
            </div>
            <h1 className="sx-card-title" style={{ fontSize: 21, marginBottom: 8 }}>
              You will no longer receive messages from this mailing
            </h1>
            <p className="sx-card-note" style={{ lineHeight: 1.6 }}>
              <strong style={{ color: '#ffffff' }}>{email}</strong> has been removed from{' '}
              {brand} promotional mailings and synced with our delivery list.
            </p>
            {error && (
              <p role="alert" style={{ color: 'var(--sx-red-ink)', fontSize: 12.5, marginTop: 12 }}>
                {error}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
              <button
                type="button"
                className="sx-btn sx-btn-ghost sx-btn-sm"
                onClick={() => handleAction('resubscribe')}
                disabled={submitting}
              >
                {submitting ? <LoaderCircle className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                Resubscribe
              </button>
              <Link to="/" className="sx-btn sx-btn-quiet sx-btn-sm">
                Return to {brand}
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(249, 115, 22, 0.14)',
                border: '1px solid rgba(249, 115, 22, 0.35)',
                color: '#fdba74',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              <MailX size={14} /> Email preferences
            </div>
            <h1 className="sx-card-title" style={{ fontSize: 21, marginBottom: 8 }}>
              Do you want to stop getting messages from this mailing?
            </h1>
            <p className="sx-card-note" style={{ lineHeight: 1.6 }}>
              Confirm below to unsubscribe <strong style={{ color: '#ffffff' }}>{email}</strong>{' '}
              from future {brand} promotional emails.
            </p>

            <div className="sx-field" style={{ marginTop: 16 }}>
              <label className="sx-label" htmlFor="unsub-reason">
                Reason (optional)
              </label>
              <select
                id="unsub-reason"
                className="sx-native"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Select a reason…</option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p role="alert" style={{ color: 'var(--sx-red-ink)', fontSize: 12.5, marginTop: 12 }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
              <button
                type="button"
                className="sx-btn sx-btn-primary"
                onClick={() => handleAction('unsubscribe')}
                disabled={submitting}
              >
                {submitting ? <LoaderCircle className="animate-spin" size={15} /> : <MailX size={15} />}
                {submitting ? 'Unsubscribing…' : 'Unsubscribe'}
              </button>
              <Link to="/" className="sx-btn sx-btn-ghost">
                Keep receiving emails
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
