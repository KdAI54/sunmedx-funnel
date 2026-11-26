/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { hydrateServerFromMirrorIfEmpty } from './lib/api';
import { RouterProvider, useRouter } from './lib/router';
import { ActivityPage } from './pages/ActivityPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { BoardPage } from './pages/BoardPage';
import { ChannelsPage } from './pages/ChannelsPage';
import { ContentPage } from './pages/ContentPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { GeneratorDetailPage } from './pages/GeneratorDetailPage';
import { GeneratorIndexPage } from './pages/GeneratorIndexPage';
import { HelpPage } from './pages/HelpPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { LeadsPage } from './pages/LeadsPage';
import { LoginPage } from './pages/LoginPage';
import { MetricsPage } from './pages/MetricsPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { SitePage } from './pages/SitePage';

const SESSION_KEY = 'sx-operator-session';

interface OperatorSession {
  name: string;
  email: string;
}

function loadSession(): OperatorSession | null {
  if (typeof window === 'undefined') return null;
  try {
    // Clear legacy persistent localStorage login so exiting the app cleanly returns to Login
    window.localStorage.removeItem(SESSION_KEY);
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OperatorSession>;
    if (parsed && typeof parsed.email === 'string' && parsed.email.trim()) {
      return {
        name: (parsed.name || '').trim() || 'Sunmedx Operator',
        email: parsed.email.trim().toLowerCase(),
      };
    }
  } catch {
    // ignore invalid stored session
  }
  return null;
}

function AppRoutes() {
  const { pathname, search, navigate } = useRouter();
  const [operator, setOperator] = useState<OperatorSession | null>(loadSession);
  const [hydrationRevision, setHydrationRevision] = useState(0);

  useEffect(() => {
    let active = true;
    hydrateServerFromMirrorIfEmpty().then((restored) => {
      if (active && restored) {
        setHydrationRevision((n) => n + 1);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const loginOperator = useCallback((name: string, email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || 'Sunmedx Operator';
    const next = { name: cleanName, email: cleanEmail };
    setOperator(next);
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failure
    }
  }, []);

  const logoutOperator = useCallback(() => {
    setOperator(null);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore storage failure
    }
    navigate({ to: '/login' });
  }, [navigate]);

  if (pathname === '/' || pathname === '' || pathname === '/site') {
    return (
      <SitePage
        key={`site-${hydrationRevision}`}
        isLoggedIn={Boolean(operator)}
        operatorEmail={operator?.email}
      />
    );
  }

  if (pathname === '/login') {
    const target =
      search.next && search.next.startsWith('/') && search.next !== '/login'
        ? search.next
        : '/dashboard';
    return (
      <LoginPage
        initialEmail={operator?.email || ''}
        redirectTo={target}
        onLogin={loginOperator}
      />
    );
  }

  if (!operator) {
    return (
      <LoginPage
        redirectTo={pathname.startsWith('/') ? pathname : '/dashboard'}
        onLogin={loginOperator}
      />
    );
  }

  let page: React.ReactNode;
  if (pathname === '/dashboard') {
    page = <OverviewPage key={`ov-${hydrationRevision}`} />;
  } else if (pathname === '/board') {
    page = <BoardPage key={`bd-${hydrationRevision}`} />;
  } else if (pathname === '/leads') {
    page = <LeadsPage key={`ld-${hydrationRevision}`} />;
  } else if (pathname.startsWith('/leads/')) {
    const leadId = pathname.slice('/leads/'.length).split('/')[0];
    page = <LeadDetailPage key={`ldi-${hydrationRevision}`} leadId={decodeURIComponent(leadId)} />;
  } else if (pathname === '/activity') {
    page = <ActivityPage key={`ac-${hydrationRevision}`} />;
  } else if (pathname === '/approvals') {
    page = <ApprovalsPage key={`ap-${hydrationRevision}`} />;
  } else if (pathname === '/generator' || pathname === '/generator/') {
    page = <GeneratorIndexPage key={`gi-${hydrationRevision}`} />;
  } else if (pathname.startsWith('/generator/')) {
    const campaignId = pathname.slice('/generator/'.length).split('/')[0];
    page = (
      <GeneratorDetailPage
        key={`gd-${hydrationRevision}`}
        campaignId={decodeURIComponent(campaignId)}
      />
    );
  } else if (pathname === '/automations') {
    page = <AutomationsPage key={`au-${hydrationRevision}`} />;
  } else if (pathname === '/channels') {
    page = <ChannelsPage key={`ch-${hydrationRevision}`} />;
  } else if (pathname === '/metrics') {
    page = <MetricsPage key={`mt-${hydrationRevision}`} />;
  } else if (pathname === '/experiments') {
    page = <ExperimentsPage key={`ex-${hydrationRevision}`} />;
  } else if (pathname === '/content') {
    page = <ContentPage key={`cn-${hydrationRevision}`} />;
  } else if (pathname === '/settings') {
    page = <SettingsPage key={`st-${hydrationRevision}`} />;
  } else if (pathname === '/help') {
    page = <HelpPage key={`hp-${hydrationRevision}`} />;
  } else {
    page = <OverviewPage key={`ov2-${hydrationRevision}`} />;
  }

  return (
    <Shell
      operatorName={operator.name}
      operatorEmail={operator.email}
      onSignOut={logoutOperator}
    >
      {page}
    </Shell>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </RouterProvider>
  );
}
