import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CircleHelp,
  Layers,
  Menu,
  Search,
  Settings,
  Workflow,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { initials, timeAgo } from '../lib/format';
import { Link, useRouter } from '../lib/router';

interface NavSection {
  key: 'funnel' | 'autopilot' | 'insights';
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  target: string;
  children: Array<{ label: string; to: string }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    key: 'funnel',
    label: 'Funnel',
    icon: Layers,
    target: '/dashboard',
    children: [
      { label: 'Overview', to: '/dashboard' },
      { label: 'Funnel Board', to: '/board' },
      { label: 'Leads', to: '/leads' },
    ],
  },
  {
    key: 'autopilot',
    label: 'Autopilot',
    icon: Workflow,
    target: '/activity',
    children: [
      { label: 'Activity', to: '/activity' },
      { label: 'Approvals', to: '/approvals' },
      { label: 'Email templates', to: '/email-templates' },
      { label: 'Lead engine', to: '/generator' },
      { label: 'Automations', to: '/automations' },
      { label: 'Accounts & wiring', to: '/channels' },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    icon: BarChart3,
    target: '/metrics',
    children: [
      { label: 'Metrics', to: '/metrics' },
      { label: 'Experiments', to: '/experiments' },
      { label: 'Content Studio', to: '/content' },
    ],
  },
];

function isRouteActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

interface NoteRow {
  id: string;
  label: string;
  time: string;
  unread: boolean;
  to: string;
}

function useBellSwing(bellRef: React.RefObject<HTMLButtonElement | null>) {
  const stateRef = useRef({ th: 0, v: 0, cl: 0, clv: 0, raf: 0, last: 0 });

  const step = useCallback(
    (now: number) => {
      const el = bellRef.current;
      if (!el) return;
      const st = stateRef.current;
      const dt = Math.min(32, now - st.last) / 1000;
      st.last = now;
      st.v += (-220 * st.th - 10 * st.v) * dt;
      st.th += st.v * dt;
      const targetCl = Math.max(-13, Math.min(13, (-st.v / 450) * 13));
      st.clv += (300 * (targetCl - st.cl) - 14 * st.clv) * dt;
      st.cl += st.clv * dt;
      el.style.setProperty('--bell-swing', `${st.th}deg`);
      el.style.setProperty('--bell-clapper', `${st.cl}deg`);
      if (Math.abs(st.th) < 0.01 && Math.abs(st.v) < 0.01 && Math.abs(st.cl) < 0.05) {
        st.raf = 0;
        st.th = 0;
        st.v = 0;
        st.cl = 0;
        st.clv = 0;
        el.style.removeProperty('--bell-swing');
        el.style.removeProperty('--bell-clapper');
      } else {
        st.raf = requestAnimationFrame(step);
      }
    },
    [bellRef]
  );

  return useCallback(
    (strength = 1) => {
      if (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }
      const st = stateRef.current;
      if (!bellRef.current) return;
      const dir = st.v > 1 ? 1 : -1;
      st.v = Math.max(-900, Math.min(900, st.v + dir * 500 * strength));
      if (!st.raf) {
        st.last = performance.now();
        st.raf = requestAnimationFrame(step);
      }
    },
    [bellRef, step]
  );
}

export function SunmedxMark({
  className,
  width,
  height,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      style={width || height ? { width, height } : undefined}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
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
  );
}

