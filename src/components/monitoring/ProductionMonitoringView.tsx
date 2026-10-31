import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Settings2,
  Sliders,
  Thermometer,
  Wrench,
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { MachineOperationalStatus } from '../../types/factory';

export const ProductionMonitoringView: React.FC = () => {
  const {
    machines,
    predictions,
    telemetrySourceMode,
    selectedFocusMachineId,
    setSelectedFocusMachineId,
    updateMachineParameter,
    applyMachineMitigation,
    triggerMachineSetup,
    setActivePage,
  } = useFactory();

  const [statusFilter, setStatusFilter] = useState<'All' | MachineOperationalStatus>('All');
  const [expandedTuneId, setExpandedTuneId] = useState<string | null>(selectedFocusMachineId);

  const filteredMachines = machines.filter((m) =>
    statusFilter === 'All' ? true : m.status === statusFilter
  );

  const statusStyles: Record<
    MachineOperationalStatus,
    { border: string; text: string; indicator: string }
  > = {
    Normal: {
      border: 'border-[#1e293b]',
      text: 'text-emerald-400',
      indicator: 'bg-emerald-400',
    },
    Warning: {
      border: 'border-amber-500/45',
      text: 'text-amber-400',
      indicator: 'bg-amber-400',
    },
    Critical: {
      border: 'border-rose-500/55',
      text: 'text-rose-400',
      indicator: 'bg-rose-500',
    },
  };

  return (
    <div className="space-y-6">
      {/* Header & Interactive Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-100">
              Workstation Telemetry Monitor
            </h2>
            <span className="font-mono text-xs text-amber-300">
              · {telemetrySourceMode} STREAM
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Conserved unit accounting (Entered = Processed + WIP · Processed = Good + Rejected) and live OEE = Avail × Perf × Qual
          </p>
        </div>

        {/* Interactive Filter Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-[#1e293b] bg-[#090d18] p-1">
          {(['All', 'Normal', 'Warning', 'Critical'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-slate-800 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
              {st !== 'All' && (
                <span className="ml-1.5 font-mono text-[11px] tabular-nums">
                  ({machines.filter((m) => m.status === st).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Workstation Cards Grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {filteredMachines.map((m) => {
          const pred = predictions.find((p) => p.machineId === m.id);
          const style = statusStyles[m.status];
          const isTuning = expandedTuneId === m.id;
          const queuePct = Math.min(
            100,
            Math.round((m.queueLength / Math.max(1, m.bufferCapacity)) * 100)
          );

          return (
            <article
              key={m.id}
              className={`rounded-xl border bg-[#0f1626] p-5 transition-colors ${style.border}`}
            >
              {/* Top Row: ID, Name, Status & Weighted Risk Score */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1e293b] pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono font-semibold text-cyan-400">{m.code}</span>
                    <span aria-hidden="true">·</span>
                    <span>Stage {m.stageOrder} of 5</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">State: {m.operatingState}</span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-slate-100">{m.name}</h3>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Operational Status</div>
                    <div
                      className={`flex items-center justify-end gap-1.5 text-xs font-semibold ${style.text}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${style.indicator}`} />
                      <span>{m.status}</span>
                    </div>
                  </div>

                  <div className="border-l border-[#1e293b] pl-4 text-right">
                    <div className="text-[11px] text-slate-400">Weighted Risk Score</div>
                    <div
                      className={`font-mono text-xs font-bold tabular-nums ${
                        pred?.classification === 'CRITICAL'
                          ? 'text-rose-400'
                          : pred?.classification === 'HIGH'
                          ? 'text-amber-400'
                          : pred?.classification === 'MODERATE'
                          ? 'text-sky-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {pred?.riskScore ?? 0}/100 · {pred?.classification ?? 'LOW'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Coupling Notices (Blockage / Starvation) */}
              {(m.isBlocked || m.isStarved) && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {m.isBlocked
                      ? 'Outfeed Blocked: Downstream workstation input buffer is near capacity.'
                      : 'Infeed Starved: Waiting on upstream workstation conforming unit completion.'}
                  </span>
                </div>
              )}

              {/* Unit Accounting Strip (Entered, Processed, Good, Rejected, WIP) */}
              <div className="mt-4 grid grid-cols-5 gap-2 rounded-lg border border-[#1e293b] bg-[#090d18] p-3 text-center">
                <div>
                  <div className="text-[11px] text-slate-400">Entered</div>
                  <div className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                    {m.unitsEntered}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Processed</div>
                  <div className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                    {m.unitsProcessed}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Good Out</div>
                  <div className="font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                    {m.unitsGood}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Rejected</div>
                  <div className="font-mono text-xs font-semibold text-rose-400 tabular-nums">
                    {m.unitsRejected}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">WIP Queue</div>
                  <div
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      queuePct >= 88 ? 'text-amber-400' : 'text-cyan-300'
                    }`}
                  >
                    {m.queueLength}/{m.bufferCapacity}
                  </div>
                </div>
              </div>

              {/* Core Sensor Telemetry Readouts */}
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-400">Production Rate</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {m.productionRate} u/hr
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Cycle Time</div>
                  <div
                    className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                      m.cycleTime > m.targetCycleTime * 1.1 ? 'text-amber-400' : 'text-slate-100'
                    }`}
                  >
                    {m.cycleTime.toFixed(1)}s{' '}
                    <span className="text-xs font-normal text-slate-500">
                      / {m.targetCycleTime}s
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Utilization</div>
                  <div
                    className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                      m.utilization >= 90 ? 'text-rose-400' : 'text-slate-100'
                    }`}
                  >
                    {m.utilization.toFixed(1)}%
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Downtime / Planned</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {m.downtime.toFixed(1)}m{' '}
                    <span className="text-xs font-normal text-slate-500">
                      / {m.plannedTimeMinutes.toFixed(0)}m
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Temperature</div>
                  <div
                    className={`mt-0.5 flex items-center gap-1 font-mono text-sm font-semibold tabular-nums ${
                      m.temperature >= m.tempWarningLimit ? 'text-rose-400' : 'text-slate-100'
                    }`}
                  >
                    <Thermometer className="h-3.5 w-3.5 text-slate-400" />
                    {m.temperature.toFixed(1)}°C
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Defect Rate</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {m.defectRate.toFixed(2)}%
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Vibration RMS</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {m.vibrationMmS.toFixed(1)} mm/s
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400">Power Draw</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {m.powerKw.toFixed(1)} kW
                  </div>
                </div>
              </div>

              {/* OEE Formula Verification Strip + Station Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1e293b] pt-3.5 text-xs text-slate-400">
                <div className="font-mono tabular-nums">
                  <span className="font-semibold text-slate-200">OEE {m.oee.toFixed(1)}%</span> ={' '}
                  <span>A {m.availability.toFixed(1)}%</span> ×{' '}
                  <span>P {m.performance.toFixed(1)}%</span> ×{' '}
                  <span>Q {m.quality.toFixed(1)}%</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerMachineSetup(m.id)}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    <span>Run Setup</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const next = isTuning ? null : m.id;
                      setExpandedTuneId(next);
                      setSelectedFocusMachineId(next);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{isTuning ? 'Hide Controls' : 'Adjust Params'}</span>
                  </button>

                  {m.status !== 'Normal' && (
                    <button
                      type="button"
                      onClick={() => applyMachineMitigation(m.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30 whitespace-nowrap shrink-0"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>Stabilize Cell</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Interactive Parameter Adjustment Panel */}
              {isTuning && (
                <div className="mt-4 rounded-lg border border-[#1e293b] bg-[#090d18] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">
                      Simulated Parameter Override ({m.code})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActivePage('prediction')}
                      className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                    >
                      Inspect Risk Score Impact →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block text-xs text-slate-400">
                      <div className="flex justify-between">
                        <span>Cycle Time (s)</span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {m.cycleTime.toFixed(1)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min={32}
                        max={65}
                        step={0.5}
                        value={m.cycleTime}
                        onChange={(e) =>
                          updateMachineParameter(m.id, { cycleTime: Number(e.target.value) })
                        }
                        className="mt-1.5 w-full accent-cyan-500"
                      />
                    </label>

                    <label className="block text-xs text-slate-400">
                      <div className="flex justify-between">
                        <span>WIP Queue Length (units)</span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {m.queueLength} units
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={45}
                        step={1}
                        value={m.queueLength}
                        onChange={(e) =>
                          updateMachineParameter(m.id, { queueLength: Number(e.target.value) })
                        }
                        className="mt-1.5 w-full accent-cyan-500"
                      />
                    </label>

                    <label className="block text-xs text-slate-400">
                      <div className="flex justify-between">
                        <span>Utilization (%)</span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {m.utilization.toFixed(1)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={45}
                        max={99}
                        step={0.5}
                        value={m.utilization}
                        onChange={(e) =>
                          updateMachineParameter(m.id, { utilization: Number(e.target.value) })
                        }
                        className="mt-1.5 w-full accent-cyan-500"
                      />
                    </label>

                    <label className="block text-xs text-slate-400">
                      <div className="flex justify-between">
                        <span>Temperature (°C)</span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {m.temperature.toFixed(1)}°C
                        </span>
                      </div>
                      <input
                        type="range"
                        min={35}
                        max={95}
                        step={0.5}
                        value={m.temperature}
                        onChange={(e) =>
                          updateMachineParameter(m.id, { temperature: Number(e.target.value) })
                        }
                        className="mt-1.5 w-full accent-cyan-500"
                      />
                    </label>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {filteredMachines.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#1e293b] bg-[#0f1626] py-14 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <h3 className="mt-3 text-sm font-semibold text-slate-200">
            No workstations in "{statusFilter}" state
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Switch filter to "All" or select a stress scenario in the top toolbar.
          </p>
          <button
            type="button"
            onClick={() => setStatusFilter('All')}
            className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Show All Workstations
          </button>
        </div>
      )}
    </div>
  );
};
