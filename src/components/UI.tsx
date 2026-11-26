import React from 'react';
import type { BadgeTone } from '../types/funnel';

export function PageHead({
  meta,
  title,
  lede,
  children,
}: {
  meta?: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="sx-page-head">
      <div className="sx-page-headings">
        {meta && <p className="sx-page-meta">{meta}</p>}
        <h1 className="sx-page-title">{title}</h1>
        {lede && <p className="sx-page-lede">{lede}</p>}
      </div>
      {children && <div className="sx-actions">{children}</div>}
    </header>
  );
}

export function Badge({
  tone = 'gray',
  children,
  className = '',
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`sx-badge ${className}`} data-tone={tone}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sx-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  delta,
  accent,
}: {
  label: string;
  value: string | number;
  delta?: string;
  accent?: 'violet' | 'emerald' | 'amber' | 'sky';
}) {
  return (
    <div className="sx-metric" data-accent={accent}>
      <div className="sx-metric-label">{label}</div>
      <div className="sx-metric-value">{value}</div>
      {delta && <div className="sx-metric-delta">{delta}</div>}
    </div>
  );
}

export function Card({
  title,
  note,
  action,
  children,
}: {
  title?: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="sx-card">
      {(title || action) && (
        <div className="sx-card-head">
          <div>
            {title && <h2 className="sx-card-title">{title}</h2>}
            {note && <p className="sx-card-note">{note}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
