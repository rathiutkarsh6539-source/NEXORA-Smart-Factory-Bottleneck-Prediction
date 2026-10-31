import {
  SIM_STEP_MS,
  buildScenarioMachines,
  formatSimTimestamp,
  normalizeTimelinePercentages,
} from '../data/initialFactoryData';
import {
  FactoryAlert,
  FactoryThresholds,
  MachinePredictionResult,
  MachineTelemetry,
  SimulationScenarioId,
  TimeSeriesPoint,
  TimelineSegment,
  TimelineSegmentState,
} from '../types/factory';
import {
  calculateFactoryKPIs,
  clamp,
  computeMachineOEE,
  deriveOperationalStatus,
  evaluateAllPredictions,
  evaluateMachineBottleneck,
} from './bottleneckEngine';

export interface SimulationTickResult {
  machines: MachineTelemetry[];
  simClockMs: number;
  newTimeSeriesPoint: TimeSeriesPoint;
}

function appendOrExtendTimeline(
  prevTimeline: TimelineSegment[],
  nextState: TimelineSegmentState,
  prevSimClockMs: number,
  nextSimClockMs: number,
  jobCode: string,
  stepSec: number
): TimelineSegment[] {
  const startLabel = formatSimTimestamp(prevSimClockMs);
  const endLabel = formatSimTimestamp(nextSimClockMs);
  const copied = prevTimeline.map((seg) => ({ ...seg }));

  if (copied.length === 0) {
    return [
      {
        id: `${jobCode}-${nextSimClockMs}`,
        state: nextState,
        durationSec: stepSec,
        durationPct: 100,
        startTimeLabel: startLabel,
        endTimeLabel: endLabel,
        jobRun: jobCode,
      },
    ];
  }

  const last = copied[copied.length - 1];
  if (last.state === nextState) {
    last.durationSec = Number((last.durationSec + stepSec).toFixed(1));
    last.endTimeLabel = endLabel;
  } else {
    copied.push({
      id: `${jobCode}-${nextSimClockMs}`,
      state: nextState,
      durationSec: stepSec,
      durationPct: 0,
      startTimeLabel: startLabel,
      endTimeLabel: endLabel,
      jobRun: jobCode,
    });
  }

  // Keep most recent 12 state segments to represent active rolling window cleanly
  const trimmed = copied.slice(-12);
  return normalizeTimelinePercentages(trimmed);
}

/**
 * Pure, deterministic-capable single simulation tick (2.4s simulated plant step).
 * Enforces strict conservation of units:
 * - Raw material enters CNC-01 (`CNC-01.unitsEntered += rawArrivals`)
 * - Each station processes `actualCompleted <= availableWip`
 * - `actualCompleted = goodCompleted + rejectedCompleted`
 * - Only `goodCompleted` units enter the next downstream station (`next.unitsEntered += goodCompleted`)
 * - `queueLength = unitsEntered - unitsProcessed` (>= 0)
 * - `unitsProcessed = unitsGood + unitsRejected` (monotonic non-decreasing)
 */
