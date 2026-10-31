import React, { useMemo } from 'react';
import { CheckCircle2, Lightbulb, Wrench } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { SmartRecommendation } from '../../types/factory';

export const RecommendationsView: React.FC = () => {
  const { machines, predictions, applyMachineMitigation, appliedRecommendationIds } = useFactory();

  const recommendations: SmartRecommendation[] = useMemo(() => {
    const items: SmartRecommendation[] = [];

    const cnc = machines.find((m) => m.id === 'CNC-01')!;
    const asm = machines.find((m) => m.id === 'ASM-02')!;
    const wld = machines.find((m) => m.id === 'WLD-03')!;
    const qc = machines.find((m) => m.id === 'QC-04')!;
    const pkg = machines.find((m) => m.id === 'PKG-05')!;

    const getPred = (id: string) => predictions.find((p) => p.machineId === id);

    // 1. CNC Overload Detection
    if (cnc.utilization >= 88 || cnc.queueLength >= 22 || (getPred('CNC-01')?.riskScore ?? 0) >= 48) {
      const recId = 'REC-CNC-OVERLOAD';
      items.push({
        id: recId,
        machineId: 'CNC-01',
        machineName: cnc.name,
        problemCategory: 'CNC Overload & Spindle Takt Dilation',
        priority: (getPred('CNC-01')?.riskScore ?? 0) >= 70 ? 'Immediate' : 'High',
        title: 'Redistribute Secondary Milling Batches & Throttle Raw Billet Infeed',
        detectedCondition: `CNC-01 utilization at ${cnc.utilization.toFixed(1)}%, cycle time ${cnc.cycleTime.toFixed(1)}s, input queue ${cnc.queueLength}/${cnc.bufferCapacity} units.`,
        actionPlan: [
          'Route non-critical roughing sub-lots to parallel CNC turning bay.',
          'Regulate raw billet feeder release interval to match 42.0s nominal line takt.',
          'Replace worn carbide insert set at next lot changeover to recover spindle feed speed.',
        ],
        expectedOperationalBenefit:
          'Stabilizes CNC-01 duty cycle near ~80%, drains upstream billet queue, and restores steady part arrival to Assembly.',
        impactMetrics: 'Targets cycle recovery toward 41.6s–42.0s takt',
        applied: appliedRecommendationIds.includes(recId),
        mitigationAction: () => applyMachineMitigation('CNC-01', recId),
      });
    }

    // 2. Assembly Delay Detection
    if (asm.cycleTime >= 45 || asm.queueLength >= 20 || (getPred('ASM-02')?.riskScore ?? 0) >= 48) {
      const recId = 'REC-ASM-DELAY';
      items.push({
        id: recId,
        machineId: 'ASM-02',
        machineName: asm.name,
        problemCategory: 'Assembly Station Queue Accumulation',
        priority: (getPred('ASM-02')?.riskScore ?? 0) >= 70 ? 'Immediate' : 'High',
        title: 'Assign Floater Technician & Re-sequence Fastener Kitting Trays',
        detectedCondition: `ASM-02 cycle time dilated to ${asm.cycleTime.toFixed(1)}s with ${asm.queueLength} units waiting in buffer.`,
        actionPlan: [
          'Dispatch cross-trained Hall 4 floater technician to assist manual sub-assembly kitting.',
          'Clear M6 bowl-feeder orientation rail micro-stops and pre-stage sub-kits.',
          'Unblock upstream CNC-01 outfeed conveyor once Assembly buffer drops below 16 units.',
        ],
        expectedOperationalBenefit:
          'Eliminates upstream blocking on CNC-01 and restores downstream material feed to Laser Welding.',
        impactMetrics: 'Drains excess WIP buffer and aligns station pace to 42s takt',
        applied: appliedRecommendationIds.includes(recId),
        mitigationAction: () => applyMachineMitigation('ASM-02', recId),
      });
    }

    // 3. Welding Failure / Thermal Alarm Detection
    if (
      wld.temperature >= wld.tempWarningLimit - 4 ||
      wld.downtime >= 22 ||
      (getPred('WLD-03')?.riskScore ?? 0) >= 48
    ) {
      const recId = 'REC-WLD-THERMAL';
      items.push({
        id: recId,
        machineId: 'WLD-03',
        machineName: wld.name,
        problemCategory: 'Welding Thermal Stress & Downtime Escalation',
        priority: wld.temperature >= wld.tempCriticalLimit ? 'Immediate' : 'High',
        title: 'Engage Auxiliary Chiller Loop, Dress Electrode Tip & Reroute Tack Sub-Lots',
        detectedCondition: `WLD-03 operating at ${wld.temperature.toFixed(1)}°C with ${wld.downtime.toFixed(0)} min shift downtime and ${wld.defectRate.toFixed(2)}% scrap.`,
        actionPlan: [
          'Boost closed-loop glycol coolant flow to bring weld head below 64°C threshold.',
          'Perform rapid copper electrode tip dressing and optical lens check.',
          'Temporarily divert secondary bracket weldments to backup cell during maintenance check.',
        ],
        expectedOperationalBenefit:
          'Prevents thermal safety trip, lowers weld spatter defect rate, and restores part supply to Quality Inspection.',
        impactMetrics: 'Reduces thermal envelope below warning ceiling (<74°C)',
        applied: appliedRecommendationIds.includes(recId),
        mitigationAction: () => applyMachineMitigation('WLD-03', recId),
      });
    }

    // 4. Quality Inspection Overload Detection
    if (qc.queueLength >= 18 || qc.defectRate >= 2.2 || (getPred('QC-04')?.riskScore ?? 0) >= 48) {
      const recId = 'REC-QC-OVERLOAD';
      items.push({
        id: recId,
        machineId: 'QC-04',
        machineName: qc.name,
        problemCategory: 'Quality Metrology Backlog',
        priority: (getPred('QC-04')?.riskScore ?? 0) >= 70 ? 'Immediate' : 'High',
        title: 'Activate Secondary Optical Inspection (AOI) Lane & Isolate Upstream Drift',
        detectedCondition: `QC-04 queue at ${qc.queueLength}/${qc.bufferCapacity} units with ${qc.defectRate.toFixed(2)}% detected scrap.`,
        actionPlan: [
          'Bring parallel camera metrology lane online to split 100% dimensional scan load.',
          'Apply ISO 2859 AQL skip-lot sampling on verified stable CNC features.',
          'Feed dimensional offset telemetry back to upstream Welding & CNC controllers.',
        ],
        expectedOperationalBenefit:
          'Increases inspection throughput capacity without compromising outgoing quality compliance.',
        impactMetrics: 'Relieves WLD-03 outfeed congestion and feeds Packaging steadily',
        applied: appliedRecommendationIds.includes(recId),
        mitigationAction: () => applyMachineMitigation('QC-04', recId),
      });
    }

    // 5. Packaging Bottleneck Detection
    if (pkg.cycleTime >= 45 || pkg.queueLength >= 18 || (getPred('PKG-05')?.riskScore ?? 0) >= 48) {
      const recId = 'REC-PKG-BOTTLENECK';
      items.push({
        id: recId,
        machineId: 'PKG-05',
        machineName: pkg.name,
        problemCategory: 'End-of-Line Packaging Bottleneck',
        priority: (getPred('PKG-05')?.riskScore ?? 0) >= 70 ? 'Immediate' : 'High',
        title: 'Enable Dual-Carton Feed Lane & Re-calibrate Heat-Sealer Dwell Timing',
        detectedCondition: `PKG-05 cycle slowed to ${pkg.cycleTime.toFixed(1)}s with ${pkg.queueLength} finished units awaiting carton sealing.`,
        actionPlan: [
          'Activate dual-carton erector magazine to raise end-of-line sealing throughput.',
          'Verify film tensioner rollers and heat-seal bar dwell timer.',
          'Pre-position AGV pallet totes at dock intake to prevent discharge conveyor pauses.',
        ],
        expectedOperationalBenefit:
          'Directly accelerates finished goods warehouse dispatch and clears QC-04 outfeed queue.',
        impactMetrics: 'Restores end-of-line discharge pace above 85 units/hr',
        applied: appliedRecommendationIds.includes(recId),
        mitigationAction: () => applyMachineMitigation('PKG-05', recId),
      });
    }

    // Always include Preventive Drum-Buffer-Rope Optimization Cards so nominal state still offers engineering value
    items.push({
      id: 'REC-PREVENTIVE-DBR',
      machineId: wld.id,
      machineName: 'Line A Synchronized Pacing (All 5 Cells)',
      problemCategory: 'Preventive Drum-Buffer-Rope Optimization',
      priority: 'Preventive',
      title: 'Synchronize Conveyor Rope Release to Highest-Load Constraint Takt',
      detectedCondition: `Fleet average utilization at ${(
        machines.reduce((a, b) => a + b.utilization, 0) / machines.length
      ).toFixed(1)}% across Line A.`,
      actionPlan: [
        'Tie raw material release trigger directly to primary constraint buffer consumption.',
        'Schedule staggered 4-minute preventive lubrication checks during planned shift handover.',
      ],
      expectedOperationalBenefit:
        'Maintains lean WIP inventory across conveyors while preserving protective buffer ahead of the drum station.',
      impactMetrics: 'Sustains balanced OEE pillars without excess floor WIP',
      applied: appliedRecommendationIds.includes('REC-PREVENTIVE-DBR'),
      mitigationAction: () => applyMachineMitigation(wld.id, 'REC-PREVENTIVE-DBR'),
    });

    return items;
  }, [machines, predictions, appliedRecommendationIds, applyMachineMitigation]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 text-cyan-400 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Condition-Driven Operational Recommendations
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Generated dynamically from live workstation utilization, queue occupancy, cycle dilation, and thermal telemetry · Expected operational benefits reflect physical process balancing without fabricated financial guarantees.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {recommendations.map((rec) => (
          <article
            key={rec.id}
            className={`flex flex-col justify-between rounded-xl border bg-[#0f1626] p-5 ${
              rec.priority === 'Immediate'
                ? 'border-rose-500/50'
                : rec.priority === 'High'
                ? 'border-amber-500/45'
                : 'border-[#1e293b]'
            }`}
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  <strong className="font-mono text-cyan-400">{rec.machineId}</strong> ·{' '}
                  {rec.problemCategory}
                </span>
                <span
                  className={`font-mono font-semibold ${
                    rec.priority === 'Immediate'
                      ? 'text-rose-400'
                      : rec.priority === 'High'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  Priority: {rec.priority}
                </span>
              </div>

              <h3 className="mt-2 text-base font-semibold text-slate-100">{rec.title}</h3>

              <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#090d18] p-3 text-xs text-slate-300">
                <span className="font-medium text-slate-400">Detected Condition: </span>
                {rec.detectedCondition}
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-slate-200">Prescribed Action Plan</div>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                  {rec.actionPlan.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono text-cyan-400">0{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 border-t border-[#1e293b] pt-3 text-xs">
                <div className="text-slate-400">
                  <strong className="text-slate-200">Expected Operational Benefit: </strong>
                  {rec.expectedOperationalBenefit}
                </div>
                <div className="mt-1 font-mono text-[11px] text-cyan-300">
                  Process Target: {rec.impactMetrics}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[#1e293b] pt-4">
              {rec.applied ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Mitigation Applied to Live Line
                </span>
              ) : (
                <span className="text-xs text-slate-400">
                  Ready for floor execution on {rec.machineId}
                </span>
              )}

              <button
                type="button"
                onClick={rec.mitigationAction}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Apply Recommended Mitigation</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
