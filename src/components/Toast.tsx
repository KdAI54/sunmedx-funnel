import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';

interface ToastItem {
  id: string;
  kind: 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: 'success' | 'error', message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const success = useCallback((m: string) => push('success', m), [push]);
  const error = useCallback((m: string) => push('error', m), [push]);
  const value = useMemo(() => ({ success, error }), [success, error]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 80,
          display: 'grid',
          gap: 8,
          maxWidth: 'min(360px, calc(100vw - 32px))',
          pointerEvents: 'none',
        }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 6,
              background: t.kind === 'error' ? '#2c1b1d' : '#1f1f25',
              border:
                t.kind === 'error'
                  ? '1px solid #6d3a3a'
                  : '1px solid #35353f',
              color: t.kind === 'error' ? '#f0a9a9' : '#f4f4f5',
              fontSize: 12.5,
              boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
            }}
          >
            {t.kind === 'success' ? (
              <Check size={14} style={{ color: '#9fd8c7', flexShrink: 0 }} />
            ) : (
              <X size={14} style={{ color: '#f0a9a9', flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Dismiss notification"
              style={{
                background: 'transparent',
                border: 0,
                color: '#8f8f99',
                cursor: 'pointer',
                padding: 2,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