export function Shell({
  operatorEmail = 'operator@sunmedx.app',
  operatorName = 'Sunmedx Owner',
  onSignOut,
  children,
}: {
  operatorEmail?: string;
  operatorName?: string;
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  const { pathname, navigate } = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flyout, setFlyout] = useState<string | null>(null);
  const [pop, setPop] = useState<'help' | 'notes' | 'account' | null>(null);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    funnel: true,
    autopilot: false,
    insights: false,
  });
  const [notes, setNotes] = useState<NoteRow[]>([]);

  const mainRef = useRef<HTMLDivElement | null>(null);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const helpBtnRef = useRef<HTMLButtonElement | null>(null);
  const avatarBtnRef = useRef<HTMLButtonElement | null>(null);
  const popRefs = {
    help: useRef<HTMLDivElement | null>(null),
    notes: useRef<HTMLDivElement | null>(null),
    account: useRef<HTMLDivElement | null>(null),
  };

  const swingBell = useBellSwing(bellRef);

  const loadNotifications = useCallback(async () => {
    try {
      const [approvalsRes, actRes] = await Promise.all([
        api.approvals.list('pending'),
        api.activities.list({ status: 'done', limit: 3 }),
      ]);
      const rows: NoteRow[] = [
        ...(approvalsRes.items || []).slice(0, 4).map((a) => ({
          id: `ap-${a.id}`,
          label: `${a.kind === 'proposal' ? 'Proposal' : 'Reply'} ready for ${a.lead_name}`,
          time: a.created_date,
          unread: true,
          to: '/approvals',
        })),
        ...(actRes.items || []).slice(0, 2).map((ac) => ({
          id: `ac-${ac.id}`,
          label: ac.summary,
          time: ac.created_date,
          unread: false,
          to: '/activity',
        })),
      ];
      setNotes(rows);
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem('sx-sidebar-collapsed') === '1') {
        setCollapsed(true);
      }
    } catch {
      // ignore
    }
    loadNotifications();
  }, [loadNotifications, pathname]);

  useEffect(() => {
    setDrawerOpen(false);
    setPop(null);
    setSearchOpen(false);
    setFlyout(null);
    const activeSec = NAV_SECTIONS.find((s) =>
      s.children.some((c) => isRouteActive(pathname, c.to))
    );
    if (activeSec && typeof window !== 'undefined' && window.innerWidth < 720) {
      setOpenSections((prev) => ({ ...prev, [activeSec.key]: true }));
    }
  }, [pathname]);

  useEffect(() => {
    if (!pop) return;
    const popEl = popRefs[pop].current;
    const anchor =
      pop === 'help'
        ? helpBtnRef.current
        : pop === 'notes'
          ? bellRef.current
          : avatarBtnRef.current;
    const mainEl = mainRef.current;
    if (!popEl || !anchor || !mainEl) return;
    const mr = mainEl.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const w = popEl.offsetWidth || 224;
    const left = Math.max(8, Math.min(Math.round(ar.right - mr.left - w), Math.round(mr.width - w - 8)));
    setPopPos({ top: Math.round(ar.bottom - mr.top + 8), left });
  }, [pop]);

  useEffect(() => {
    if (!pop) return;
    function onDocDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('.as1-pop') ||
        target?.closest('.as1-help') ||
        target?.closest('.as1-bell') ||
        target?.closest('.as1-avatar')
      ) {
        return;
      }
      setPop(null);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [pop]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapse();
        return;
      }
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (document.activeElement?.tagName || '').toUpperCase()
        )
      ) {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }
      if (e.key === 'Escape') {
        if (pop) setPop(null);
        else if (searchOpen) setSearchOpen(false);
        else if (drawerOpen) setDrawerOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pop, searchOpen, drawerOpen]);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sx-sidebar-collapsed', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
    setFlyout(null);
    setPop(null);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPop(null);
    const q = searchValue.trim();
    navigate({ to: '/leads', search: q ? { q } : {} });
  }

  const unreadCount = useMemo(() => notes.filter((n) => n.unread).length, [notes]);

  return (
    <section className="as1-section" data-as1-theme="dark">
      <div
        className={`as1-shell ${collapsed ? 'as1-collapsed' : ''} ${drawerOpen ? 'as1-open' : ''}`}
      >
        <div className="as1-grid" aria-hidden="true">
          <span className="as1-grid-strip as1-grid-side" />
          <span className="as1-grid-strip as1-grid-top" />
          <span className="as1-grid-strip as1-grid-bottom" />
          <span className="as1-grid-strip as1-grid-right" />
        </div>

        <aside className="as1-side" aria-label="Sidebar">
          <button
            type="button"
            className="as1-collapse"
            onClick={toggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              viewBox="0 0 16 15"
              fill="none"
              stroke="currentColor"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="0.6" y="0.7" width="14.4" height="13" rx="1.5" strokeWidth="1.15" />
              <path d="M5.6 0.7V13.7" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span className="as1-tip as1-chip" aria-hidden="true">
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </span>
          </button>

          <div className="as1-brand">
            <Link
              to="/dashboard"
              className="as1-brand-link"
              onClick={() => setDrawerOpen(false)}
              aria-label="Sunmedx dashboard"
            >
              <SunmedxMark className="as1-brand-mark" />
              <span className="as1-brand-name">Sunmedx</span>
            </Link>
            <button
              className="as1-icon-btn as1-side-close"
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          <nav className="as1-nav" aria-label="Main">
            {NAV_SECTIONS.map((sec) => {
              const holdsActive = sec.children.some((c) => isRouteActive(pathname, c.to));
              const Icon = sec.icon;
              return (
                <div
                  key={sec.key}
                  className={`as1-navsec as1-expanded ${holdsActive ? 'as1-holds-active' : ''} ${
                    collapsed && flyout === sec.key ? 'as1-flyout-open' : ''
                  } ${openSections[sec.key] ? 'as1-open-sec' : ''}`}
                  onMouseEnter={() => collapsed && setFlyout(sec.key)}
                  onMouseLeave={() => collapsed && flyout === sec.key && setFlyout(null)}
                >
                  <button
                    className="as1-navrow as1-parent"
                    type="button"
                    aria-expanded={openSections[sec.key] ? 'true' : 'false'}
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 720) {
                        setOpenSections((prev) => ({
                          ...prev,
                          [sec.key]: !prev[sec.key],
                        }));
                      } else if (collapsed) {
                        setFlyout(null);
                        navigate({ to: sec.target });
                      }
                    }}
                  >
                    <Icon className="as1-navrow-icon" strokeWidth={1.5} aria-hidden="true" />
                    <span className="as1-navrow-label">{sec.label}</span>
                    <svg
                      className="as1-parent-chev"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 9.5 6 6 6-6" />
                    </svg>
                  </button>

                  <div className="as1-submenu">
                    <div className="as1-submenu-inner">
                      <p className="as1-flyout-head" aria-hidden="true">
                        {sec.label}
                      </p>
                      <ul className="as1-submenu-body">
                        {sec.children.map((child) => {
                          const current =
                            child.to === '/dashboard'
                              ? pathname === '/dashboard'
                              : pathname === child.to || pathname.startsWith(`${child.to}/`);
                          return (
                            <li key={child.to}>
                              <Link
                                to={child.to}
                                className="as1-navrow as1-child"
                                aria-current={current ? 'page' : undefined}
                                onClick={() => setDrawerOpen(false)}
                              >
                                <span className="as1-tick" aria-hidden="true" />
                                <span className="as1-navrow-label">{child.label}</span>
                                <span className="as1-tip as1-chip" aria-hidden="true">
                                  {child.label}
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                        <li className="as1-ticks" aria-hidden="true">
                          <i className="as1-rt" />
                          <i className="as1-rt" />
                          <i className="as1-rt" />
                          <i className="as1-rt" />
                          <i className="as1-rt" />
                          <i className="as1-rt" />
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="as1-navfoot">
            <Link
              to="/settings"
              className="as1-navrow as1-route"
              aria-current={pathname === '/settings' ? 'page' : undefined}
              onClick={() => setDrawerOpen(false)}
            >
              <Settings className="as1-navrow-icon" strokeWidth={1.5} aria-hidden="true" />
              <span className="as1-navrow-label">Settings</span>
              <span className="as1-tip as1-chip" aria-hidden="true">
                Settings
              </span>
            </Link>
            <Link
              to="/help"
              className="as1-navrow as1-route"
              aria-current={pathname === '/help' ? 'page' : undefined}
              onClick={() => setDrawerOpen(false)}
            >
              <CircleHelp className="as1-navrow-icon" strokeWidth={1.5} aria-hidden="true" />
              <span className="as1-navrow-label">Help &amp; Docs</span>
              <span className="as1-tip as1-chip" aria-hidden="true">
                Help &amp; Docs
              </span>
            </Link>
          </div>
        </aside>

        <span className="as1-mark as1-mark-tl" aria-hidden="true" />
        <span className="as1-mark as1-mark-tr" aria-hidden="true" />
        <span className="as1-mark as1-mark-br" aria-hidden="true" />
        <span className="as1-mark as1-mark-bl" aria-hidden="true" />

        <div className="as1-main" ref={mainRef}>
          <header className={`as1-header ${searchOpen ? 'as1-search-open' : ''}`}>
            <button
              className="as1-icon-btn as1-menu"
              type="button"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((v) => !v)}
            >
              <Menu strokeWidth={1.5} />
            </button>

            <form
              className={`as1-search ${searchValue ? 'as1-has-value' : ''}`}
              onSubmit={submitSearch}
              role="search"
            >
              <span className="as1-search-lens" aria-hidden="true">
                <Search className="as1-search-icon" strokeWidth={1.7} />
              </span>
              <input
                ref={searchInputRef}
                className="as1-search-input"
                type="search"
                placeholder="Search leads by name, email or interest"
                aria-label="Search leads"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
              />
              <button
                className="as1-search-clear"
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchValue('')}
              >
                <X size={12} />
              </button>
            </form>

            <button
              className="as1-search-close"
              type="button"
              aria-label="Close search"
              onClick={() => setSearchOpen(false)}
            >
              <X strokeWidth={1.6} size={18} />
            </button>

            <button
              className="as1-icon-btn as1-search-toggle"
              type="button"
              aria-label="Search"
              onClick={() => {
                setSearchOpen(true);
                requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
            >
              <Search strokeWidth={1.5} />
            </button>

            <span className="as1-header-spacer" aria-hidden="true" />

            <Link
              className="as1-share"
              to="/leads"
              search={{ new: '1' }}
              aria-label="Add a lead"
            >
              <span className="as1-share-label">New lead</span>
              <span className="as1-share-arrow" aria-hidden="true">
                <span className="as1-share-arrow-clip">
                  <svg
                    className="as1-share-glyph as1-share-glyph-out"
                    viewBox="10 10 12 12"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 13L13 19M19 18V13H14" />
                  </svg>
                  <svg
                    className="as1-share-glyph as1-share-glyph-in"
                    viewBox="10 10 12 12"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 13L13 19M19 18V13H14" />
                  </svg>
                </span>
              </span>
            </Link>

            <button
              ref={helpBtnRef}
              className="as1-icon-btn as1-help"
              type="button"
              aria-label="Help"
              aria-expanded={pop === 'help'}
              onClick={() => setPop((p) => (p === 'help' ? null : 'help'))}
            >
              <CircleHelp strokeWidth={1.5} />
            </button>

            <button
              ref={bellRef}
              className="as1-icon-btn as1-bell"
              type="button"
              aria-expanded={pop === 'notes'}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              data-count={unreadCount}
              onPointerEnter={() => swingBell(0.4)}
              onClick={() => {
                swingBell(1);
                setPop((p) => (p === 'notes' ? null : 'notes'));
              }}
            >
              <svg
                viewBox="0 0 14.6411 16.1998"
                width="14.6411"
                height="16.1998"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <g className="as1-bell-swing">
                  <path d="M11.0375 3.43128C10.489 2.65946 9.71386 2.07756 8.8196 1.76636C8.75971 1.41225 8.57637 1.0908 8.30206 0.858989C8.02776 0.62718 7.68023 0.5 7.3211 0.5C6.96197 0.5 6.61444 0.62718 6.34014 0.858989C6.06584 1.0908 5.88249 1.41225 5.8226 1.76636C4.92834 2.07756 4.15316 2.65946 3.60466 3.43128C3.05616 4.2031 2.76157 5.12654 2.76178 6.0734V9.82218L0.661451 11.7817C0.58689 11.8511 0.53498 11.9413 0.512496 12.0407C0.490012 12.14 0.497999 12.2438 0.535413 12.3386C0.572827 12.4333 0.637931 12.5146 0.722228 12.5717C0.806526 12.6289 0.906101 12.6594 1.00796 12.6591H13.6353C13.7368 12.6589 13.836 12.6283 13.9199 12.5711C14.0038 12.5139 14.0686 12.4328 14.1058 12.3383C14.1431 12.2438 14.151 12.1403 14.1287 12.0412C14.1064 11.9422 14.0549 11.8521 13.9808 11.7827L11.8804 9.82218V6.0734C11.8806 5.12654 11.586 4.2031 11.0375 3.43128Z" />
                  <path
                    className="as1-bell-clapper"
                    d="M5.8875 14.6844C5.99193 14.9812 6.18593 15.2384 6.44273 15.4202C6.69953 15.6021 7.00646 15.6998 7.32115 15.6998C7.63584 15.6998 7.94277 15.6021 8.19957 15.4202C8.45637 15.2384 8.65038 14.9812 8.75481 14.6844H5.8875Z"
                  />
                </g>
              </svg>
            </button>

            <button
              ref={avatarBtnRef}
              className="as1-avatar"
              type="button"
              aria-expanded={pop === 'account'}
              aria-label="Account"
              onClick={() => setPop((p) => (p === 'account' ? null : 'account'))}
            >
              <svg
                viewBox="0 0 32 32"
                width="26"
                height="26"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <g>
                  <path d="M23.2548 21.6174L23.5 22.5A1.1 1.1 0 0 1 22.4 23.6H9.6A1.1 1.1 0 0 1 8.5 22.5L8.7452 21.6174C9.1639 20.0161 10.1274 18.9739 12.2 18.9739H19.8C21.8726 18.9739 22.8361 20.0161 23.2548 21.6174Z" />
                  <path
                    className="as1-avatar-head"
                    d="M13.2365 15.6697C12.7316 14.9454 12.5456 13.5959 12.5456 12.3651C12.5456 10.8267 12.8909 8.4 16 8.4C19.1091 8.4 19.4548 11.4421 19.4548 12.3651C19.4548 13.5959 19.268 14.9454 18.7635 15.6697C18.1198 16.5928 17.0692 16.9913 16 16.9913C14.9695 16.9913 13.8789 16.5924 13.2365 15.6697Z"
                  />
                </g>
              </svg>
            </button>
          </header>

          {/* Help Popover */}
          <div
            ref={popRefs.help}
            className={`as1-pop as1-pop-help ${pop === 'help' ? 'as1-pop-open' : ''}`}
            style={popPos}
            role="menu"
            aria-label="Help"
          >
            <div className="as1-pop-list" style={{ paddingBlock: 'var(--as1-fly-pad-y)' }}>
              <Link to="/help" className="as1-pop-row" role="menuitem" onClick={() => setPop(null)}>
                <span className="as1-pop-label">Help &amp; Docs</span>
              </Link>
              <Link
                to="/help"
                hash="shortcuts"
                className="as1-pop-row"
                role="menuitem"
                onClick={() => setPop(null)}
              >
                <span className="as1-pop-label">Keyboard shortcuts</span>
              </Link>
              <Link
                to="/help"
                hash="changelog"
                className="as1-pop-row"
                role="menuitem"
                onClick={() => setPop(null)}
              >
                <span className="as1-pop-label">What&apos;s new</span>
              </Link>
              <Link to="/" className="as1-pop-row" role="menuitem" onClick={() => setPop(null)}>
                <span className="as1-pop-label">Public landing page</span>
              </Link>
            </div>
          </div>

          {/* Notifications Popover */}
          <div
            ref={popRefs.notes}
            className={`as1-pop as1-pop-notes ${pop === 'notes' ? 'as1-pop-open' : ''}`}
            style={popPos}
            role="menu"
            aria-label="Notifications"
          >
            <div className="as1-note-head">
              <span className="as1-note-title">Notifications</span>
              <button
                className="as1-note-clear"
                type="button"
                aria-label="Mark all as read"
                onClick={() => setNotes((prev) => prev.map((n) => ({ ...n, unread: false })))}
              >
                Mark all as read
              </button>
            </div>
            <span className="as1-pop-sep" aria-hidden="true" />
            <div className="as1-note-list">
              {notes.map((n) => (
                <button
                  key={n.id}
                  className="as1-pop-row as1-note"
                  type="button"
                  role="menuitem"
                  data-unread={n.unread ? 'true' : undefined}
                  onClick={() => {
                    setNotes((prev) =>
                      prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x))
                    );
                    setPop(null);
                    navigate({ to: n.to });
                  }}
                >
                  <span className="as1-note-dot" aria-hidden="true" />
                  <span className="as1-pop-label">{n.label}</span>
                  <span className="as1-note-time">{timeAgo(n.time)}</span>
                </button>
              ))}
            </div>
            {notes.length === 0 && <p className="as1-note-empty">You&apos;re all caught up</p>}
            <span className="as1-pop-sep" aria-hidden="true" />
            <div className="as1-pop-list" style={{ paddingBlock: 'var(--as1-fly-pad-y)' }}>
              <Link
                to="/approvals"
                className="as1-pop-row"
                role="menuitem"
                onClick={() => setPop(null)}
              >
                <span className="as1-pop-label">View all</span>
              </Link>
            </div>
          </div>

          {/* Account Popover */}
          <div
            ref={popRefs.account}
            className={`as1-pop as1-pop-account ${pop === 'account' ? 'as1-pop-open' : ''}`}
            style={popPos}
            role="menu"
            aria-label="Account"
          >
            <div className="as1-pop-head">
              <span className="as1-pop-avatar" aria-hidden="true">
                {initials(operatorName, operatorEmail)}
              </span>
              <span className="as1-pop-who">
                <span className="as1-pop-name">{operatorName}</span>
                <span className="as1-pop-mail">{operatorEmail}</span>
              </span>
            </div>
            <span className="as1-pop-sep" aria-hidden="true" />
            <div className="as1-pop-list" style={{ paddingBlock: 'var(--as1-fly-pad-y)' }}>
              <Link
                to="/settings"
                className="as1-pop-row"
                role="menuitem"
                onClick={() => setPop(null)}
              >
                <span className="as1-pop-label">Profile</span>
              </Link>
              <Link
                to="/settings"
                hash="brand"
                className="as1-pop-row"
                role="menuitem"
                onClick={() => setPop(null)}
              >
                <span className="as1-pop-label">Preferences</span>
              </Link>
              <span className="as1-pop-sep" role="separator" />
              <Link
                to="/"
                className="as1-pop-row"
                role="menuitem"
                onClick={() => setPop(null)}
              >
                <span className="as1-pop-label">Public landing page</span>
              </Link>
              <Link
                to="/login"
                className="as1-pop-row"
                role="menuitem"
                onClick={() => setPop(null)}
              >
                <span className="as1-pop-label">Switch operator</span>
              </Link>
              {onSignOut && (
                <button
                  type="button"
                  className="as1-pop-row"
                  role="menuitem"
                  onClick={() => {
                    setPop(null);
                    onSignOut();
                  }}
                >
                  <span className="as1-pop-label">Sign out</span>
                </button>
              )}
            </div>
          </div>

          <main className="as1-content" tabIndex={0}>
            {children}
          </main>
        </div>

        <button
          className="as1-scrim"
          type="button"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => setDrawerOpen(false)}
        />
      </div>
    </section>
  );
}
