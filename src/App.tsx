/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertsView } from './components/alerts/AlertsView';
import { MachineAnalyticsView } from './components/analytics/MachineAnalyticsView';
import { DashboardView } from './components/dashboard/DashboardView';
import { DataManagementView } from './components/data/DataManagementView';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { ProductionMonitoringView } from './components/monitoring/ProductionMonitoringView';
import { BottleneckPredictionView } from './components/prediction/BottleneckPredictionView';
import { RecommendationsView } from './components/recommendations/RecommendationsView';
import { SettingsView } from './components/settings/SettingsView';
import { ProductionWorkflowView } from './components/workflow/ProductionWorkflowView';
import { FactoryProvider, useFactory } from './context/FactoryContext';

const FactoryWorkspaceShell: React.FC = () => {
  const { activePage } = useFactory();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardView />;
      case 'monitoring':
        return <ProductionMonitoringView />;
      case 'prediction':
        return <BottleneckPredictionView />;
      case 'analytics':
        return <MachineAnalyticsView />;
      case 'workflow':
        return <ProductionWorkflowView />;
      case 'alerts':
        return <AlertsView />;
      case 'data':
        return <DataManagementView />;
      case 'recommendations':
        return <RecommendationsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090d18] text-slate-100">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-[1440px]">{renderActivePage()}</div>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <FactoryProvider>
      <FactoryWorkspaceShell />
    </FactoryProvider>
  );
}
