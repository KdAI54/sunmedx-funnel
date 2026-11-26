import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { RisingSunBackdrop } from '../components/RisingSunBackdrop';
import { SunmedxMark } from '../components/Shell';
import { Link, useRouter } from '../lib/router';

export function LoginPage({
  onSwitchOperator,
}: {
  onSwitchOperator: (name: string, email: string) => void;
}) {
  const { navigate } = useRouter();
  const [name, setName] = useState('Sunmedx Owner');
  const [email, setEmail] = useState('operator@sunmedx.app');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSwitchOperator(name.trim() || 'Sunmedx Owner', email.trim() || 'operator@sunmedx.app');
    navigate({ to: '/' });
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
          width: 'min(420px, 100%)',
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
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}
        >
          Operator console
        </h1>
        <p style={{ margin: '6px 0 22px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
          Sign in to manage funnel stages, AI approvals and automations.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="sx-field">
            <label className="sx-label" htmlFor="op-name">
              Operator name
            </label>
            <input
              id="op-name"
              className="sx-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="sx-field">
            <label className="sx-label" htmlFor="op-email">
              Email
            </label>
            <input
              id="op-email"
              type="email"
              className="sx-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="sx-btn sx-btn-primary"
            style={{ width: '100%', marginTop: 18, minHeight: 38 }}
          >
            Enter workspace <ArrowRight size={14} />
          </button>
        </form>

        <div
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid rgba(148, 163, 184, 0.14)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
          }}
        >
          <Link to="/site" className="as1-textlink">
            Public landing page
          </Link>
          <Link to="/" className="as1-textlink">
            Back to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
