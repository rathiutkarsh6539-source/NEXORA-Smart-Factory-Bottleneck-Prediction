import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Filter } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';

export const MachineAnalyticsView: React.FC = () => {
  const {
    machines,
    predictions,
    kpis,
    timeSeries,
    downtimePareto,
    productionRecords,
    thresholds,
    telemetrySourceMode,
  } = useFactory();

  const [selectedDate, setSelectedDate] = useState<string>('2026-10-31');
  const [selectedMachine, setSelectedMachine] = useState<string>('ALL');
  const [selectedLine, setSelectedLine] = useState<'ALL' | 'Line A' | 'Line B' | 'Line C'>('Line A');
  const [selectedShift, setSelectedShift] = useState<'ALL' | 'Shift 1' | 'Shift 2' | 'Shift 3'>(
    'Shift 1'
  );

  // When viewing live Shift 1 / Line A / 2026-10-31 (or ALL), use exact centralized live `machines` state.
  // When filtering historical shifts/dates/lines, aggregate directly from centralized `productionRecords`.
  const isLivePrimarySlice =
    (selectedDate === '2026-10-31' || selectedDate === 'ALL') &&
    (selectedLine === 'Line A' || selectedLine === 'ALL') &&
    (selectedShift === 'Shift 1' || selectedShift === 'ALL');

  const stationComparisonData = useMemo(() => {
    if (isLivePrimarySlice) {
      const list =
        selectedMachine === 'ALL'
          ? machines
          : machines.filter((m) => m.id === selectedMachine);
      return list.map((m) => ({
        code: m.code,
        utilization: m.utilization,
        queueLength: m.queueLength,
        availability: m.availability,
        performance: m.performance,
        quality: m.quality,
        oee: m.oee,
        unitsGood: m.unitsGood,
        unitsRejected: m.unitsRejected,
      }));
    }

    // Derive from centralized historical/uploaded records matching active filters
    const filteredRecs = productionRecords.filter((r) => {
      if (selectedDate !== 'ALL' && r.date !== selectedDate) return false;
      if (selectedLine !== 'ALL' && r.line !== selectedLine) return false;
      if (selectedShift !== 'ALL' && r.shift !== selectedShift) return false;
      if (selectedMachine !== 'ALL' && r.machineId !== selectedMachine) return false;
      return true;
    });

    const targetMachines =
      selectedMachine === 'ALL'
        ? machines
        : machines.filter((m) => m.id === selectedMachine);

    return targetMachines.map((baseM) => {
      const matching = filteredRecs.filter((r) => r.machineId === baseM.id);
      if (matching.length === 0) {
        return {
          code: baseM.code,
          utilization: baseM.utilization,
          queueLength: baseM.queueLength,
          availability: baseM.availability,
          performance: baseM.performance,
          quality: baseM.quality,
          oee: baseM.oee,
          unitsGood: baseM.unitsGood,
          unitsRejected: baseM.unitsRejected,
        };
      }
      const latest = matching[0];
      const avail = Number((((320 - latest.downtime) / 320) * 100).toFixed(1));
      const perf = Number(
        Math.min(100, (thresholds.nominalTaktSeconds / latest.cycleTime) * 100).toFixed(1)
      );
      const qual =
        latest.unitsProcessed > 0
          ? Number(((latest.unitsGood / latest.unitsProcessed) * 100).toFixed(1))
          : Number((100 - latest.defectRate).toFixed(1));
      return {
        code: baseM.code,
        utilization: latest.utilization,
        queueLength: latest.queueLength,
        availability: avail,
        performance: perf,
        quality: qual,
        oee: latest.oee,
        unitsGood: latest.unitsGood,
        unitsRejected: latest.unitsRejected,
      };
    });
  }, [
    isLivePrimarySlice,
    machines,
    productionRecords,
    selectedDate,
    selectedLine,
    selectedMachine,
    selectedShift,
    thresholds.nominalTaktSeconds,
  ]);

  const riskDistributionData = useMemo(() => {
    const palette = ['#f43f5e', '#f59e0b', '#06b6d4', '#38bdf8', '#10b981'];
    return predictions
      .filter((p) => (selectedMachine === 'ALL' ? true : p.machineId === selectedMachine))
      .map((p, idx) => ({
        name: p.machineCode,
        fullName: p.machineName,
        value: Math.max(1, p.riskScore),
        color: palette[idx % palette.length],
      }));
  }, [predictions, selectedMachine]);

  return (
    <div className="space-y-6">
      {/* Multi-Dimensional Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Filter className="h-4 w-4 text-cyan-400" />
            <span>Operational Analytics ({telemetrySourceMode} Centralized Dataset)</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Live Finished Goods: {kpis.totalOutput}u · Fleet OEE (Mean): {kpis.fleetOee.toFixed(1)}% · Total WIP: {kpis.totalWipInSystem}u
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-label="Filter by date"
            className="rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="2026-10-31">Date: 2026-10-31 (Live Sim)</option>
            <option value="2026-10-30">Date: 2026-10-30</option>
            <option value="2026-10-29">Date: 2026-10-29</option>
            <option value="ALL">All Dates</option>
          </select>

          <select
            value={selectedMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            aria-label="Filter by machine"
            className="rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="ALL">All Workstations (5)</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.shortName}
              </option>
            ))}
          </select>

          <select
            value={selectedLine}
            onChange={(e) =>
              setSelectedLine(e.target.value as 'ALL' | 'Line A' | 'Line B' | 'Line C')
            }
            aria-label="Filter by production line"
            className="rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="Line A">Line A (Live Sim)</option>
            <option value="Line B">Line B (Historical)</option>
            <option value="Line C">Line C (Historical)</option>
            <option value="ALL">All Production Lines</option>
          </select>

          <select
            value={selectedShift}
            onChange={(e) =>
              setSelectedShift(e.target.value as 'ALL' | 'Shift 1' | 'Shift 2' | 'Shift 3')
            }
            aria-label="Filter by shift"
            className="rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="Shift 1">Shift 1 (Live Sim)</option>
            <option value="Shift 2">Shift 2</option>
            <option value="Shift 3">Shift 3</option>
            <option value="ALL">All Shifts</option>
          </select>
        </div>
      </div>

      {/* Row 1: Planned vs Actual Finished Goods + Utilization & WIP Comparison */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
          <h3 className="text-base font-semibold text-slate-100">
            Planned vs Actual Finished Goods Over Time
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Sequential simulation timestamps (HH:MM:SS) · Actual = PKG-05 conforming finished units
          </p>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsOutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={11} tickLine={false} />
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="plannedOutput"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  fill="none"
                  strokeWidth={2}
                  name="Planned Pace (u)"
                />
                <Area
                  type="monotone"
                  dataKey="actualOutput"
                  stroke="#06b6d4"
                  fill="url(#analyticsOutGrad)"
                  strokeWidth={2.5}
                  name="Finished Goods (u)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
          <h3 className="text-base font-semibold text-slate-100">
            Machine Utilization & WIP Queue Comparison
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Station utilization (%) vs {thresholds.utilizationWarningPct}% warning limit and current WIP buffer units
          </p>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stationComparisonData}
                margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="code" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d18',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <ReferenceLine
                  y={thresholds.utilizationWarningPct}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                />
                <Bar
                  dataKey="utilization"
                  name="Utilization (%)"
                  fill="#06b6d4"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="queueLength"
                  name="WIP Queue (units)"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Row 2: Cycle Time Trends + Utilization Over Time */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
          <h3 className="text-base font-semibold text-slate-100">
            Production Cycle Time Trends vs {thresholds.nominalTaktSeconds}s Takt
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Sequential simulated intervals · Stations above takt accumulate input WIP
          </p>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  domain={[34, 62]}
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <ReferenceLine
                  y={thresholds.nominalTaktSeconds}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                />
                <Line type="monotone" dataKey="cncCycle" name="CNC-01" stroke="#06b6d4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="asmCycle" name="ASM-02" stroke="#f59e0b" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="wldCycle" name="WLD-03" stroke="#f43f5e" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="qcCycle" name="QC-04" stroke="#a855f7" dot={false} strokeWidth={1.8} />
                <Line type="monotone" dataKey="pkgCycle" name="PKG-05" stroke="#10b981" dot={false} strokeWidth={1.8} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
          <h3 className="text-base font-semibold text-slate-100">
            Machine Utilization Over Time (%)
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Sequential telemetry across all 5 serial workstations
          </p>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  domain={[50, 100]}
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
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="cncUtil" name="CNC-01" stroke="#06b6d4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="asmUtil" name="ASM-02" stroke="#f59e0b" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="wldUtil" name="WLD-03" stroke="#f43f5e" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="qcUtil" name="QC-04" stroke="#38bdf8" dot={false} strokeWidth={1.8} />
                <Line type="monotone" dataKey="pkgUtil" name="PKG-05" stroke="#10b981" dot={false} strokeWidth={1.8} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Row 3: Downtime Analysis + Weighted Risk Distribution + OEE Efficiency Comparison */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-4">
          <h3 className="text-base font-semibold text-slate-100">Downtime Pareto Analysis</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Centralized cumulative stoppage minutes ({kpis.totalDowntimeMinutes.toFixed(1)}m total)
          </p>
          <div className="mt-4 space-y-3">
            {downtimePareto.map((dt) => (
              <div key={dt.station} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-200">
                    <strong className="font-mono text-cyan-400">{dt.station}</strong> · {dt.reason}
                  </span>
                  <span className="ml-2 font-mono text-slate-300 tabular-nums shrink-0">
                    {dt.minutes.toFixed(1)}m ({dt.sharePct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#090d18]">
                  <div
                    className="h-full bg-amber-500 origin-left transition-transform duration-300"
                    style={{ transform: `scaleX(${Math.min(1, dt.sharePct / 55)})` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-4">
          <h3 className="text-base font-semibold text-slate-100">
            Weighted Risk Score by Machine
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Relative risk score distribution (0–100 heuristic scale)
          </p>
          <div className="mt-3 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskDistributionData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {riskDistributionData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090d18',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-4">
          <h3 className="text-base font-semibold text-slate-100">
            OEE Pillar Comparison (A × P × Q)
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Availability, Performance, Quality, and Station OEE (%)
          </p>
          <div className="mt-3 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stationComparisonData}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="code" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
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
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="availability" name="Avail %" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="performance" name="Perf %" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                <Bar dataKey="oee" name="OEE %" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};
