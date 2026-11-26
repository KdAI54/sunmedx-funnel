/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
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

function AppRoutes() {
  const { pathname } = useRouter();
  const [operator, setOperator] = useState({
    name: 'Sunmedx Owner',
    email: 'operator@sunmedx.app',
  });

  if (pathname === '/site') {
    return <SitePage />;
  }

  if (pathname === '/login') {
    return (
      <LoginPage
        onSwitchOperator={(name, email) => setOperator({ name, email })}
      />
    );
  }

  let page: React.ReactNode;
  if (pathname === '/' || pathname === '') {
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
    <Shell operatorName={operator.name} operatorEmail={operator.email}>
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
