/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
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
    const raw = window.localStorage.getItem(SESSION_KEY);
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

  const loginOperator = useCallback((name: string, email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || 'Sunmedx Operator';
    const next = { name: cleanName, email: cleanEmail };
    setOperator(next);
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failure
    }
  }, []);

  const logoutOperator = useCallback(() => {
    setOperator(null);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore storage failure
    }
    navigate({ to: '/' });
  }, [navigate]);

  if (pathname === '/' || pathname === '' || pathname === '/site') {
    return (
      <SitePage
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
    page = <OverviewPage />;
  } else if (pathname === '/board') {
    page = <BoardPage />;
  } else if (pathname === '/leads') {
    page = <LeadsPage />;
  } else if (pathname.startsWith('/leads/')) {
    const leadId = pathname.slice('/leads/'.length).split('/')[0];
    page = <LeadDetailPage leadId={decodeURIComponent(leadId)} />;
  } else if (pathname === '/activity') {
    page = <ActivityPage />;
  } else if (pathname === '/approvals') {
    page = <ApprovalsPage />;
  } else if (pathname === '/generator' || pathname === '/generator/') {
    page = <GeneratorIndexPage />;
  } else if (pathname.startsWith('/generator/')) {
    const campaignId = pathname.slice('/generator/'.length).split('/')[0];
    page = <GeneratorDetailPage campaignId={decodeURIComponent(campaignId)} />;
  } else if (pathname === '/automations') {
    page = <AutomationsPage />;
  } else if (pathname === '/channels') {
    page = <ChannelsPage />;
  } else if (pathname === '/metrics') {
    page = <MetricsPage />;
  } else if (pathname === '/experiments') {
    page = <ExperimentsPage />;
  } else if (pathname === '/content') {
    page = <ContentPage />;
  } else if (pathname === '/settings') {
    page = <SettingsPage />;
  } else if (pathname === '/help') {
    page = <HelpPage />;
  } else {
    page = <OverviewPage />;
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
