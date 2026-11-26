import React from 'react';

interface MiniFunnelSpec {
  id: string;
  x: string;
  y: string;
  size: number;
  driftClass: 'drift-a' | 'drift-b' | 'drift-c';
  blinkDelay: string;
  blinkDuration: string;
}

const LANDING_FUNNELS: MiniFunnelSpec[] = [
  { id: 'f1', x: '8%', y: '14%', size: 18, driftClass: 'drift-a', blinkDelay: '0s', blinkDuration: '3.4s' },
  { id: 'f2', x: '22%', y: '44%', size: 15, driftClass: 'drift-b', blinkDelay: '1.2s', blinkDuration: '3.0s' },
  { id: 'f3', x: '36%', y: '10%', size: 20, driftClass: 'drift-c', blinkDelay: '0.6s', blinkDuration: '3.8s' },
  { id: 'f4', x: '56%', y: '18%', size: 17, driftClass: 'drift-a', blinkDelay: '1.9s', blinkDuration: '2.9s' },
  { id: 'f5', x: '76%', y: '12%', size: 19, driftClass: 'drift-b', blinkDelay: '0.4s', blinkDuration: '3.3s' },
  { id: 'f6', x: '88%', y: '38%', size: 16, driftClass: 'drift-c', blinkDelay: '2.1s', blinkDuration: '3.6s' },
  { id: 'f7', x: '16%', y: '74%', size: 16, driftClass: 'drift-c', blinkDelay: '1.5s', blinkDuration: '3.5s' },
  { id: 'f8', x: '68%', y: '68%', size: 18, driftClass: 'drift-a', blinkDelay: '0.9s', blinkDuration: '3.1s' },
];

function MiniFunnel({ spec }: { spec: MiniFunnelSpec }) {
  return (
    <span
      className={`sx-mini-funnel-pos sx-mini-${spec.driftClass}`}
      style={{ left: spec.x, top: spec.y }}
    >
      <svg
        className="sx-mini-funnel-svg"
        width={spec.size}
        height={spec.size}
        viewBox="0 0 32 32"
        fill="none"
        style={{
          animationDelay: spec.blinkDelay,
          animationDuration: spec.blinkDuration,
        }}
      >
        <path
          d="M3.5 2H28.5C29.6 2 30.2 3.2 29.5 4.1L23.5 11.7C23.1 12.2 22.5 12.5 21.9 12.5H10.1C9.5 12.5 8.9 12.2 8.5 11.7L2.5 4.1C1.8 3.2 2.4 2 3.5 2Z"
          fill="#f97316"
        />
        <path
          d="M10.8 14.8H21.2C22.2 14.8 22.8 15.9 22.2 16.7L18.7 22.2C18.3 22.7 17.8 23 17.2 23H14.8C14.2 23 13.7 22.7 13.3 22.2L9.8 16.7C9.2 15.9 9.8 14.8 10.8 14.8Z"
          fill="#ef4444"
        />
        <circle cx="16" cy="27.2" r="3.4" fill="#f97316" />
      </svg>
    </span>
  );
}

export function RisingSunBackdrop() {
  return (
    <div className="sx-sunrise-bg sx-sunrise-hero" aria-hidden="true">
      <div className="sx-sunrise-horizon">
        <div className="sx-sunrise-aura" />
        <div className="sx-sunrise-orb" />
        <svg className="sx-sunrise-rings" viewBox="0 0 920 920" fill="none">
          <circle
            cx="460"
            cy="460"
            r="310"
            stroke="rgba(249, 115, 22, 0.12)"
            strokeWidth="1"
            strokeDasharray="8 14"
          />
          <circle
            cx="460"
            cy="460"
            r="410"
            stroke="rgba(239, 68, 68, 0.08)"
            strokeWidth="1"
            strokeDasharray="4 16"
          />
        </svg>
        <div className="sx-sunrise-line" />
      </div>

      {LANDING_FUNNELS.map((f) => (
        <MiniFunnel key={f.id} spec={f} />
      ))}
    </div>
  );
}
