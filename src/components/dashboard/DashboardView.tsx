import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  Gauge,
  PackageCheck,
  ShieldAlert,
  TimerOff,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFactory } from '../../context/FactoryContext';
import { SCENARIO_DEFINITIONS } from '../../data/initialFactoryData';
import { MachineStatusTimeline } from './MachineStatusTimeline';
import { PredictiveWorkflowPanel } from './PredictiveWorkflowPanel';

export const DashboardView: React.FC = () => {
  const {
    machines,
    predictions,
    kpis,
    alerts,
    timeSeries,
    simClockMs,
    scenario,
    telemetrySourceMode,
    setActivePage,
    acknowledgeAlert,
    executeAlertMitigation,
    applyMachineMitigation,
    triggerMachineSetup,
    setSelectedFocusMachineId,
  } = useFactory();

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const topPrediction = predictions[0];

  const getOeeColorClass = (oee: number) => {
    if (oee >= 82) return 'text-emerald-400';
    if (oee >= 72) return 'text-cyan-400';
    if (oee >= 60) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getStatusTextClass = (status: string) => {
    if (status === 'Critical') return 'text-rose-400';
    if (status === 'Warning') return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="space-y-6">
      {/* Context & Mass-Balance Verification Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1e293b] bg-[#0f1626] px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="font-mono text-amber-300">{telemetrySourceMode} TELEMETRY</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-slate-200">
            {SCENARIO_DEFINITIONS[scenario].label}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-slate-300 tabular-nums">
            Raw In: {kpis.rawMaterialReleased}u = WIP ({kpis.totalWipInSystem}u) + Rejected (
            {kpis.totalRejectedAllStages}u) + Finished Goods ({kpis.finishedGoodsDispatched}u)
          </span>
        </div>
        <button
          type="button"
          onClick={() => setActivePage('workflow')}
          className="flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
        >
          <span>Inspect 7-Stage Mass Flow</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 6 Executive KPI Cards */}
      <section
        aria-label="Key Performance Indicators"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6"
      >
        {/* 1. Finished Goods Output */}
        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Finished Goods Output</span>
            <PackageCheck className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
              {kpis.totalOutput}
            </span>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              / {kpis.shiftTarget} u
            </span>
          </div>
          <div className="mt-2 font-mono text-[11px] text-slate-400 tabular-nums">
            WIP {kpis.totalWipInSystem}u · Scrap {kpis.totalRejectedAllStages}u
          </div>
        </div>

        {/* 2. Overall Equipment Effectiveness (OEE) */}
        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span title="Arithmetic mean of the 5 individual workstation OEEs (A × P × Q)">
              Fleet OEE (Mean)
            </span>
            <Gauge className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-bold tabular-nums ${getOeeColorClass(
                kpis.fleetOee
              )}`}
            >
              {kpis.fleetOee.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 font-mono text-[11px] text-slate-400 tabular-nums">
            A {kpis.avgAvailability.toFixed(1)}% · P {kpis.avgPerformance.toFixed(1)}% · Q{' '}
            {kpis.avgQuality.toFixed(1)}%
          </div>
        </div>

        {/* 3. Machine Utilization */}
        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Machine Utilization</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
              {kpis.avgUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 truncate">
            Peak {kpis.peakUtilization.toFixed(1)}% ({kpis.peakUtilizationMachine})
          </div>
        </div>

        {/* 4. Average Production Cycle Time */}
        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Avg Cycle Time</span>
            <Clock className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
              {kpis.avgCycleTime.toFixed(1)}s
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span
              className={`font-mono font-medium tabular-nums ${
                kpis.taktVarianceSeconds <= 0.5 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {kpis.taktVarianceSeconds > 0 ? '+' : ''}
              {kpis.taktVarianceSeconds}s
            </span>{' '}
            vs {machines[0]?.targetCycleTime ?? 42}s takt
          </div>
        </div>

        {/* 5. Downtime Percentage */}
        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Downtime Share</span>
            <TimerOff className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
              {kpis.downtimePercentage.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 font-mono text-[11px] text-slate-400 tabular-nums">
            {kpis.totalDowntimeMinutes.toFixed(0)}m / {kpis.totalPlannedMinutes.toFixed(0)}m planned
          </div>
        </div>

        {/* 6. Weighted Bottleneck Risk Score */}
        <button
          type="button"
          onClick={() => setActivePage('prediction')}
          className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4 text-left hover:border-cyan-500/40 transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Bottleneck Risk Score</span>
            <ShieldAlert
              className={`h-4 w-4 ${
                kpis.maxBottleneckRisk >= 70
                  ? 'text-rose-400'
                  : kpis.maxBottleneckRisk >= 50
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            />
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-bold tabular-nums ${
                kpis.maxBottleneckRisk >= 70
                  ? 'text-rose-400'
                  : kpis.maxBottleneckRisk >= 50
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {kpis.maxBottleneckRisk}/100
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300">
              {kpis.maxBottleneckClassification}
            </span>
          </div>
          <div className="mt-2 truncate text-xs text-slate-400">
            {kpis.primaryBottleneckMachine}
          </div>
        </button>
      </section>

      {/* Workstation OEE Overview Cards (5 Connected Machines) */}
      <section aria-label="Workstation Overview">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Simulated Workstation Fleet (Line A · Serial Stages 1–5)
            </h2>
            <p className="text-xs text-slate-400">
              Station OEE = Availability × Performance × Quality · Fleet OEE ({kpis.fleetOee.toFixed(1)}%) = arithmetic mean of 5 station OEEs
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActivePage('monitoring')}
            className="flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
          >
            <span>Detailed Telemetry</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {machines.map((m) => {
            const pred = predictions.find((p) => p.machineId === m.id);
            const progressPct = Math.min(
              100,
              Math.round((m.unitsGood / Math.max(1, m.targetDemand)) * 100)
            );

            return (
              <div
                key={m.id}
                onClick={() => {
                  setSelectedFocusMachineId(m.id);
                  setActivePage('monitoring');
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedFocusMachineId(m.id);
                    setActivePage('monitoring');
                  }
                }}
                className={`cursor-pointer rounded-xl border bg-[#0f1626] p-4 transition-colors hover:border-cyan-500/40 ${
                  m.status === 'Critical'
                    ? 'border-rose-500/50'
                    : m.status === 'Warning'
                    ? 'border-amber-500/40'
                    : 'border-[#1e293b]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-slate-400">{m.code}</div>
                    <h3 className="truncate text-sm font-semibold text-slate-100">
                      {m.shortName}
                    </h3>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${getStatusTextClass(
                      m.status
                    )}`}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    {m.status}
                  </span>
                </div>

                {/* Prominent OEE Value & Weighted Risk Score */}
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span
                      className={`font-mono text-3xl font-bold tabular-nums ${getOeeColorClass(
                        m.oee
                      )}`}
                    >
                      {m.oee.toFixed(1)}%
                    </span>
                    <span className="ml-1.5 text-xs text-slate-400">OEE</span>
                  </div>
                  <div className="text-right font-mono text-xs text-slate-400 tabular-nums">
                    Score{' '}
                    <span
                      className={
                        (pred?.riskScore ?? 0) >= 70
                          ? 'font-semibold text-rose-400'
                          : (pred?.riskScore ?? 0) >= 50
                          ? 'font-semibold text-amber-400'
                          : 'text-slate-200'
                      }
                    >
                      {pred?.riskScore ?? 0}/100
                    </span>
                  </div>
                </div>

                {/* OEE Three Pillars: Availability, Performance, Quality */}
                <div className="mt-3 grid grid-cols-3 gap-2 border-y border-[#1e293b] py-2.5 text-center">
                  <div>
                    <div className="text-[11px] text-slate-400">Avail</div>
                    <div className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                      {m.availability.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Perf</div>
                    <div className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                      {m.performance.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Qual</div>
                    <div className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                      {m.quality.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Conforming Good Count, Rejects, & WIP */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Good / Target</span>
                    <span className="font-mono text-slate-200 tabular-nums">
                      {m.unitsGood} / {m.targetDemand}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-transform duration-300 origin-left ${
                        m.status === 'Critical'
                          ? 'bg-rose-500'
                          : m.status === 'Warning'
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                      style={{ transform: `scaleX(${progressPct / 100})` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono tabular-nums">
                      WIP {m.queueLength}/{m.bufferCapacity}
                    </span>
                    <span className="font-mono tabular-nums">
                      Reject {m.unitsRejected}u · {m.temperature.toFixed(1)}°C
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Machine Status Gantt Timeline (Simulated History) */}
      <MachineStatusTimeline
        machines={machines}
        simClockMs={simClockMs}
        onSelectMachine={(id) => {
          setSelectedFocusMachineId(id);
          setActivePage('monitoring');
        }}
        onTriggerSetup={(id) => triggerMachineSetup(id)}
      />

      {/* Predictive Analytics Curve & Closed-Loop Automation */}
      <PredictiveWorkflowPanel
        timeSeries={timeSeries}
        topPrediction={topPrediction}
        onApplyMitigation={(machineId) => applyMachineMitigation(machineId)}
        onNavigatePrediction={() => setActivePage('prediction')}
      />

      {/* Bottom Row: Shift Throughput Analytics + Live Incident Feed */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Shift Throughput Area Chart */}
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Cumulative Finished Goods vs Planned Pace
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Conforming units completed by Packaging Cell (PKG-05) across sequential simulation steps
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('analytics')}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
            >
              Full Analytics
            </button>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="actualOutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#1e293b' }}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d18',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="plannedOutput"
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  fill="none"
                  strokeWidth={2}
                  name="Planned Pace (u)"
                />
                <Area
                  type="monotone"
                  dataKey="actualOutput"
                  stroke="#06b6d4"
                  fill="url(#actualOutGrad)"
                  strokeWidth={2.5}
                  name="Finished Goods (u)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Active Industrial Incident Triage */}
        <section className="flex flex-col justify-between rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Active Operational Alerts ({activeAlerts.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Real-time threshold violations deduplicated per station metric
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('alerts')}
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
              >
                All Alerts
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {activeAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-[#1e293b] bg-[#090d18] py-10 text-center px-4">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                  <p className="mt-2 text-sm font-medium text-slate-200">
                    Zero Active Threshold Breaches
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    All 5 simulated manufacturing cells are operating within configured safety and buffer limits.
                  </p>
                </div>
              ) : (
                activeAlerts.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-lg border border-[#1e293b] bg-[#090d18] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                        <AlertTriangle
                          className={`h-3.5 w-3.5 shrink-0 ${
                            alert.severity === 'Critical' ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        />
                        {alert.machineName}
                      </span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {alert.timestamp}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{alert.description}</p>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {alert.triggerMetric}: {alert.currentValue}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="rounded border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          onClick={() => executeAlertMitigation(alert.id)}
                          className="rounded bg-cyan-500/20 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/30 whitespace-nowrap shrink-0"
                        >
                          Mitigate
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
