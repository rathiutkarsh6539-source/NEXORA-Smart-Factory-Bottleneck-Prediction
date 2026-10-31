import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Box,
  CheckCircle2,
  Cpu,
  Layers,
  PackageCheck,
  Users,
  Wind,
  Zap,
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
import { SimulationScenarioId } from '../../types/factory';

export const ProductionWorkflowView: React.FC = () => {
  const {
    machines,
    predictions,
    kpis,
    scenario,
    selectScenario,
    isRunning,
    timeSeries,
    telemetrySourceMode,
    applyMachineMitigation,
  } = useFactory();

  const [topologyMode, setTopologyMode] = useState<'pipeline' | 'isometric'>('pipeline');

  const orderedMachines = [...machines].sort((a, b) => a.stageOrder - b.stageOrder);
  const totalPowerKw = orderedMachines.reduce((acc, m) => acc + m.powerKw, 0);
  const totalOperators = orderedMachines.reduce((acc, m) => acc + m.operatorCount, 0);

  // Full 7-stage pipeline with exact unit flow conservation:
  // Raw Material Released -> CNC-01 -> ASM-02 -> WLD-03 -> QC-04 -> PKG-05 -> Finished Goods
  // Note: stage[i+1].unitsEntered === stage[i].unitsGood!
  const stages = [
    {
      id: 'RAW-00',
      stageNum: 1,
      name: 'Raw Material Staging',
      code: 'INFEED',
      status: 'Normal' as const,
      unitsEntered: kpis.rawMaterialReleased + 24,
      unitsProcessed: kpis.rawMaterialReleased,
      unitsGood: kpis.rawMaterialReleased,
      unitsRejected: 0,
      unitsWaiting: 24,
      efficiency: 100.0,
      riskScore: 6,
      isMachine: false,
      note: 'Released into CNC-01 buffer',
    },
    ...orderedMachines.map((m, idx) => {
      const pred = predictions.find((p) => p.machineId === m.id);
      return {
        id: m.id,
        stageNum: idx + 2,
        name: m.shortName,
        code: m.code,
        status: m.status,
        unitsEntered: m.unitsEntered,
        unitsProcessed: m.unitsProcessed,
        unitsGood: m.unitsGood,
        unitsRejected: m.unitsRejected,
        unitsWaiting: m.queueLength,
        efficiency: m.oee,
        riskScore: pred?.riskScore ?? 20,
        isMachine: true,
        isBlocked: m.isBlocked,
        isStarved: m.isStarved,
        cycleTime: m.cycleTime,
        bufferCapacity: m.bufferCapacity,
        note: m.isBlocked
          ? 'Outfeed blocked by downstream queue'
          : m.isStarved
          ? 'Starved by upstream delay'
          : `State: ${m.operatingState} · ${m.cycleTime.toFixed(1)}s`,
      };
    }),
    {
      id: 'FIN-06',
      stageNum: 7,
      name: 'Finished Goods',
      code: 'DISPATCH',
      status:
        scenario === 'packaging_bottleneck' ? ('Warning' as const) : ('Normal' as const),
      unitsEntered: kpis.finishedGoodsDispatched,
      unitsProcessed: kpis.finishedGoodsDispatched,
      unitsGood: kpis.finishedGoodsDispatched,
      unitsRejected: 0,
      unitsWaiting: 0,
      efficiency: 100.0,
      riskScore: scenario === 'packaging_bottleneck' ? 35 : 5,
      isMachine: false,
      note: 'Verified conforming output',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Scenario Stress-Test Selector & View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            7-Stage Serial Production Pipeline ({telemetrySourceMode})
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Exact unit conservation: Raw Released ({kpis.rawMaterialReleased}u) = Total WIP (
            {kpis.totalWipInSystem}u) + Total Rejected ({kpis.totalRejectedAllStages}u) + Finished
            Goods ({kpis.finishedGoodsDispatched}u)
          </p>
        </div>

        {/* View Mode Switch */}
        <div className="flex items-center gap-1 rounded-lg border border-[#1e293b] bg-[#090d18] p-1">
          <button
            type="button"
            onClick={() => setTopologyMode('pipeline')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              topologyMode === 'pipeline'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Top Pipeline View</span>
          </button>
          <button
            type="button"
            onClick={() => setTopologyMode('isometric')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              topologyMode === 'isometric'
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="h-3.5 w-3.5" />
            <span>3D Isometric View</span>
          </button>
        </div>
      </div>

      {/* Quick Scenario Stress-Test Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(SCENARIO_DEFINITIONS) as SimulationScenarioId[]).map((scKey) => {
          const def = SCENARIO_DEFINITIONS[scKey];
          const active = scenario === scKey;
          return (
            <button
              key={scKey}
              type="button"
              onClick={() => selectScenario(scKey)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                  : 'border-[#1e293b] bg-[#0f1626] text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {def.label}
            </button>
          );
        })}
      </div>

      {/* Main Pipeline Visualization */}
      {topologyMode === 'pipeline' ? (
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            {stages.map((st, idx) => {
              const isCrit = st.status === 'Critical';
              const isWarn = st.status === 'Warning';

              return (
                <div key={st.id} className="relative flex flex-col justify-between">
                  <div
                    className={`flex h-full flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                      isCrit
                        ? 'border-rose-500/70 bg-rose-950/20'
                        : isWarn
                        ? 'border-amber-500/60 bg-amber-950/15'
                        : 'border-[#1e293b] bg-[#090d18]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono">
                          0{st.stageNum} · {st.code}
                        </span>
                        <span
                          className={`font-semibold ${
                            isCrit
                              ? 'text-rose-400'
                              : isWarn
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {st.status}
                        </span>
                      </div>

                      <h3 className="mt-1.5 text-sm font-semibold text-slate-100">{st.name}</h3>

                      <div className="mt-3 space-y-1.5 border-t border-[#1e293b] pt-2.5 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Entered</span>
                          <span className="font-mono text-slate-200 tabular-nums">
                            {st.unitsEntered}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Processed</span>
                          <span className="font-mono text-slate-200 tabular-nums">
                            {st.unitsProcessed}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Good Out</span>
                          <span className="font-mono text-emerald-400 tabular-nums">
                            {st.unitsGood}
                          </span>
                        </div>
                        {st.isMachine && (
                          <div className="flex justify-between text-slate-400">
                            <span>Rejected</span>
                            <span className="font-mono text-rose-400 tabular-nums">
                              {st.unitsRejected}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-400">
                          <span>WIP Queue</span>
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              isCrit
                                ? 'text-rose-400'
                                : isWarn
                                ? 'text-amber-400'
                                : 'text-cyan-300'
                            }`}
                          >
                            {st.unitsWaiting} u
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>{st.isMachine ? 'OEE' : 'Yield'}</span>
                          <span className="font-mono text-cyan-300 tabular-nums">
                            {st.efficiency.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-[#1e293b] pt-2">
                      <p className="text-[11px] text-slate-400 leading-snug">{st.note}</p>
                      {st.isMachine && (isCrit || isWarn) && (
                        <button
                          type="button"
                          onClick={() => applyMachineMitigation(st.id)}
                          className="mt-2 w-full rounded bg-cyan-500/20 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/30"
                        >
                          Clear Constraint
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Animated Material Conveyor Link to Next Stage */}
                  {idx < stages.length - 1 && (
                    <div
                      aria-hidden="true"
                      className="my-2 flex items-center justify-center lg:my-0 lg:mt-2"
                    >
                      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        {isRunning && (
                          <div
                            className={`h-full w-1/3 rounded-full animate-conveyor-pulse ${
                              isCrit
                                ? 'bg-rose-400'
                                : isWarn
                                ? 'bg-amber-400'
                                : 'bg-cyan-400'
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        /* 3D Isometric Spatial Topology SVG View */
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Isometric Line A Spatial Topology (Simulated Floor Layout)
            </h3>
            <span className="text-xs text-slate-400">
              Click an overloaded cell node to rebalance station parameters
            </span>
          </div>

          <div className="w-full overflow-x-auto rounded-lg border border-[#1e293b] bg-[#090d18] p-4">
            <svg
              viewBox="0 0 980 340"
              className="mx-auto h-72 min-w-[780px] w-full select-none"
              role="img"
              aria-label="3D Isometric Factory Production Floor Map"
            >
              <defs>
                <pattern id="isoGrid" width="40" height="24" patternUnits="userSpaceOnUse">
                  <path
                    d="M 20 0 L 40 12 L 20 24 L 0 12 Z"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="0.7"
                  />
                </pattern>
              </defs>
              <rect width="980" height="340" fill="url(#isoGrid)" opacity="0.65" />

              <path
                d="M 85 185 L 895 185"
                stroke="#1e293b"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 85 185 L 895 185"
                stroke="#06b6d4"
                strokeWidth="2.5"
                strokeDasharray="10 8"
                opacity={isRunning ? 0.85 : 0.3}
              />

              {stages.map((st, index) => {
                const cx = 85 + index * 135;
                const cy = 185;
                const strokeColor =
                  st.status === 'Critical'
                    ? '#f43f5e'
                    : st.status === 'Warning'
                    ? '#f59e0b'
                    : '#10b981';
                const topFill =
                  st.status === 'Critical'
                    ? '#4c0519'
                    : st.status === 'Warning'
                    ? '#451a03'
                    : '#0f172a';

                return (
                  <g
                    key={st.id}
                    transform={`translate(${cx}, ${cy})`}
                    onClick={() => st.isMachine && applyMachineMitigation(st.id)}
                    className={st.isMachine ? 'cursor-pointer' : ''}
                  >
                    <polygon
                      points="0,-42 46,-18 0,6 -46,-18"
                      fill={topFill}
                      stroke={strokeColor}
                      strokeWidth="2"
                    />
                    <polygon
                      points="-46,-18 0,6 0,36 -46,12"
                      fill="#0b1324"
                      stroke={strokeColor}
                      strokeWidth="1.5"
                    />
                    <polygon
                      points="46,-18 0,6 0,36 46,12"
                      fill="#111c33"
                      stroke={strokeColor}
                      strokeWidth="1.5"
                    />

                    <text
                      x="0"
                      y="-15"
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                    >
                      {st.code}
                    </text>

                    <text
                      x="0"
                      y="58"
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {st.name}
                    </text>
                    <text
                      x="0"
                      y="75"
                      textAnchor="middle"
                      fill={strokeColor}
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      Good: {st.unitsGood}u · WIP: {st.unitsWaiting}u
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>
      )}

      {/* Bottom Row: Simulated Line Data Overview + Work Flow Velocity Stream */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-5">
          <h3 className="text-base font-semibold text-slate-100">
            Simulated Line Parameters Overview
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Modeled shift elapsed runtime, utilities, staffing, and exact mass balance check
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3.5">
            <div className="rounded-lg border border-[#1e293b] bg-[#090d18] p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Planned Shift Elapsed</span>
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="mt-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                {(orderedMachines[0]?.plannedTimeMinutes ?? 320).toFixed(1)} min
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Of 480m simulated Shift 1</div>
            </div>

            <div className="rounded-lg border border-[#1e293b] bg-[#090d18] p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Modeled Pneumatics</span>
                <Wind className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="mt-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                6.4 bar
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Simulated manifold pressure</div>
            </div>

            <div className="rounded-lg border border-[#1e293b] bg-[#090d18] p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Assigned Operators</span>
                <Users className="h-3.5 w-3.5 text-sky-400" />
              </div>
              <div className="mt-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                {totalOperators} / 30
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">6 floaters available</div>
            </div>

            <div className="rounded-lg border border-[#1e293b] bg-[#090d18] p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Modeled Power Load</span>
                <Zap className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="mt-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                {totalPowerKw.toFixed(1)} kW
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Sum of 5 simulated cells</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#1e293b] pt-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <PackageCheck className="h-4 w-4 text-emerald-400" />
              Mass Balance:{' '}
              <strong className="font-mono text-emerald-300">
                {kpis.massBalanceConserved ? 'Verified Exact' : 'Adjusted'}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              {kpis.maxBottleneckRisk >= 50 ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="text-amber-300">
                    Constraint Active ({kpis.primaryBottleneckId})
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">Synchronized Flow</span>
                </>
              )}
            </span>
          </div>
        </section>

        {/* Work Flow Velocity Time Curve Stream */}
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Packaging Discharge Velocity Stream (Units / Hour)
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Sequential simulation intervals showing end-of-line finished goods rate
              </p>
            </div>
            <Cpu className="h-4 w-4 text-emerald-400" />
          </div>

          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="velocityStreamGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  domain={[0, 105]}
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
                  dataKey="velocityUph"
                  name="Discharge Velocity (u/hr)"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#velocityStreamGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
};