export function stepFactorySimulation(params: {
  prevMachines: MachineTelemetry[];
  prevSimClockMs: number;
  scenario: SimulationScenarioId;
  thresholds: FactoryThresholds;
  mitigatedStationIds: ReadonlySet<string>;
  setupStationIds?: ReadonlySet<string>;
  rng?: () => number;
}): SimulationTickResult {
  const {
    prevMachines,
    prevSimClockMs,
    scenario,
    thresholds,
    mitigatedStationIds,
    setupStationIds,
    rng = Math.random,
  } = params;

  const nextSimClockMs = prevSimClockMs + SIM_STEP_MS;
  const stepSec = SIM_STEP_MS / 1000; // 2.4s
  const stepMin = stepSec / 60; // 0.04 min

  const ordered = [...prevMachines]
    .sort((a, b) => a.stageOrder - b.stageOrder)
    .map((m) => ({ ...m, timeline: m.timeline.map((t) => ({ ...t })) }));

  const scenarioTargets = buildScenarioMachines(scenario, thresholds, nextSimClockMs);

  // Raw Material release into Stage 1 (CNC-01): throttled only if CNC input buffer exceeds hard safety cap
  const stage0 = ordered[0];
  const stage0HardCap = stage0.bufferCapacity + 10;
  let rawArrivals = 1;
  if (stage0.queueLength >= stage0HardCap) {
    rawArrivals = 0;
  } else if (scenario === 'cnc_overload' && !mitigatedStationIds.has('CNC-01')) {
    rawArrivals = rng() < 0.65 ? 2 : 1;
  }
  stage0.unitsEntered += rawArrivals;

  for (let i = 0; i < ordered.length; i++) {
    const curr = ordered[i];
    const next = ordered[i + 1];
    const targetRef = scenarioTargets.find((b) => b.id === curr.id) ?? curr;
    const isMitigated = mitigatedStationIds.has(curr.id);
    const inSetup = setupStationIds?.has(curr.id) ?? false;

    // Downstream buffer occupancy determines blocking
    const downstreamQueue = next ? Math.max(0, next.unitsEntered - next.unitsProcessed) : 0;
    const downstreamRatio = next ? downstreamQueue / Math.max(1, next.bufferCapacity) : 0;
    const isBlocked = downstreamRatio >= 0.93;

    // Current available WIP in station input buffer
    const availableWip = Math.max(0, curr.unitsEntered - curr.unitsProcessed);
    const isStarved = i > 0 && availableWip <= 2;

    const desiredCycle = isMitigated ? thresholds.nominalTaktSeconds - 0.3 : targetRef.cycleTime;
    const desiredUtil = isMitigated ? 75.0 : targetRef.utilization;
    const desiredTemp = isMitigated ? 49.5 : targetRef.temperature;
    const desiredDefect = isMitigated ? 0.80 : targetRef.defectRate;

    const jitter = (rng() - 0.5) * 0.8;

    let nextCycle = curr.cycleTime + (desiredCycle - curr.cycleTime) * 0.25 + jitter * 0.4;
    if (isBlocked) nextCycle += 1.4;
    nextCycle = clamp(Number(nextCycle.toFixed(1)), 32, 68);

    let nextUtil = curr.utilization + (desiredUtil - curr.utilization) * 0.26 + jitter * 0.7;
    if (isStarved) nextUtil = Math.min(nextUtil, 66 + rng() * 3);
    if (availableWip > curr.bufferCapacity * 0.85 && !isMitigated) {
      nextUtil = Math.max(nextUtil, 92.0);
    }
    nextUtil = clamp(Number(nextUtil.toFixed(1)), 40, 99.4);

    const thermalLoadDelta = (nextUtil - 78) * 0.05;
    const nextTemp = clamp(
      Number(
        (
          curr.temperature +
          (desiredTemp - curr.temperature) * 0.2 +
          thermalLoadDelta * 0.2 +
          jitter * 0.3
        ).toFixed(1)
      ),
      34,
      96
    );

    const isHardStopped =
      !isMitigated &&
      ((scenario === 'welding_failure' && curr.id === 'WLD-03') ||
        nextTemp >= curr.tempCriticalLimit + 1.5);

    const nextPlannedMin = Number((curr.plannedTimeMinutes + stepMin).toFixed(2));
    const downtimeAdd = isHardStopped
      ? stepMin
      : inSetup
      ? stepMin * 0.8
      : nextCycle > thresholds.nominalTaktSeconds * 1.18
      ? stepMin * 0.35
      : 0;
    const nextDowntime = Number(
      clamp(curr.downtime + downtimeAdd, 0, nextPlannedMin * 0.92).toFixed(2)
    );

    // Determine how many units this workstation completes during this 2.4s simulated step
    const isScenarioBottleneck =
      !isMitigated &&
      ((scenario === 'cnc_overload' && curr.id === 'CNC-01') ||
        (scenario === 'assembly_delay' && curr.id === 'ASM-02') ||
        (scenario === 'quality_overload' && curr.id === 'QC-04') ||
        (scenario === 'packaging_bottleneck' && curr.id === 'PKG-05'));

    let capacityThisStep = 1;
    if (inSetup || isHardStopped) {
      capacityThisStep = 0;
    } else if (isScenarioBottleneck) {
      // Constrained station runs significantly slower than arrival rate (~0.34 units per step vs 1.0 arrival)
      capacityThisStep = rng() < 0.34 ? 1 : 0;
    } else if (isBlocked) {
      // Downstream buffer full -> discharge blocked most steps
      capacityThisStep = rng() < 0.25 ? 1 : 0;
    } else if (nextCycle <= thresholds.nominalTaktSeconds * 1.03 && availableWip > 12) {
      // Healthy station with excess queue drains backlog faster
      capacityThisStep = rng() < 0.45 ? 2 : 1;
    }

    const actualCompleted = Math.min(availableWip, capacityThisStep);

    // Split completed units into conforming good units and rejected scrap units
    let rejectedThisStep = 0;
    if (actualCompleted > 0) {
      const targetRejectProb = clamp(desiredDefect / 100, 0.003, 0.25);
      for (let u = 0; u < actualCompleted; u++) {
        if (rng() < targetRejectProb) {
          rejectedThisStep++;
        }
      }
    }
    const goodThisStep = actualCompleted - rejectedThisStep;

    curr.unitsProcessed += actualCompleted;
    curr.unitsGood += goodThisStep;
    curr.unitsRejected += rejectedThisStep;
    curr.queueLength = Math.max(0, curr.unitsEntered - curr.unitsProcessed);

    // Serial Coupling: ONLY conforming good units enter the next station's input buffer
    if (next && goodThisStep > 0) {
      next.unitsEntered += goodThisStep;
      next.queueLength = Math.max(0, next.unitsEntered - next.unitsProcessed);
    }

    const cumulativeDefectPct =
      curr.unitsProcessed > 0
        ? (curr.unitsRejected / curr.unitsProcessed) * 100
        : desiredDefect;
    const blendedDefectRate = clamp(
      Number((cumulativeDefectPct * 0.65 + desiredDefect * 0.35).toFixed(2)),
      0.2,
      12.0
    );

    const oeeStats = computeMachineOEE({
      downtimeMinutes: nextDowntime,
      plannedTimeMinutes: nextPlannedMin,
      actualCycleTime: nextCycle,
      targetCycleTime: curr.targetCycleTime,
      unitsGood: curr.unitsGood,
      unitsProcessed: curr.unitsProcessed,
      defectRatePct: blendedDefectRate,
    });

    curr.cycleTime = nextCycle;
    curr.utilization = nextUtil;
    curr.plannedTimeMinutes = nextPlannedMin;
    curr.downtime = Number(nextDowntime.toFixed(1));
    curr.temperature = nextTemp;
    curr.defectRate = blendedDefectRate;
    curr.isBlocked = isBlocked;
    curr.isStarved = isStarved;
    curr.vibrationMmS = Number(
      clamp(1.2 + (nextUtil - 70) * 0.06 + (isHardStopped ? 1.8 : 0), 0.7, 6.8).toFixed(1)
    );
    curr.availability = oeeStats.availability;
    curr.performance = oeeStats.performance;
    curr.quality = oeeStats.quality;
    curr.oee = oeeStats.oee;

    const predNow = evaluateMachineBottleneck(curr, thresholds);
    curr.status = deriveOperationalStatus(curr, predNow.riskScore, thresholds);

    // Determine exact operating state for Gantt timeline history
    let nextOperatingState: TimelineSegmentState = 'Running';
    if (inSetup) {
      nextOperatingState = 'Setup';
    } else if (isHardStopped || curr.status === 'Critical' && actualCompleted === 0 && nextTemp >= curr.tempCriticalLimit) {
      nextOperatingState = 'Stopped';
    } else if (
      curr.status === 'Critical' ||
      curr.status === 'Warning' ||
      isBlocked ||
      isStarved
    ) {
      nextOperatingState = 'Micro-stop';
    } else {
      nextOperatingState = 'Running';
    }

    curr.operatingState = nextOperatingState;
    curr.productionRate =
      nextOperatingState === 'Stopped' || nextOperatingState === 'Setup'
        ? 0
        : Math.round((3600 / Math.max(20, nextCycle)) * (isStarved ? 0.8 : 1));

    curr.timeline = appendOrExtendTimeline(
      curr.timeline,
      nextOperatingState,
      prevSimClockMs,
      nextSimClockMs,
      curr.jobCode,
      stepSec
    );
  }

  const allPreds = evaluateAllPredictions(ordered, thresholds);
  const kpis = calculateFactoryKPIs(ordered, allPreds, thresholds);

  const cnc = ordered[0];
  const asm = ordered[1];
  const wld = ordered[2];
  const qc = ordered[3];
  const pkg = ordered[4];

  const expectedPlannedUnits = Math.round(
    thresholds.shiftTargetUnits *
      clamp(cnc.plannedTimeMinutes / Math.max(60, thresholds.shiftDurationMinutes), 0.1, 1)
  );

  const newTimeSeriesPoint: TimeSeriesPoint = {
    timestamp: formatSimTimestamp(nextSimClockMs),
    simClockMs: nextSimClockMs,
    plannedOutput: expectedPlannedUnits,
    actualOutput: kpis.totalOutput,
    totalRejected: kpis.totalRejectedAllStages,
    avgUtilization: kpis.avgUtilization,
    avgCycleTime: kpis.avgCycleTime,
    totalQueue: kpis.totalWipInSystem,
    fleetOee: kpis.fleetOee,
    maxRiskScore: kpis.maxBottleneckRisk,
    cncUtil: cnc.utilization,
    asmUtil: asm.utilization,
    wldUtil: wld.utilization,
    qcUtil: qc.utilization,
    pkgUtil: pkg.utilization,
    cncCycle: cnc.cycleTime,
    asmCycle: asm.cycleTime,
    wldCycle: wld.cycleTime,
    qcCycle: qc.cycleTime,
    pkgCycle: pkg.cycleTime,
    velocityUph: pkg.productionRate,
  };

  return {
    machines: ordered,
    simClockMs: nextSimClockMs,
    newTimeSeriesPoint,
  };
}

