import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { RiskClassification } from '../../types/factory';

export const BottleneckPredictionView: React.FC = () => {
  const { predictions, machines, telemetrySourceMode, applyMachineMitigation } = useFactory();
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);

  // Highest-risk machine is guaranteed to be predictions[0] (sorted descending by riskScore)
  const topConstraint = predictions[0];
  const inspected =
    predictions.find((p) => p.machineId === selectedMachineId) ?? topConstraint;
  const inspectedMachine = machines.find((m) => m.id === inspected?.machineId);

  const tierTextColor = (tier: RiskClassification) => {
    switch (tier) {
      case 'CRITICAL':
        return 'text-rose-400';
      case 'HIGH':
        return 'text-amber-400';
      case 'MODERATE':
        return 'text-sky-400';
      default:
        return 'text-emerald-400';
    }
  };

  if (!topConstraint || !inspected) return null;

  return (
    <div className="space-y-6">
      {/* Architecture & Model Transparency Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1e293b] bg-[#0f1626] px-5 py-3.5">
        <div className="flex items-start gap-2.5 text-xs text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <div>
            <span className="font-semibold text-slate-100">
              Methodology: Deterministic Weighted Risk-Scoring Engine ({telemetrySourceMode} Telemetry)
            </span>{' '}
            · Outputs heuristic risk scores (0–100) from normalized sensor thresholds—not statistical probabilities from a trained ML model. Architecture exposes clean feature vectors for future ML drop-in.
          </div>
        </div>
        <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
          0–29 LOW · 30–49 MODERATE · 50–69 HIGH · 70–100 CRITICAL
        </span>
      </div>

      {/* Highest-Risk Primary Bottleneck Spotlight */}
      <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1e293b] pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldAlert
                className={`h-4 w-4 ${tierTextColor(topConstraint.classification)}`}
              />
              <span>Rank #1 Predicted Bottleneck Workstation</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-cyan-400">{topConstraint.machineCode}</span>
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-100">
              {topConstraint.machineName}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs text-slate-400">Weighted Risk Score</div>
              <div
                className={`font-mono text-3xl font-bold tabular-nums ${tierTextColor(
                  topConstraint.classification
                )}`}
              >
                {topConstraint.riskScore}
                <span className="text-base font-normal text-slate-400"> / 100</span>
              </div>
            </div>

            <div className="border-l border-[#1e293b] pl-5">
              <div className="text-xs text-slate-400">Risk Classification</div>
              <div
                className={`font-mono text-lg font-bold ${tierTextColor(
                  topConstraint.classification
                )}`}
              >
                {topConstraint.classification}
              </div>
            </div>

            <div className="border-l border-[#1e293b] pl-5">
              <div className="text-xs text-slate-400">Projected Schedule Delay</div>
              <div className="flex items-center gap-1.5 font-mono text-lg font-bold text-slate-100 tabular-nums">
                <Clock className="h-4 w-4 text-amber-400" />
                <span>{topConstraint.predictedDelayMinutes} min</span>
              </div>
            </div>

            <div className="border-l border-[#1e293b] pl-5">
              <div className="text-xs text-slate-400">Est. Units Delayed</div>
              <div className="font-mono text-lg font-bold text-slate-100 tabular-nums">
                ~{topConstraint.estimatedLostUnits} units
              </div>
            </div>
          </div>
        </div>

        {/* Root-Cause Engineering Diagnosis & Actions */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Root-Cause Engineering Diagnosis (Contributing Factors)
            </h3>
            <p className="text-sm leading-relaxed text-slate-300">
              {topConstraint.narrativeDiagnosis}
            </p>

            <div className="pt-1">
              <div className="text-xs font-medium text-slate-400">
                Top Weighted Contributors
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-200">
                {topConstraint.primaryFactors.map((factor, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span className="font-mono">{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-between rounded-lg border border-[#1e293b] bg-[#090d18] p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Recommended Preventive Actions
              </h3>
              <ul className="mt-3 space-y-2 text-xs text-slate-300">
                {topConstraint.recommendedActions.map((act, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1e293b] flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Rebalance {topConstraint.machineCode} with mass conservation
              </span>
              <button
                type="button"
                onClick={() => applyMachineMitigation(topConstraint.machineId)}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Execute Mitigation</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Ranked Fleet Risk Comparison + Detailed Weighted Formula Table */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left: Ranked Machine Risk Selector */}
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-5">
          <h2 className="text-base font-semibold text-slate-100">
            Workstations Ranked by Risk Score
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Sorted descending (0–100 scale) · Select any workstation to inspect its parameter weights
          </p>

          <div className="mt-4 space-y-2.5">
            {predictions.map((pred, index) => {
              const isSelected = pred.machineId === inspected.machineId;
              return (
                <button
                  key={pred.machineId}
                  type="button"
                  onClick={() => setSelectedMachineId(pred.machineId)}
                  className={`flex w-full flex-col rounded-lg border p-3.5 text-left transition-colors ${
                    isSelected
                      ? 'border-cyan-500/50 bg-[#090d18]'
                      : 'border-[#1e293b] bg-[#090d18]/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">
                      #{index + 1} · {pred.machineName} ({pred.machineCode})
                    </span>
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${tierTextColor(
                        pred.classification
                      )}`}
                    >
                      {pred.riskScore}/100 · {pred.classification}
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-transform duration-300 origin-left ${
                        pred.classification === 'CRITICAL'
                          ? 'bg-rose-500'
                          : pred.classification === 'HIGH'
                          ? 'bg-amber-500'
                          : pred.classification === 'MODERATE'
                          ? 'bg-sky-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ transform: `scaleX(${pred.riskScore / 100})` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate">{pred.primaryFactors[0]}</span>
                    <span className="font-mono tabular-nums shrink-0 ml-2">
                      Delay {pred.predictedDelayMinutes}m
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: 6-Parameter Normalized Weighting Table */}
        <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Weighted Score Breakdown: {inspected.machineName}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Score = (Util × 0.25) + (Queue × 0.25) + (Cycle × 0.20) + (Downtime × 0.15) +
                (Defect × 0.10) + (Temp × 0.05)
              </p>
            </div>
            {inspectedMachine && (
              <span className="font-mono text-xs text-slate-300 tabular-nums">
                Good {inspectedMachine.unitsGood}u · Reject {inspectedMachine.unitsRejected}u · WIP{' '}
                {inspectedMachine.queueLength}u
              </span>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1e293b] text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Simulated Parameter</th>
                  <th className="px-3 py-2.5 text-right font-medium">Current Value</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ref Threshold</th>
                  <th className="px-3 py-2.5 text-right font-medium">Norm Score (0–100)</th>
                  <th className="px-3 py-2.5 text-right font-medium">Weight</th>
                  <th className="py-2.5 pl-3 text-right font-medium">Weighted Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]/70">
                {inspected.parameterBreakdown.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-3 font-medium text-slate-200">{row.label}</td>
                    <td className="px-3 py-3 text-right font-mono text-slate-200 tabular-nums">
                      {row.rawValue} {row.unit}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-400">
                      {row.thresholdLabel}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          row.normalizedScore >= 70
                            ? 'font-semibold text-rose-400'
                            : row.normalizedScore >= 50
                            ? 'font-semibold text-amber-400'
                            : 'text-slate-200'
                        }
                      >
                        {row.normalizedScore.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-400 tabular-nums">
                      {(row.weight * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 pl-3 text-right font-mono font-semibold text-cyan-300 tabular-nums">
                      +{row.weightedContribution.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#1e293b] font-semibold text-slate-100">
                  <td colSpan={4} className="pt-3 text-xs">
                    Total Weighted Bottleneck Risk Score ({inspected.classification})
                  </td>
                  <td className="pt-3 px-3 text-right font-mono text-xs text-slate-400">100%</td>
                  <td
                    className={`pt-3 pl-3 text-right font-mono text-sm tabular-nums ${tierTextColor(
                      inspected.classification
                    )}`}
                  >
                    {inspected.riskScore} / 100
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
