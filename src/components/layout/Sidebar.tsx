import React from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Database,
  GitMerge,
  LayoutDashboard,
  Lightbulb,
  Settings,
  X,
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { NavigationPage } from '../../types/factory';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: NavigationPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'monitoring', label: 'Production Monitoring', icon: Activity },
  { id: 'prediction', label: 'Bottleneck Prediction', icon: BrainCircuit },
  { id: 'analytics', label: 'Machine Analytics', icon: BarChart3 },
  { id: 'workflow', label: 'Production Workflow', icon: GitMerge },
  { id: 'alerts', label: 'Alerts & Notifications', icon: AlertTriangle },
  { id: 'data', label: 'Data Management', icon: Database },
  { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const {
    activePage,
    setActivePage,
    activeAlertCount,
    kpis,
    isRunning,
    telemetrySourceMode,
    simClockFormatted,
  } = useFactory();

  const handleSelect = (page: NavigationPage) => {
    setActivePage(page);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#1e293b] bg-[#0b101e] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-[#1e293b] px-5">
          <button
            type="button"
            onClick={() => handleSelect('dashboard')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-cyan-500"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-none stroke-current" strokeWidth="2">
                <path d="M4 18V6l8 6V6l8 6v6H4z" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
              NEXORA IIoT
            </span>
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary Sidebar">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            const showAlertCount = item.id === 'alerts' && activeAlertCount > 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/12 text-cyan-300 ring-1 ring-inset ring-cyan-500/30'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3 truncate">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>

                {showAlertCount && (
                  <span className="ml-2 font-mono text-xs font-semibold text-rose-400 tabular-nums">
                    {activeAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Transparent Telemetry Source & Plant Summary Footer */}
        <div className="border-t border-[#1e293b] p-4">
          <div className="rounded-lg border border-[#1e293b] bg-[#0f1626] p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-300">{telemetrySourceMode} DATA</span>
              <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                {isRunning ? 'Sim Active' : 'Sim Paused'} · {simClockFormatted}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              No physical PLC connected · Local Line A model
            </p>
            <div className="mt-2.5 flex items-center justify-between border-t border-[#1e293b] pt-2.5 text-xs text-slate-400">
              <span>Fleet OEE (Mean)</span>
              <span className="font-mono font-semibold text-cyan-300 tabular-nums">
                {kpis.fleetOee.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>Max Risk Score</span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  kpis.maxBottleneckRisk >= 70
                    ? 'text-rose-400'
                    : kpis.maxBottleneckRisk >= 50
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {kpis.maxBottleneckRisk}/100 ({kpis.maxBottleneckClassification})
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
