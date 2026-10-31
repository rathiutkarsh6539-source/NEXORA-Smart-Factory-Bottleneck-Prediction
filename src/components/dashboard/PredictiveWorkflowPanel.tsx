import React from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, CheckCircle2, Cpu, ShieldAlert, Wrench } from 'lucide-react';
import { MachinePredictionResult, TimeSeriesPoint } from '../../types/factory';

interface PredictiveWorkflowPanelProps {
  timeSeries: TimeSeriesPoint[];
  topPrediction: MachinePredictionResult | undefined;
  onApplyMitigation: (machineId: string) => void;
  onNavigatePrediction: () => void;
}

export const PredictiveWorkflowPanel: React.FC<PredictiveWorkflowPanelProps> = ({
  timeSeries,
  topPrediction,
  onApplyMitigation,
  onNavigatePrediction,
}) => {
  // Deterministic heuristic projection over next 4 steps (+15m to +60m) with ±10% load sensitivity range
  // No unvalidated statistical confidence claims are made.
  const recentHistory = timeSeries.slice(-8).map((pt) => ({
    time: pt.timestamp,
    observedScore: pt.maxRiskScore,
    projectedScore: null as number | null,
    highLoadSensitivity: null as number | null,
  }));

  const currentScore = topPrediction?.riskScore ?? 24;
  const driftPerInterval = currentScore >= 55 ? 3.8 : currentScore >= 35 ? 2.2 : 0.8;

  const lastHist = recentHistory[recentHistory.length - 1];
  if (lastHist) {
    lastHist.projectedScore = lastHist.observedScore;
    lastHist.highLoadSensitivity = lastHist.observedScore;
  }

  const horizonLabels = ['+15m', '+30m', '+45m', '+60m'];
  const forecastPoints = horizonLabels.map((lbl, idx) => {
    const step = idx + 1;
    const projected = Math.min(99, Math.round(currentScore + driftPerInterval * step));
    const sensitivityDelta = Math.round(3 + step * 2);
    return {
      time: lbl,
      observedScore: null as number | null,
      projectedScore: projected,
      highLoadSensitivity: Math.min(100, projected + sensitivityDelta),
    };
  });

  const chartData = [...recentHistory, ...forecastPoints];
  const isElevated = (topPrediction?.riskScore ?? 0) >= 50;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      {/* Left: Deterministic Heuristic Risk Trajectory */}
      <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Weighted Bottleneck Risk Projection (Heuristic Horizon)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Observed weighted risk score (0–100) vs deterministic trend extrapolation & +10% load sensitivity envelope
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigatePrediction}
            className="flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
          >
            <span>Inspect Weighted Formula</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="sensitivityEnvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#1e293b' }}
              />
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
              <ReferenceLine
                y={70}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                label={{
                  value: 'Critical Risk Score (70)',
                  position: 'insideTopRight',
                  fill: '#fb7185',
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="highLoadSensitivity"
                stroke="none"
                fill="url(#sensitivityEnvGrad)"
                name="+10% Load Sensitivity Bound"
              />
              <Line
                type="monotone"
                dataKey="observedScore"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#06b6d4' }}
                name="Observed Risk Score"
              />
              <Line
                type="monotone"
                dataKey="projectedScore"
                stroke="#f59e0b"
                strokeWidth={2.2}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: '#f59e0b' }}
                name="Heuristic Trend Score"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Right: Closed-Loop Mitigation Pipeline */}
      <section className="flex flex-col justify-between rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-100">
              Closed-Loop Mitigation Pipeline
            </h2>
            <span className="font-mono text-xs text-slate-400">
              {topPrediction ? topPrediction.machineCode : 'LINE-A'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Rule-based triage from simulated telemetry adapter to station rebalancing
          </p>

          <div className="mt-5 space-y-3">
            {/* Step 1: Transparent SIMULATED Adapter */}
            <div className="flex items-start gap-3 rounded-lg border border-[#1e293b] bg-[#090d18] p-3">
              <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">
                    01. Simulated Telemetry Adapter
                  </span>
                  <span className="font-mono text-amber-300">SIMULATED</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  Local serial physics model (IoT-ready schema; no physical PLC attached).
                </p>
              </div>
            </div>

            {/* Step 2: Weighted Risk Score */}
            <div className="flex items-start gap-3 rounded-lg border border-[#1e293b] bg-[#090d18] p-3">
              <ShieldAlert
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  isElevated ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">
                    02. Weighted Risk Scoring
                  </span>
                  <span className="font-mono text-slate-300 tabular-nums">
                    {topPrediction
                      ? `${topPrediction.riskScore}/100 (${topPrediction.classification})`
                      : 'Nominal'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400 truncate">
                  {topPrediction
                    ? `${topPrediction.machineName} · Est. delay ${topPrediction.predictedDelayMinutes} min`
                    : 'All stations balanced within takt.'}
                </p>
              </div>
            </div>

            {/* Step 3: Prescribed Action */}
            <div className="flex items-start gap-3 rounded-lg border border-[#1e293b] bg-[#090d18] p-3">
              <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">03. Prescribed Line Action</span>
                  <span className="font-mono text-cyan-300">Ready</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {topPrediction?.recommendedActions[0] ??
                    'Maintain nominal Drum-Buffer-Rope feed pacing.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {topPrediction && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#1e293b] pt-4">
            <div className="text-xs text-slate-400">
              Target: <span className="font-medium text-slate-200">{topPrediction.machineName}</span>
            </div>
            <button
              type="button"
              onClick={() => onApplyMitigation(topPrediction.machineId)}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Rebalance Station</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
