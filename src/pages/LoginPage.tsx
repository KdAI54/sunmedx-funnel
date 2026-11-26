import React, { useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { RisingSunBackdrop } from '../components/RisingSunBackdrop';
import { SunmedxMark } from '../components/Shell';
import { Link, useRouter } from '../lib/router';

function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  const words = local
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'Sunmedx Operator';
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function LoginPage({
  initialEmail = '',
  redirectTo = '/dashboard',
  onLogin,
}: {
  initialEmail?: string;
  redirectTo?: string;
  onLogin: (name: string, email: string) => void;
}) {
  const { navigate } = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid operator email address to continue.');
      return;
    }
    setError('');
    const displayName = name.trim() || deriveNameFromEmail(cleanEmail);
    onLogin(displayName, cleanEmail);
    navigate({ to: redirectTo || '/dashboard' });
  }

  return (
    <div
      className="lp-root"
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <RisingSunBackdrop />
      <div
        className="sx-card"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(430px, 100%)',
          background: 'linear-gradient(180deg, #101930 0%, #0a1122 100%)',
          borderColor: 'rgba(59, 130, 246, 0.28)',
          boxShadow: '0 24px 60px -20px rgba(2, 6, 18, 0.88), 0 0 0 1px rgba(59, 130, 246, 0.14)',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <SunmedxMark className="as1-brand-mark" width={30} height={30} />
          <span
            style={{
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.03em',
            }}
          >
            Sunmedx
          </span>
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}
        >
          Sign in by email
        </h1>
        <p style={{ margin: '6px 0 22px', fontSize: 13, color: '#94a3b8', lineHeight: 1.55 }}>
          Enter your email to jump into the operator dashboard, manage funnel stages, AI approvals, and automations.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="sx-field">
            <label className="sx-label" htmlFor="op-email">
              Email address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="op-email"
                type="email"
                autoFocus
                required
                placeholder="operator@sunmedx.app"
                className="sx-input"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
              />
            </div>
          </div>

          <div className="sx-field" style={{ marginTop: 12 }}>
            <label className="sx-label" htmlFor="op-name">
              Operator name <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="op-name"
              className="sx-input"
              placeholder="Sunmedx Owner"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {error && (
            <p
              role="alert"
              style={{
                margin: '10px 0 0',
                fontSize: 12,
                color: '#fda4af',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="sx-btn sx-btn-primary"
            style={{ width: '100%', marginTop: 18, minHeight: 40 }}
          >
            <Mail size={14} /> Jump to Dashboard <ArrowRight size={14} />
          </button>
        </form>

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid rgba(148, 163, 184, 0.14)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
          }}
        >
          <Link to="/" className="as1-textlink">
            Back to landing page
          </Link>
          <button
            type="button"
            onClick={() => {
              setEmail('operator@sunmedx.app');
              setName('Sunmedx Owner');
              setError('');
            }}
            style={{
              background: 'none',
              border: 0,
              padding: 0,
              color: '#94a3b8',
              font: 'inherit',
              cursor: 'pointer',
              fontSize: 11.5,
            }}
          >
            Use demo email
          </button>
        </div>
      </div>
    </div>
  );
}