/**
 * Synchronizes active alerts deterministically from live workstation telemetry & predictions.
 * Prevents duplicate alerts for active/acknowledged conditions while preserving resolved history.
 */
export function synchronizeAlertsFromTelemetry(
  prevAlerts: FactoryAlert[],
  machines: MachineTelemetry[],
  predictions: MachinePredictionResult[],
  thresholds: FactoryThresholds,
  simClockMs: number
): FactoryAlert[] {
  const nowStr = formatSimTimestamp(simClockMs);
  const nextAlerts = [...prevAlerts];

  const upsertConditionAlert = (
    deterministicId: string,
    candidate: Omit<FactoryAlert, 'id' | 'status' | 'timestamp' | 'updatedAt'>
  ) => {
    const existingIdx = nextAlerts.findIndex(
      (a) => a.id === deterministicId && (a.status === 'active' || a.status === 'acknowledged')
    );

    if (existingIdx !== -1) {
      nextAlerts[existingIdx] = {
        ...nextAlerts[existingIdx],
        severity: candidate.severity,
        currentValue: candidate.currentValue,
        thresholdValue: candidate.thresholdValue,
        description: candidate.description,
        updatedAt: nowStr,
      };
      return;
    }

    const resolvedCollisionIdx = nextAlerts.findIndex(
      (a) => a.id === deterministicId && a.status === 'resolved'
    );
    if (resolvedCollisionIdx !== -1) {
      nextAlerts[resolvedCollisionIdx] = {
        ...nextAlerts[resolvedCollisionIdx],
        id: `${deterministicId}-ARCH-${simClockMs.toString().slice(-5)}`,
      };
    }

    nextAlerts.unshift({
      ...candidate,
      id: deterministicId,
      status: 'active',
      timestamp: nowStr,
      updatedAt: nowStr,
    });
  };

  const activeConditionIds = new Set<string>();

  const markAndUpsert = (
    deterministicId: string,
    candidate: Omit<FactoryAlert, 'id' | 'status' | 'timestamp' | 'updatedAt'>
  ) => {
    activeConditionIds.add(deterministicId);
    upsertConditionAlert(deterministicId, candidate);
  };

  for (const m of machines) {
    const pred = predictions.find((p) => p.machineId === m.id);

    if (m.utilization >= 90) {
      markAndUpsert(`ALT-UTIL-${m.id}`, {
        machineId: m.id,
        machineName: m.name,
        severity: m.utilization >= 94 ? 'Critical' : 'High',
        triggerMetric: 'Machine Utilization',
        currentValue: `${m.utilization.toFixed(1)}%`,
        thresholdValue: '90.0%',
        description: `${m.name} duty cycle (${m.utilization.toFixed(1)}%) exceeds 90% saturation threshold.`,
        rootCauseHypothesis: 'Arrival rate exceeds station takt capacity under heavy batch load.',
        recommendedAction: 'Redistribute batch load or throttle upstream material release.',
        mitigationType: 'rebalance_load',
      });
    }

    if (m.queueLength >= Math.round(m.bufferCapacity * 0.88)) {
      const isOverCap = m.queueLength >= m.bufferCapacity;
      markAndUpsert(`ALT-QUEUE-${m.id}`, {
        machineId: m.id,
        machineName: m.name,
        severity: isOverCap ? 'Critical' : 'Warning',
        triggerMetric: 'WIP Queue Length',
        currentValue: `${Math.round(m.queueLength)} units`,
        thresholdValue: `${m.bufferCapacity} units`,
        description: `Input buffer at ${m.name} reached ${Math.round(m.queueLength)}/${m.bufferCapacity} units, blocking upstream discharge.`,
        rootCauseHypothesis: `Station cycle time (${m.cycleTime.toFixed(1)}s) lags upstream arrival pace.`,
        recommendedAction: 'Assign buffer relief operator and synchronize upstream conveyor feed.',
        mitigationType: 'clear_buffer',
      });
    }

    if (m.temperature >= m.tempWarningLimit) {
      const isCritTemp = m.temperature >= m.tempCriticalLimit;
      markAndUpsert(`ALT-TEMP-${m.id}`, {
        machineId: m.id,
        machineName: m.name,
        severity: isCritTemp ? 'Critical' : 'Warning',
        triggerMetric: 'Operating Temperature',
        currentValue: `${m.temperature.toFixed(1)}°C`,
        thresholdValue: `${m.tempWarningLimit}°C`,
        description: `Simulated thermocouple on ${m.name} registered ${m.temperature.toFixed(1)}°C (${isCritTemp ? 'above critical ceiling' : 'above warning limit'}).`,
        rootCauseHypothesis: 'Sustained high-load duty cycle or coolant loop flow restriction.',
        recommendedAction: 'Engage auxiliary coolant loop and inspect tooling/electrode wear.',
        mitigationType: 'thermal_cooldown',
      });
    }

    if (m.downtime >= thresholds.downtimeWarningMinutes) {
      markAndUpsert(`ALT-DOWN-${m.id}`, {
        machineId: m.id,
        machineName: m.name,
        severity: m.downtime >= thresholds.downtimeCriticalMinutes ? 'Critical' : 'High',
        triggerMetric: 'Shift Downtime',
        currentValue: `${m.downtime.toFixed(1)} min`,
        thresholdValue: `${thresholds.downtimeWarningMinutes} min`,
        description: `Cumulative stoppage on ${m.name} reached ${m.downtime.toFixed(1)} minutes this shift.`,
        rootCauseHypothesis: 'Recurring station micro-stops and fault recovery pauses.',
        recommendedAction: 'Dispatch maintenance technician for fault reset and sensor alignment.',
        mitigationType: 'general_tune',
      });
    }

    if (pred && (pred.classification === 'HIGH' || pred.classification === 'CRITICAL')) {
      markAndUpsert(`ALT-RISK-${m.id}`, {
        machineId: m.id,
        machineName: m.name,
        severity: pred.classification === 'CRITICAL' ? 'Critical' : 'High',
        triggerMetric: 'Weighted Bottleneck Score',
        currentValue: `${pred.riskScore}/100 (${pred.classification})`,
        thresholdValue: '50/100 (HIGH)',
        description: `Weighted scoring engine projects ~${pred.predictedDelayMinutes} min schedule delay originating at ${m.name}.`,
        rootCauseHypothesis: pred.primaryFactors[0] ?? 'Compound utilization and cycle dilation.',
        recommendedAction: pred.recommendedActions[0] ?? 'Rebalance station takt and drain WIP buffer.',
        mitigationType:
          m.id === 'QC-04'
            ? 'expedite_inspection'
            : m.id === 'PKG-05'
            ? 'boost_packaging'
            : 'rebalance_load',
      });
    }
  }

  // Auto-resolve any active telemetry-condition alert whose condition has recovered
  const reconciled = nextAlerts.map((a) => {
    const isConditionAlert =
      a.id.startsWith('ALT-UTIL-') ||
      a.id.startsWith('ALT-QUEUE-') ||
      a.id.startsWith('ALT-TEMP-') ||
      a.id.startsWith('ALT-DOWN-') ||
      a.id.startsWith('ALT-RISK-');
    if (isConditionAlert && a.status === 'active' && !activeConditionIds.has(a.id)) {
      return { ...a, status: 'resolved' as const, updatedAt: nowStr };
    }
    return a;
  });

  return reconciled.slice(0, 50);
}
