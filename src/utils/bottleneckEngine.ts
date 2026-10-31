import {
  FactoryKPIs,
  FactoryThresholds,
  MachineOperationalStatus,
  MachinePredictionResult,
  MachineTelemetry,
  ParameterScoreDetail,
  RiskClassification,
} from '../types/factory';

export function safeNumber(val: unknown, fallback = 0): number {
  const parsed = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export function clamp(value: number, min: number, max: number): number {
  const safe = safeNumber(value, min);
  return Math.min(max, Math.max(min, safe));
}

export function classifyRiskScore(score: number): RiskClassification {
  const s = clamp(Math.round(score), 0, 100);
  if (s >= 70) return 'CRITICAL';
  if (s >= 50) return 'HIGH';
  if (s >= 30) return 'MODERATE';
  return 'LOW';
}

/**
 * Standard Industrial OEE Calculation:
 * - Availability (%) = ((Planned Production Time - Downtime) / Planned Production Time) * 100
 * - Performance  (%) = min(100, (Ideal Cycle Time / Actual Cycle Time) * 100)
 * - Quality      (%) = (Good Units / Total Units Processed) * 100  (or 100 - DefectRate% if 0 processed)
 * - OEE          (%) = (Availability / 100) * (Performance / 100) * (Quality / 100) * 100
 *
 * Note: OEE is computed directly from the rounded 1-decimal pillar values so that
 * Availability × Performance × Quality matches the displayed OEE without rounding drift.
 */
export function computeMachineOEE(params: {
  downtimeMinutes: number;
  plannedTimeMinutes: number;
  actualCycleTime: number;
  targetCycleTime: number;
  unitsGood?: number;
  unitsProcessed?: number;
  defectRatePct?: number;
}): {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
} {
  const planned = Math.max(30, safeNumber(params.plannedTimeMinutes, 320));
  const downtime = clamp(safeNumber(params.downtimeMinutes, 0), 0, planned * 0.95);
  const actualCycle = Math.max(5, safeNumber(params.actualCycleTime, 42));
  const idealCycle = Math.max(5, safeNumber(params.targetCycleTime, 42));

  const rawAvailability = clamp(((planned - downtime) / planned) * 100, 0, 100);
  const rawPerformance = clamp((idealCycle / actualCycle) * 100, 0, 100);

  let rawQuality: number;
  const totalProc = safeNumber(params.unitsProcessed, 0);
  const totalGood = safeNumber(params.unitsGood, 0);
  if (totalProc > 0 && totalGood >= 0 && totalGood <= totalProc) {
    rawQuality = clamp((totalGood / totalProc) * 100, 0, 100);
  } else {
    const safeDefect = clamp(safeNumber(params.defectRatePct, 0.8), 0, 100);
    rawQuality = clamp(100 - safeDefect, 0, 100);
  }

  const availability = Number(rawAvailability.toFixed(1));
  const performance = Number(rawPerformance.toFixed(1));
  const quality = Number(rawQuality.toFixed(1));

  const oee = Number(
    clamp((availability / 100) * (performance / 100) * (quality / 100) * 100, 0, 100).toFixed(1)
  );

  return {
    availability,
    performance,
    quality,
    oee,
  };
}

export function deriveOperationalStatus(
  machine: Pick<
    MachineTelemetry,
    | 'utilization'
    | 'queueLength'
    | 'bufferCapacity'
    | 'temperature'
    | 'tempWarningLimit'
    | 'tempCriticalLimit'
    | 'cycleTime'
    | 'targetCycleTime'
    | 'downtime'
  >,
  riskScore: number,
  thresholds: FactoryThresholds
): MachineOperationalStatus {
  const util = safeNumber(machine.utilization, 0);
  const queueRatio =
    safeNumber(machine.queueLength, 0) / Math.max(1, safeNumber(machine.bufferCapacity, 30));
  const temp = safeNumber(machine.temperature, 45);

  if (
    riskScore >= 70 ||
    temp >= safeNumber(machine.tempCriticalLimit, thresholds.tempCriticalCelsius) ||
    queueRatio >= 1.0 ||
    util >= thresholds.utilizationCriticalPct ||
    safeNumber(machine.downtime, 0) >= thresholds.downtimeCriticalMinutes
  ) {
    return 'Critical';
  }

  if (
    riskScore >= 45 ||
    temp >= safeNumber(machine.tempWarningLimit, thresholds.tempWarningCelsius) ||
    queueRatio >= 0.72 ||
    util >= thresholds.utilizationWarningPct ||
    safeNumber(machine.cycleTime, 42) >= safeNumber(machine.targetCycleTime, 42) * 1.12
  ) {
    return 'Warning';
  }

  return 'Normal';
}

/**
 * Explainable Weighted Risk-Scoring Bottleneck Prediction Engine (Rule-Based / Heuristic)
 * Weights:
 * - Machine Utilization: 25%
 * - Queue Length (WIP):  25%
 * - Cycle Time:          20%
 * - Downtime:            15%
 * - Defect Rate:         10%
 * - Temperature:          5%
 */
export function evaluateMachineBottleneck(
  machine: MachineTelemetry,
  thresholds: FactoryThresholds
): MachinePredictionResult {
  const utilization = clamp(safeNumber(machine.utilization, 75), 0, 100);
  const queueLength = Math.max(0, safeNumber(machine.queueLength, 0));
  const bufferCap = Math.max(5, safeNumber(machine.bufferCapacity, thresholds.defaultBufferCapacity));
  const cycleTime = Math.max(1, safeNumber(machine.cycleTime, thresholds.nominalTaktSeconds));
  const targetTakt = Math.max(1, safeNumber(machine.targetCycleTime, thresholds.nominalTaktSeconds));
  const downtime = Math.max(0, safeNumber(machine.downtime, 0));
  const defectRate = clamp(safeNumber(machine.defectRate, 0.5), 0, 100);
  const temperature = safeNumber(machine.temperature, 45);
  const tempWarn = safeNumber(machine.tempWarningLimit, thresholds.tempWarningCelsius);
  const tempCrit = Math.max(
    tempWarn + 5,
    safeNumber(machine.tempCriticalLimit, thresholds.tempCriticalCelsius)
  );
  const demandRatio = clamp(
    safeNumber(machine.targetDemand, thresholds.shiftTargetUnits) /
      Math.max(1, thresholds.shiftTargetUnits),
    0.75,
    1.35
  );

  // 1. Utilization Score (0-100)
  let utilScore = 0;
  if (utilization <= 65) {
    utilScore = (utilization / 65) * 18;
  } else if (utilization <= thresholds.utilizationWarningPct) {
    utilScore =
      18 +
      ((utilization - 65) / Math.max(1, thresholds.utilizationWarningPct - 65)) * 42;
  } else {
    utilScore =
      60 +
      ((utilization - thresholds.utilizationWarningPct) /
        Math.max(1, 99 - thresholds.utilizationWarningPct)) *
        40;
  }
  utilScore = clamp(utilScore * (0.92 + 0.08 * demandRatio), 0, 100);

  // 2. Queue Length Score (0-100)
  const queueOccupancyPct = (queueLength / bufferCap) * 100;
  let queueScore = 0;
  if (queueOccupancyPct <= 35) {
    queueScore = (queueOccupancyPct / 35) * 20;
  } else if (queueOccupancyPct <= 75) {
    queueScore = 20 + ((queueOccupancyPct - 35) / 40) * 45;
  } else {
    queueScore = 65 + ((queueOccupancyPct - 75) / 35) * 35;
  }
  queueScore = clamp(queueScore, 0, 100);

  // 3. Cycle Time Score (0-100)
  const cycleRatio = cycleTime / targetTakt;
  let cycleScore = 0;
  if (cycleRatio <= 0.96) {
    cycleScore = 8;
  } else if (cycleRatio <= 1.04) {
    cycleScore = 8 + ((cycleRatio - 0.96) / 0.08) * 18;
  } else if (cycleRatio <= 1.18) {
    cycleScore = 26 + ((cycleRatio - 1.04) / 0.14) * 44;
  } else {
    cycleScore = 70 + ((cycleRatio - 1.18) / 0.16) * 30;
  }
  cycleScore = clamp(cycleScore, 0, 100);

  // 4. Downtime Score (0-100)
  const downtimeCrit = Math.max(15, thresholds.downtimeCriticalMinutes);
  const downtimeScore = clamp((downtime / downtimeCrit) * 100, 0, 100);

  // 5. Defect Rate Score (0-100)
  const defectCrit = Math.max(1.5, thresholds.defectCriticalPct);
  const defectScore = clamp((defectRate / defectCrit) * 100, 0, 100);

  // 6. Temperature Score (0-100)
  let tempScore = 0;
  const nominalAmbient = 38;
  if (temperature <= nominalAmbient) {
    tempScore = 6;
  } else if (temperature <= tempWarn) {
    tempScore = 6 + ((temperature - nominalAmbient) / Math.max(1, tempWarn - nominalAmbient)) * 49;
  } else {
    tempScore = 55 + ((temperature - tempWarn) / Math.max(1, tempCrit - tempWarn)) * 45;
  }
  tempScore = clamp(tempScore, 0, 100);

  const parameterBreakdown: ParameterScoreDetail[] = [
    {
      key: 'utilization',
      label: 'Machine Utilization',
      rawValue: Number(utilization.toFixed(1)),
      unit: '%',
      thresholdLabel: `Warn ≥ ${thresholds.utilizationWarningPct}%`,
      normalizedScore: Number(utilScore.toFixed(1)),
      weight: 0.25,
      weightedContribution: Number((utilScore * 0.25).toFixed(2)),
    },
    {
      key: 'queue',
      label: 'WIP Queue Length',
      rawValue: Math.round(queueLength),
      unit: 'units',
      thresholdLabel: `Cap ${bufferCap} units`,
      normalizedScore: Number(queueScore.toFixed(1)),
      weight: 0.25,
      weightedContribution: Number((queueScore * 0.25).toFixed(2)),
    },
    {
      key: 'cycleTime',
      label: 'Production Cycle Time',
      rawValue: Number(cycleTime.toFixed(1)),
      unit: 's',
      thresholdLabel: `Takt ${targetTakt}s`,
      normalizedScore: Number(cycleScore.toFixed(1)),
      weight: 0.2,
      weightedContribution: Number((cycleScore * 0.2).toFixed(2)),
    },
    {
      key: 'downtime',
      label: 'Shift Downtime',
      rawValue: Number(downtime.toFixed(1)),
      unit: 'min',
      thresholdLabel: `Crit ≥ ${thresholds.downtimeCriticalMinutes}m`,
      normalizedScore: Number(downtimeScore.toFixed(1)),
      weight: 0.15,
      weightedContribution: Number((downtimeScore * 0.15).toFixed(2)),
    },
    {
      key: 'defectRate',
      label: 'Quality Defect Rate',
      rawValue: Number(defectRate.toFixed(2)),
      unit: '%',
      thresholdLabel: `Crit ≥ ${thresholds.defectCriticalPct}%`,
      normalizedScore: Number(defectScore.toFixed(1)),
      weight: 0.1,
      weightedContribution: Number((defectScore * 0.1).toFixed(2)),
    },
    {
      key: 'temperature',
      label: 'Operating Temperature',
      rawValue: Number(temperature.toFixed(1)),
      unit: '°C',
      thresholdLabel: `Crit ≥ ${tempCrit}°C`,
      normalizedScore: Number(tempScore.toFixed(1)),
      weight: 0.05,
      weightedContribution: Number((tempScore * 0.05).toFixed(2)),
    },
  ];

  const rawRiskScore =
    utilScore * 0.25 +
    queueScore * 0.25 +
    cycleScore * 0.2 +
    downtimeScore * 0.15 +
    defectScore * 0.1 +
    tempScore * 0.05;

  const riskScore = clamp(Math.round(rawRiskScore), 0, 100);
  const classification = classifyRiskScore(riskScore);

  const cycleExcessSec = Math.max(0, cycleTime - targetTakt);
  const remainingUnits = Math.max(25, machine.targetDemand - machine.unitsGood);
  const queueDrainDelayMin =
    queueLength > bufferCap * 0.35 ? ((queueLength - bufferCap * 0.35) * cycleTime) / 60 : 0;
  const paceSlipMin = (remainingUnits * cycleExcessSec) / 60;
  const riskPenaltyMin = riskScore >= 50 ? (riskScore - 45) * 0.35 : 0;
  const predictedDelayMinutes = Math.max(
    0,
    Math.round(queueDrainDelayMin * 0.55 + paceSlipMin * 0.3 + riskPenaltyMin)
  );
  const estimatedLostUnits = Math.max(
    0,
    Math.round((predictedDelayMinutes * 60) / Math.max(10, targetTakt))
  );

  const sortedDrivers = [...parameterBreakdown].sort(
    (a, b) => b.weightedContribution - a.weightedContribution
  );

  const primaryFactors = sortedDrivers
    .filter((d) => d.normalizedScore >= 30)
    .slice(0, 3)
    .map(
      (d) =>
        `${d.label} (${d.rawValue}${d.unit} → ${Math.round(d.normalizedScore)}/100 norm, +${d.weightedContribution.toFixed(1)} pts)`
    );

  if (primaryFactors.length === 0) {
    primaryFactors.push(
      `Balanced operation (${topFactorSummary(sortedDrivers[0])})`
    );
  }

  const { narrativeDiagnosis, recommendedActions } = buildEngineeringExplanation(
    machine,
    classification,
    riskScore,
    sortedDrivers,
    predictedDelayMinutes
  );

  return {
    machineId: machine.id,
    machineCode: machine.code,
    machineName: machine.name,
    riskScore,
    classification,
    predictedDelayMinutes,
    estimatedLostUnits,
    primaryFactors,
    narrativeDiagnosis,
    recommendedActions,
    parameterBreakdown,
  };
}

function topFactorSummary(d: ParameterScoreDetail): string {
  return `${d.label}: ${d.rawValue}${d.unit}, +${d.weightedContribution.toFixed(1)} pts`;
}

function buildEngineeringExplanation(
  machine: MachineTelemetry,
  classification: RiskClassification,
  riskScore: number,
  sortedDrivers: ParameterScoreDetail[],
  predictedDelayMinutes: number
): { narrativeDiagnosis: string; recommendedActions: string[] } {
  const topDriver = sortedDrivers[0];
  const secondDriver = sortedDrivers[1];

  if (classification === 'LOW') {
    return {
      narrativeDiagnosis: `${machine.name} (${machine.code}) scores ${riskScore}/100 (${classification}) on the weighted risk index. Cycle time (${machine.cycleTime.toFixed(1)}s vs ${machine.targetCycleTime}s takt) and input WIP queue (${machine.queueLength}/${machine.bufferCapacity} units) maintain steady serial flow without buffer accumulation.`,
      recommendedActions: [
        'Maintain current raw material release interval and standard preventive lubrication.',
        'Continue monitoring station cycle variance against the 42.0s benchmark takt.',
      ],
    };
  }

  const actions: string[] = [];
  if (machine.id === 'CNC-01') {
    actions.push(
      'Throttle raw billet release rate by 12% or route secondary roughing lots to parallel CNC bay.',
      'Inspect carbide insert wear to restore spindle cycle time toward 42.0s takt.'
    );
  } else if (machine.id === 'ASM-02') {
    actions.push(
      'Assign cross-trained floater operator to Assembly Station to drain WIP queue backlog.',
      'Re-sequence fastener kitting trays to eliminate manual pick-and-place micro-stops.'
    );
  } else if (machine.id === 'WLD-03') {
    actions.push(
      'Boost closed-loop glycol chiller flow and dress copper weld electrode tip.',
      'Divert secondary tack-weld sub-lots to backup welding cell until temperature stabilizes.'
    );
  } else if (machine.id === 'QC-04') {
    actions.push(
      'Activate secondary Automated Optical Inspection (AOI) camera lane to clear metrology queue.',
      'Isolate upstream dimensional drift to lower scrap rejection rate.'
    );
  } else if (machine.id === 'PKG-05') {
    actions.push(
      'Enable dual-carton erector lane and recalibrate heat-sealer dwell timing at Packaging.',
      'Pre-stage AGV pallet totes at end-of-line discharge to eliminate outfeed pauses.'
    );
  }

  if (machine.utilization >= 90) {
    actions.push('Cap sustained station utilization below 88% to prevent non-linear queue buildup.');
  }

  const narrativeDiagnosis =
    `${machine.name} (${machine.code}) registers a ${classification} weighted risk score of ${riskScore}/100, driven primarily by ${topDriver.label.toLowerCase()} at ${topDriver.rawValue}${topDriver.unit} (+${topDriver.weightedContribution.toFixed(1)} weighted pts) and ${secondDriver.label.toLowerCase()} at ${secondDriver.rawValue}${secondDriver.unit} (+${secondDriver.weightedContribution.toFixed(1)} weighted pts). ` +
    (machine.cycleTime > machine.targetCycleTime
      ? `Actual cycle time (${machine.cycleTime.toFixed(1)}s) exceeds the ${machine.targetCycleTime}s line takt by ${(machine.cycleTime - machine.targetCycleTime).toFixed(1)}s/unit, causing input WIP (${machine.queueLength}/${machine.bufferCapacity} units) to accumulate and projecting ~${predictedDelayMinutes} min of downstream schedule delay.`
      : `Elevated buffer occupancy (${machine.queueLength}/${machine.bufferCapacity} units) and cumulative downtime (${machine.downtime.toFixed(1)} min) reduce line headroom, projecting ~${predictedDelayMinutes} min of schedule slip.`);

  return {
    narrativeDiagnosis,
    recommendedActions: actions.slice(0, 3),
  };
}

export function evaluateAllPredictions(
  machines: MachineTelemetry[],
  thresholds: FactoryThresholds
): MachinePredictionResult[] {
  return [...machines]
    .map((m) => evaluateMachineBottleneck(m, thresholds))
    .sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Centralized Factory KPI Aggregation
 * - Total Production Output strictly equals conforming Finished Goods completed by the final stage (PKG-05.unitsGood).
 * - Fleet OEE is calculated as the arithmetic mean of individual station OEEs: (1/N) * sum(OEE_i),
 *   where each station OEE_i = Availability_i * Performance_i * Quality_i.
 * - Mass Conservation Check verifies:
 *   rawMaterialReleased === totalWipInSystem + totalRejectedAllStages + finishedGoodsDispatched
 */
export function calculateFactoryKPIs(
  machines: MachineTelemetry[],
  predictions: MachinePredictionResult[],
  thresholds: FactoryThresholds
): FactoryKPIs {
  if (machines.length === 0) {
    return {
      rawMaterialReleased: 0,
      totalProcessedAcrossStages: 0,
      totalGoodFinalStage: 0,
      totalRejectedAllStages: 0,
      totalWipInSystem: 0,
      totalOutput: 0,
      finishedGoodsDispatched: 0,
      shiftTarget: thresholds.shiftTargetUnits,
      outputVariancePct: 0,
      fleetOee: 0,
      compositeFleetOee: 0,
      avgAvailability: 0,
      avgPerformance: 0,
      avgQuality: 0,
      avgUtilization: 0,
      peakUtilization: 0,
      peakUtilizationMachine: 'N/A',
      avgCycleTime: 0,
      taktVarianceSeconds: 0,
      downtimePercentage: 0,
      totalDowntimeMinutes: 0,
      totalPlannedMinutes: 0,
      maxBottleneckRisk: 0,
      maxBottleneckClassification: 'LOW',
      primaryBottleneckMachine: 'None',
      primaryBottleneckId: '',
      massBalanceConserved: true,
    };
  }

  const sortedByStage = [...machines].sort((a, b) => a.stageOrder - b.stageOrder);
  const firstStage = sortedByStage[0];
  const finalStage = sortedByStage[sortedByStage.length - 1];

  const rawMaterialReleased = Math.max(0, Math.round(firstStage.unitsEntered));
  const finishedGoodsDispatched = Math.max(0, Math.round(finalStage.unitsGood));
  const totalOutput = finishedGoodsDispatched;

  const totalWipInSystem = sortedByStage.reduce(
    (acc, m) => acc + Math.max(0, Math.round(m.queueLength)),
    0
  );
  const totalRejectedAllStages = sortedByStage.reduce(
    (acc, m) => acc + Math.max(0, Math.round(m.unitsRejected)),
    0
  );
  const totalProcessedAcrossStages = sortedByStage.reduce(
    (acc, m) => acc + Math.max(0, Math.round(m.unitsProcessed)),
    0
  );

  // Verify exact serial mass balance (holds whenever serial flow is unmodified by manual mid-line buffer overrides)
  const massBalanceConserved =
    rawMaterialReleased === totalWipInSystem + totalRejectedAllStages + finishedGoodsDispatched;

  const shiftTarget = Math.max(1, safeNumber(thresholds.shiftTargetUnits, 680));
  const avgPlannedMinutes =
    sortedByStage.reduce((acc, m) => acc + safeNumber(m.plannedTimeMinutes, 320), 0) /
    sortedByStage.length;
  const shiftProgressFraction = clamp(
    avgPlannedMinutes / Math.max(60, thresholds.shiftDurationMinutes),
    0.1,
    1.0
  );
  const expectedAtCurrentPoint = Math.max(1, Math.round(shiftTarget * shiftProgressFraction));
  const outputVariancePct = Number(
    (((totalOutput - expectedAtCurrentPoint) / expectedAtCurrentPoint) * 100).toFixed(1)
  );

  const avgAvailability = Number(
    (
      sortedByStage.reduce((acc, m) => acc + safeNumber(m.availability, 0), 0) /
      sortedByStage.length
    ).toFixed(1)
  );
  const avgPerformance = Number(
    (
      sortedByStage.reduce((acc, m) => acc + safeNumber(m.performance, 0), 0) /
      sortedByStage.length
    ).toFixed(1)
  );
  const avgQuality = Number(
    (
      sortedByStage.reduce((acc, m) => acc + safeNumber(m.quality, 0), 0) / sortedByStage.length
    ).toFixed(1)
  );

  // Documented Fleet OEE Aggregation: Arithmetic Mean of Individual Station OEEs
  const fleetOee = Number(
    (
      sortedByStage.reduce((acc, m) => acc + safeNumber(m.oee, 0), 0) / sortedByStage.length
    ).toFixed(1)
  );
  const compositeFleetOee = Number(
    ((avgAvailability / 100) * (avgPerformance / 100) * (avgQuality / 100) * 100).toFixed(1)
  );

  const avgUtilization = Number(
    (
      sortedByStage.reduce((acc, m) => acc + safeNumber(m.utilization, 0), 0) /
      sortedByStage.length
    ).toFixed(1)
  );

  const peakMachine = [...sortedByStage].sort((a, b) => b.utilization - a.utilization)[0];

  const avgCycleTime = Number(
    (
      sortedByStage.reduce((acc, m) => acc + safeNumber(m.cycleTime, 0), 0) /
      sortedByStage.length
    ).toFixed(1)
  );
  const taktVarianceSeconds = Number((avgCycleTime - thresholds.nominalTaktSeconds).toFixed(1));

  const totalDowntimeMinutes = Number(
    sortedByStage.reduce((acc, m) => acc + safeNumber(m.downtime, 0), 0).toFixed(1)
  );
  const totalPlannedMinutes = Number(
    sortedByStage.reduce((acc, m) => acc + safeNumber(m.plannedTimeMinutes, 320), 0).toFixed(1)
  );
  const downtimePercentage = Number(
    ((totalDowntimeMinutes / Math.max(1, totalPlannedMinutes)) * 100).toFixed(1)
  );

  const topPrediction = predictions[0];

  return {
    rawMaterialReleased,
    totalProcessedAcrossStages,
    totalGoodFinalStage: finishedGoodsDispatched,
    totalRejectedAllStages,
    totalWipInSystem,
    totalOutput,
    finishedGoodsDispatched,
    shiftTarget,
    outputVariancePct,
    fleetOee,
    compositeFleetOee,
    avgAvailability,
    avgPerformance,
    avgQuality,
    avgUtilization,
    peakUtilization: Number(peakMachine.utilization.toFixed(1)),
    peakUtilizationMachine: peakMachine.shortName,
    avgCycleTime,
    taktVarianceSeconds,
    downtimePercentage,
    totalDowntimeMinutes,
    totalPlannedMinutes,
    maxBottleneckRisk: topPrediction ? topPrediction.riskScore : 0,
    maxBottleneckClassification: topPrediction ? topPrediction.classification : 'LOW',
    primaryBottleneckMachine: topPrediction ? topPrediction.machineName : 'Nominal',
    primaryBottleneckId: topPrediction ? topPrediction.machineId : '',
    massBalanceConserved,
  };
}
