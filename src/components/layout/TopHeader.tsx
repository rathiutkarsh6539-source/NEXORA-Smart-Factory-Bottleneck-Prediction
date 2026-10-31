import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { SCENARIO_DEFINITIONS } from '../../data/initialFactoryData';
import { NavigationPage, SimulationScenarioId, SimulationSpeed } from '../../types/factory';

interface TopHeaderProps {
  onOpenMobileMenu: () => void;
}

const PAGE_LABELS: Record<NavigationPage, string> = {
  dashboard: 'Executive Operations Overview',
  monitoring: 'Workstation Fleet Telemetry',
  prediction: 'Bottleneck Risk Prediction Engine',
  analytics: 'Statistical Machine Analytics',
  workflow: 'End-to-End Production Pipeline',
  alerts: 'Operational Alerts & Incident Triage',
  data: 'Production Data & CSV Management',
  recommendations: 'Smart Mitigation Recommendations',
  settings: 'Gateway & Threshold Configuration',
};

export const TopHeader: React.FC<TopHeaderProps> = ({ onOpenMobileMenu }) => {
  const {
    activePage,
    setActivePage,
    telemetrySourceMode,
    simClockFormatted,
    isRunning,
    toggleSimulation,
    simulationSpeed,
    setSimulationSpeed,
    scenario,
    selectScenario,
    resetSimulation,
    activeAlertCount,
    machines,
    alerts,
    globalSearchQuery,
    setGlobalSearchQuery,
    setSelectedFocusMachineId,
  } = useFactory();

  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const query = globalSearchQuery.trim().toLowerCase();
  const matchedMachines = query
    ? machines.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query) ||
          m.jobCode.toLowerCase().includes(query)
      )
    : [];
  const matchedAlerts = query
    ? alerts
        .filter(
          (a) =>
            a.machineName.toLowerCase().includes(query) ||
            a.triggerMetric.toLowerCase().includes(query) ||
            a.description.toLowerCase().includes(query)
        )
        .slice(0, 3)
    : [];

  const speeds: SimulationSpeed[] = [1, 2, 5];

  return (
    <header className="sticky top-0 z-30 border-b border-[#1e293b] bg-[#090d18]/95 backdrop-blur-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
        {/* Left Zone: Mobile Drawer Trigger + Breadcrumb + Simulated Mode Notice */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="rounded-lg border border-[#1e293b] bg-[#0f1626] p-2 text-slate-300 hover:bg-slate-800 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex flex-wrap items-center gap-2 text-sm min-w-0">
            <span className="hidden sm:inline font-mono text-xs text-amber-300 whitespace-nowrap">
              {telemetrySourceMode}
            </span>
            <span className="hidden sm:inline text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="hidden md:inline font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
              {simClockFormatted}
            </span>
            <span className="hidden md:inline text-slate-600" aria-hidden="true">
              /
            </span>
            <h1 className="truncate font-semibold text-slate-100">
              {PAGE_LABELS[activePage]}
            </h1>
          </div>
        </div>

        {/* Right Zone: Search + Simulation Toolbar + Alert Dispatch */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Asset & Incident Search */}
          <div className="relative">
            <div className="flex items-center rounded-lg border border-[#1e293b] bg-[#0f1626] px-3 py-1.5 focus-within:border-cyan-500/60">
              <Search className="mr-2 h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={globalSearchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search machine, lot, alert..."
                className="w-36 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none sm:w-44"
              />
              <kbd className="ml-2 hidden rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 xl:inline-block">
                ⌘K
              </kbd>
            </div>

            {searchOpen && query.length > 0 && (
              <div className="absolute right-0 mt-1.5 w-80 rounded-lg border border-[#1e293b] bg-[#0f1626] p-2 shadow-xl z-50">
                {matchedMachines.length === 0 && matchedAlerts.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-slate-400">
                    No matching stations or alerts for "{globalSearchQuery}".
                  </p>
                ) : (
                  <div className="space-y-2">
                    {matchedMachines.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
                          Workstations
                        </div>
                        {matchedMachines.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedFocusMachineId(m.id);
                              setActivePage('monitoring');
                              setSearchOpen(false);
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                          >
                            <span className="truncate">
                              {m.code} · {m.name}
                            </span>
                            <span className="font-mono text-cyan-400 tabular-nums">
                              {m.oee.toFixed(1)}% OEE
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {matchedAlerts.length > 0 && (
                      <div className="border-t border-[#1e293b] pt-1.5">
                        <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
                          Incidents
                        </div>
                        {matchedAlerts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setActivePage('alerts');
                              setSearchOpen(false);
                            }}
                            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                          >
                            <span className="truncate">
                              {a.machineId} · {a.triggerMetric}
                            </span>
                            <span className="font-mono text-amber-400">{a.severity}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scenario Selector */}
          <div className="flex items-center rounded-lg border border-[#1e293b] bg-[#0f1626] px-2.5 py-1.5">
            <SlidersHorizontal className="mr-2 h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <label htmlFor="header-scenario-select" className="sr-only">
              Production Scenario
            </label>
            <select
              id="header-scenario-select"
              value={scenario}
              onChange={(e) => selectScenario(e.target.value as SimulationScenarioId)}
              className="bg-[#0f1626] text-xs font-medium text-slate-100 focus:outline-none cursor-pointer"
            >
              {Object.values(SCENARIO_DEFINITIONS).map((sc) => (
                <option key={sc.id} value={sc.id} className="bg-[#0f1626] text-slate-100">
                  Scenario: {sc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Simulation Start / Pause + Speed + Reset */}
          <div className="flex items-center gap-1 rounded-lg border border-[#1e293b] bg-[#0f1626] p-1">
            <button
              type="button"
              onClick={toggleSimulation}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isRunning
                  ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>Start</span>
                </>
              )}
            </button>

            <div className="flex items-center border-l border-[#1e293b] pl-1">
              {speeds.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSimulationSpeed(spd)}
                  className={`rounded px-2 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    simulationSpeed === spd
                      ? 'bg-slate-700 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={resetSimulation}
              title="Reset factory simulation to nominal baseline"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Reset</span>
            </button>
          </div>

          {/* Alert Bell Button */}
          <button
            type="button"
            onClick={() => setActivePage('alerts')}
            className="relative flex items-center gap-1.5 rounded-lg border border-[#1e293b] bg-[#0f1626] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-700 hover:bg-slate-800 whitespace-nowrap shrink-0"
            aria-label="View active alerts"
          >
            <Bell className="h-4 w-4 text-slate-300" />
            <span className="font-mono tabular-nums">{activeAlertCount}</span>
            {activeAlertCount > 0 && (
              <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
