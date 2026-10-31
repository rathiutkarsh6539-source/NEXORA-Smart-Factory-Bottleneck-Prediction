import {
  DowntimeCauseItem,
  FactoryThresholds,
  MachineTelemetry,
  ProductionRecordRow,
  SimulationScenarioId,
  TimeSeriesPoint,
  TimelineSegment,
  TimelineSegmentState,
} from '../types/factory';
import {
  calculateFactoryKPIs,
  computeMachineOEE,
  deriveOperationalStatus,
  evaluateAllPredictions,
  evaluateMachineBottleneck,
} from '../utils/bottleneckEngine';

export const SIM_STEP_MS = 2400; // 1 simulation step = 2.4 seconds of simulated plant time

export function formatSimTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const DEFAULT_FACTORY_THRESHOLDS: FactoryThresholds = {
  nominalTaktSeconds: 42,
  shiftDurationMinutes: 480,
  shiftTargetUnits: 680,
  utilizationWarningPct: 86,
  utilizationCriticalPct: 92,
  defaultBufferCapacity: 32,
  tempWarningCelsius: 72,
  tempCriticalCelsius: 82,
  defectWarningPct: 2.2,
  defectCriticalPct: 3.5,
  downtimeWarningMinutes: 24,
  downtimeCriticalMinutes: 42,
  opcUaEndpoint: 'opc.tcp://sim-gateway.local:4840/UA/LineA',
  mqttBrokerTopic: 'nexora/simulated/line-a/telemetry/v2',
};

export const SCENARIO_DEFINITIONS: Record<
  SimulationScenarioId,
  {
    id: SimulationScenarioId;
    label: string;
    shortDesc: string;
    targetStationId: string;
  }
> = {
  normal: {
    id: 'normal',
    label: 'Normal Production',
    shortDesc: 'Balanced Drum-Buffer-Rope synchronization near 42s takt across all 5 stations.',
    targetStationId: 'NONE',
  },
  cnc_overload: {
    id: 'cnc_overload',
    label: 'CNC Machine Overload',
    shortDesc:
      'Carbide tool wear dilates CNC-01 cycle time to 49.6s; input queue saturates while downstream starves.',
    targetStationId: 'CNC-01',
  },
  assembly_delay: {
    id: 'assembly_delay',
    label: 'Assembly Delay',
    shortDesc:
      'Sub-assembly kitting delay spikes ASM-02 cycle time to 52.6s, blocking upstream CNC-01 outfeed.',
    targetStationId: 'ASM-02',
  },
  welding_failure: {
    id: 'welding_failure',
    label: 'Welding Machine Failure',
    shortDesc:
      'Electrode thermal alarm (86.8°C) & 46m downtime on WLD-03; upstream backs up and QC/PKG starve.',
    targetStationId: 'WLD-03',
  },
  quality_overload: {
    id: 'quality_overload',
    label: 'Quality Inspection Overload',
    shortDesc:
      'Laser metrology queue swells to 29 units with elevated 3.65% scrap rate on QC-04.',
    targetStationId: 'QC-04',
  },
  packaging_bottleneck: {
    id: 'packaging_bottleneck',
    label: 'Packaging Bottleneck',
    shortDesc:
      'End-of-line carton sealer jam slows PKG-05 to 54.0s, throttling finished goods warehouse dispatch.',
    targetStationId: 'PKG-05',
  },
};

export function normalizeTimelinePercentages(segments: TimelineSegment[]): TimelineSegment[] {
  const totalSec = Math.max(
    1,
    segments.reduce((acc, s) => acc + Math.max(0.1, s.durationSec), 0)
  );
  return segments.map((s) => ({
    ...s,
    durationPct: Number(((Math.max(0.1, s.durationSec) / totalSec) * 100).toFixed(2)),
  }));
}

function makeBaselineTimeline(
  code: string,
  operatingState: TimelineSegmentState,
  simClockMs: number
): TimelineSegment[] {
  // Build sequential, non-overlapping historical state intervals leading up to simClockMs
  // Total baseline history window = 300 seconds (5 minutes of recent high-res state history)
  const t0 = formatSimTimestamp(simClockMs - 300_000);
  const t1 = formatSimTimestamp(simClockMs - 264_000);
  const t2 = formatSimTimestamp(simClockMs - 144_000);
  const t3 = formatSimTimestamp(simClockMs - 84_000);
  const tNow = formatSimTimestamp(simClockMs);

  let raw: Omit<TimelineSegment, 'durationPct'>[];

  if (operatingState === 'Stopped') {
    raw = [
      { id: `${code}-s1`, state: 'Setup', durationSec: 36, startTimeLabel: t0, endTimeLabel: t1, jobRun: `SETUP-${code}` },
      { id: `${code}-s2`, state: 'Running', durationSec: 120, startTimeLabel: t1, endTimeLabel: t2, jobRun: `LOT-A-${code}` },
      { id: `${code}-s3`, state: 'Micro-stop', durationSec: 60, startTimeLabel: t2, endTimeLabel: t3, jobRun: `LOT-A-${code}` },
      { id: `${code}-s4`, state: 'Stopped', durationSec: 84, startTimeLabel: t3, endTimeLabel: tNow, jobRun: `LOT-A-${code}` },
    ];
  } else if (operatingState === 'Micro-stop') {
    raw = [
      { id: `${code}-s1`, state: 'Setup', durationSec: 36, startTimeLabel: t0, endTimeLabel: t1, jobRun: `SETUP-${code}` },
      { id: `${code}-s2`, state: 'Running', durationSec: 120, startTimeLabel: t1, endTimeLabel: t2, jobRun: `LOT-A-${code}` },
      { id: `${code}-s3`, state: 'Running', durationSec: 60, startTimeLabel: t2, endTimeLabel: t3, jobRun: `LOT-A-${code}` },
      { id: `${code}-s4`, state: 'Micro-stop', durationSec: 84, startTimeLabel: t3, endTimeLabel: tNow, jobRun: `LOT-A-${code}` },
    ];
  } else {
    raw = [
      { id: `${code}-s1`, state: 'Setup', durationSec: 36, startTimeLabel: t0, endTimeLabel: t1, jobRun: `SETUP-${code}` },
      { id: `${code}-s2`, state: 'Running', durationSec: 120, startTimeLabel: t1, endTimeLabel: t2, jobRun: `LOT-A-${code}` },
      { id: `${code}-s3`, state: 'Micro-stop', durationSec: 24, startTimeLabel: t2, endTimeLabel: formatSimTimestamp(simClockMs - 120_000), jobRun: `LOT-A-${code}` },
      { id: `${code}-s4`, state: 'Running', durationSec: 120, startTimeLabel: formatSimTimestamp(simClockMs - 120_000), endTimeLabel: tNow, jobRun: `LOT-A-${code}` },
    ];
  }

  return normalizeTimelinePercentages(
    raw.map((r) => ({
      ...r,
      durationPct: 25,
    }))
  );
}

interface SeedSpec {
  queueLength: number;
  rejectedCount: number;
  cycleTime: number;
  utilization: number;
  downtime: number;
  temperature: number;
  defectRate: number;
  vibrationMmS: number;
  isBlocked: boolean;
  isStarved: boolean;
  operatingState: TimelineSegmentState;
}

/**
 * Constructs all 5 serial workstations with strict mass conservation:
 * - CNC-01.unitsEntered = rawMaterialReleased
 * - For each stage i:
 *     unitsProcessed = unitsEntered - queueLength
 *     unitsRejected  = rejectedCount
 *     unitsGood      = unitsProcessed - unitsRejected
 * - Downstream coupling:
 *     stage[i+1].unitsEntered === stage[i].unitsGood
 * This guarantees:
 *   rawMaterialReleased === sum(queueLength) + sum(unitsRejected) + PKG-05.unitsGood
 */
export function buildScenarioMachines(
  scenario: SimulationScenarioId,
  thresholds: FactoryThresholds = DEFAULT_FACTORY_THRESHOLDS,
  simClockMs: number = Date.now()
): MachineTelemetry[] {
  const plannedTimeMinutes = 320; // 5h 20m elapsed in current 8h (480m) shift

  let rawMaterialReleased = 468;
  let specs: Record<string, SeedSpec> = {
    'CNC-01': {
      queueLength: 9,
      rejectedCount: 4,
      cycleTime: 41.6,
      utilization: 81.5,
      downtime: 11,
      temperature: 56.4,
      defectRate: 0.87,
      vibrationMmS: 1.8,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Running',
    },
    'ASM-02': {
      queueLength: 10,
      rejectedCount: 4,
      cycleTime: 42.2,
      utilization: 80.4,
      downtime: 12,
      temperature: 44.8,
      defectRate: 0.90,
      vibrationMmS: 1.4,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Running',
    },
    'WLD-03': {
      queueLength: 8,
      rejectedCount: 4,
      cycleTime: 42.1,
      utilization: 79.8,
      downtime: 10,
      temperature: 56.5,
      defectRate: 0.95,
      vibrationMmS: 2.0,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Running',
    },
    'QC-04': {
      queueLength: 7,
      rejectedCount: 5,
      cycleTime: 41.2,
      utilization: 78.2,
      downtime: 8,
      temperature: 39.5,
      defectRate: 1.19,
      vibrationMmS: 0.9,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Running',
    },
    'PKG-05': {
      queueLength: 8,
      rejectedCount: 3,
      cycleTime: 40.9,
      utilization: 79.0,
      downtime: 9,
      temperature: 43.1,
      defectRate: 0.74,
      vibrationMmS: 1.5,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Running',
    },
  };

  if (scenario === 'cnc_overload') {
    rawMaterialReleased = 472;
    specs['CNC-01'] = {
      queueLength: 35,
      rejectedCount: 9,
      cycleTime: 49.6,
      utilization: 96.5,
      downtime: 28,
      temperature: 78.6,
      defectRate: 2.06,
      vibrationMmS: 4.2,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Micro-stop',
    };
    specs['ASM-02'] = {
      ...specs['ASM-02'],
      queueLength: 2,
      utilization: 66.4,
      isStarved: true,
      operatingState: 'Micro-stop',
    };
    specs['WLD-03'] = {
      ...specs['WLD-03'],
      queueLength: 2,
      utilization: 67.2,
      isStarved: true,
    };
    specs['QC-04'] = {
      ...specs['QC-04'],
      queueLength: 2,
      utilization: 65.5,
      isStarved: true,
    };
    specs['PKG-05'] = {
      ...specs['PKG-05'],
      queueLength: 2,
      utilization: 66.0,
      isStarved: true,
    };
  } else if (scenario === 'assembly_delay') {
    rawMaterialReleased = 470;
    specs['CNC-01'] = {
      ...specs['CNC-01'],
      queueLength: 26,
      utilization: 88.2,
      isBlocked: true,
      operatingState: 'Micro-stop',
    };
    specs['ASM-02'] = {
      queueLength: 33,
      rejectedCount: 10,
      cycleTime: 52.6,
      utilization: 95.2,
      downtime: 31,
      temperature: 64.5,
      defectRate: 2.43,
      vibrationMmS: 2.8,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Micro-stop',
    };
    specs['WLD-03'] = {
      ...specs['WLD-03'],
      queueLength: 4,
      utilization: 66.8,
      isStarved: true,
    };
    specs['QC-04'] = {
      ...specs['QC-04'],
      queueLength: 3,
      utilization: 65.4,
      isStarved: true,
    };
    specs['PKG-05'] = {
      ...specs['PKG-05'],
      queueLength: 3,
      utilization: 66.0,
      isStarved: true,
    };
  } else if (scenario === 'welding_failure') {
    rawMaterialReleased = 468;
    specs['CNC-01'] = {
      ...specs['CNC-01'],
      queueLength: 19,
      utilization: 85.4,
    };
    specs['ASM-02'] = {
      ...specs['ASM-02'],
      queueLength: 28,
      utilization: 87.6,
      isBlocked: true,
      operatingState: 'Micro-stop',
    };
    specs['WLD-03'] = {
      queueLength: 31,
      rejectedCount: 13,
      cycleTime: 56.2,
      utilization: 93.8,
      downtime: 46,
      temperature: 86.8,
      defectRate: 3.45,
      vibrationMmS: 4.9,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Stopped',
    };
    specs['QC-04'] = {
      ...specs['QC-04'],
      queueLength: 2,
      utilization: 60.4,
      isStarved: true,
    };
    specs['PKG-05'] = {
      ...specs['PKG-05'],
      queueLength: 2,
      utilization: 59.8,
      isStarved: true,
    };
  } else if (scenario === 'quality_overload') {
    rawMaterialReleased = 468;
    specs['WLD-03'] = {
      ...specs['WLD-03'],
      queueLength: 24,
      utilization: 86.8,
      isBlocked: true,
      operatingState: 'Micro-stop',
    };
    specs['QC-04'] = {
      queueLength: 29,
      rejectedCount: 15,
      cycleTime: 49.4,
      utilization: 94.4,
      downtime: 27,
      temperature: 58.4,
      defectRate: 3.65,
      vibrationMmS: 1.9,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Micro-stop',
    };
    specs['PKG-05'] = {
      ...specs['PKG-05'],
      queueLength: 3,
      utilization: 63.5,
      isStarved: true,
    };
  } else if (scenario === 'packaging_bottleneck') {
    rawMaterialReleased = 468;
    specs['QC-04'] = {
      ...specs['QC-04'],
      queueLength: 25,
      utilization: 87.2,
      isBlocked: true,
      operatingState: 'Micro-stop',
    };
    specs['PKG-05'] = {
      queueLength: 31,
      rejectedCount: 9,
      cycleTime: 54.0,
      utilization: 96.1,
      downtime: 34,
      temperature: 69.2,
      defectRate: 2.42,
      vibrationMmS: 3.1,
      isBlocked: false,
      isStarved: false,
      operatingState: 'Micro-stop',
    };
  }

  const stationMeta = [
    {
      id: 'CNC-01',
      code: 'CNC-01',
      name: 'CNC Milling & Turning Center',
      shortName: 'CNC Machining',
      stageOrder: 1,
      jobCode: 'LOT-A-CNC-01',
      bufferCapacity: 34,
      tempWarningLimit: 72,
      tempCriticalLimit: 82,
      operatorCount: 5,
      powerKw: 44.2,
    },
    {
      id: 'ASM-02',
      code: 'ASM-02',
      name: 'Robotic Assembly Station',
      shortName: 'Assembly',
      stageOrder: 2,
      jobCode: 'LOT-A-ASM-02',
      bufferCapacity: 32,
      tempWarningLimit: 68,
      tempCriticalLimit: 78,
      operatorCount: 7,
      powerKw: 28.6,
    },
    {
      id: 'WLD-03',
      code: 'WLD-03',
      name: 'Precision Laser Welding Cell',
      shortName: 'Welding',
      stageOrder: 3,
      jobCode: 'LOT-A-WLD-03',
      bufferCapacity: 30,
      tempWarningLimit: 74,
      tempCriticalLimit: 84,
      operatorCount: 4,
      powerKw: 62.5,
    },
    {
      id: 'QC-04',
      code: 'QC-04',
      name: 'Quality Laser Inspection Station',
      shortName: 'Quality Control',
      stageOrder: 4,
      jobCode: 'LOT-A-QC-04',
      bufferCapacity: 30,
      tempWarningLimit: 62,
      tempCriticalLimit: 72,
      operatorCount: 4,
      powerKw: 16.4,
    },
    {
      id: 'PKG-05',
      code: 'PKG-05',
      name: 'Automated Packaging Cell',
      shortName: 'Packaging',
      stageOrder: 5,
      jobCode: 'LOT-A-PKG-05',
      bufferCapacity: 30,
      tempWarningLimit: 66,
      tempCriticalLimit: 76,
      operatorCount: 4,
      powerKw: 22.8,
    },
  ];

  const built: MachineTelemetry[] = [];
  let incomingUnits = rawMaterialReleased;

  for (const meta of stationMeta) {
    const sp = specs[meta.id];
    const unitsEntered = incomingUnits;
    const queueLength = Math.min(unitsEntered, sp.queueLength);
    const unitsProcessed = Math.max(0, unitsEntered - queueLength);
    const unitsRejected = Math.min(unitsProcessed, sp.rejectedCount);
    const unitsGood = Math.max(0, unitsProcessed - unitsRejected);

    // Next station strictly receives conforming good units from this station!
    incomingUnits = unitsGood;

    const exactDefectPct =
      unitsProcessed > 0
        ? Number(((unitsRejected / unitsProcessed) * 100).toFixed(2))
        : sp.defectRate;
    const effectiveDefect = Math.max(sp.defectRate, exactDefectPct);

    const oeeMetrics = computeMachineOEE({
      downtimeMinutes: sp.downtime,
      plannedTimeMinutes,
      actualCycleTime: sp.cycleTime,
      targetCycleTime: thresholds.nominalTaktSeconds,
      unitsGood,
      unitsProcessed,
      defectRatePct: effectiveDefect,
    });

    const prodRate = sp.operatingState === 'Stopped'
      ? 0
      : Math.round((3600 / sp.cycleTime) * (sp.isStarved ? 0.82 : 1));

    const draft: MachineTelemetry = {
      id: meta.id,
      code: meta.code,
      name: meta.name,
      shortName: meta.shortName,
      stageOrder: meta.stageOrder,
      line: 'Line A',
      jobCode: meta.jobCode,
      status: 'Normal',
      operatingState: sp.operatingState,
      productionRate: prodRate,
      cycleTime: sp.cycleTime,
      targetCycleTime: thresholds.nominalTaktSeconds,
      utilization: sp.utilization,
      plannedTimeMinutes,
      downtime: sp.downtime,
      queueLength,
      bufferCapacity: meta.bufferCapacity,
      unitsEntered,
      unitsProcessed,
      unitsGood,
      unitsRejected,
      targetDemand: thresholds.shiftTargetUnits,
      temperature: sp.temperature,
      tempWarningLimit: meta.tempWarningLimit,
      tempCriticalLimit: meta.tempCriticalLimit,
      defectRate: effectiveDefect,
      vibrationMmS: sp.vibrationMmS,
      isBlocked: sp.isBlocked,
      isStarved: sp.isStarved,
      operatorCount: meta.operatorCount,
      powerKw: meta.powerKw,
      ...oeeMetrics,
      timeline: makeBaselineTimeline(meta.code, sp.operatingState, simClockMs),
    };

    const pred = evaluateMachineBottleneck(draft, thresholds);
    draft.status = deriveOperationalStatus(draft, pred.riskScore, thresholds);
    built.push(draft);
  }

  return built;
}

/**
 * Builds sequential, non-repeating initial time-series points spaced at exact SIM_STEP_MS (2.4s) intervals
 * ending at `simClockMs`, ensuring smooth continuity with subsequent live simulation ticks.
 */
export function buildInitialTimeSeries(
  machines: MachineTelemetry[],
  thresholds: FactoryThresholds,
  simClockMs: number = Date.now()
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const preds = evaluateAllPredictions(machines, thresholds);
  const kpis = calculateFactoryKPIs(machines, preds, thresholds);
  const currentMaxRisk = preds[0]?.riskScore ?? 24;

  const cnc = machines.find((m) => m.id === 'CNC-01')!;
  const asm = machines.find((m) => m.id === 'ASM-02')!;
  const wld = machines.find((m) => m.id === 'WLD-03')!;
  const qc = machines.find((m) => m.id === 'QC-04')!;
  const pkg = machines.find((m) => m.id === 'PKG-05')!;

  const totalSteps = 14;
  const expectedNow = Math.round(
    thresholds.shiftTargetUnits * (cnc.plannedTimeMinutes / thresholds.shiftDurationMinutes)
  );

  for (let i = totalSteps - 1; i >= 0; i--) {
    const pointClockMs = simClockMs - i * SIM_STEP_MS;
    const wave = i === 0 ? 0 : Math.sin(i * 0.7);

    // Monotonic non-decreasing historical output ending at exact `kpis.totalOutput`
    const actualOut = Math.max(0, kpis.totalOutput - Math.floor(i * 0.75));
    const plannedOut = Math.max(0, expectedNow - Math.floor(i * 0.8));

    points.push({
      timestamp: formatSimTimestamp(pointClockMs),
      simClockMs: pointClockMs,
      plannedOutput: plannedOut,
      actualOutput: actualOut,
      totalRejected: kpis.totalRejectedAllStages,
      avgUtilization:
        i === 0
          ? kpis.avgUtilization
          : Number((kpis.avgUtilization + wave * 1.1).toFixed(1)),
      avgCycleTime:
        i === 0
          ? kpis.avgCycleTime
          : Number((kpis.avgCycleTime + wave * 0.4).toFixed(1)),
      totalQueue:
        i === 0
          ? kpis.totalWipInSystem
          : Math.max(5, Math.round(kpis.totalWipInSystem - i * (currentMaxRisk >= 60 ? 0.6 : 0))),
      fleetOee: kpis.fleetOee,
      maxRiskScore:
        i === 0
          ? currentMaxRisk
          : Math.round(Math.max(12, currentMaxRisk - i * (currentMaxRisk >= 60 ? 1.1 : 0.2))),
      cncUtil: Number((cnc.utilization + wave * 0.9).toFixed(1)),
      asmUtil: Number((asm.utilization - wave * 0.8).toFixed(1)),
      wldUtil: Number((wld.utilization + wave * 1.1).toFixed(1)),
      qcUtil: Number((qc.utilization - wave * 0.7).toFixed(1)),
      pkgUtil: Number((pkg.utilization + wave * 0.8).toFixed(1)),
      cncCycle: Number((cnc.cycleTime + wave * 0.3).toFixed(1)),
      asmCycle: Number((asm.cycleTime - wave * 0.3).toFixed(1)),
      wldCycle: Number((wld.cycleTime + wave * 0.4).toFixed(1)),
      qcCycle: Number((qc.cycleTime - wave * 0.2).toFixed(1)),
      pkgCycle: Number((pkg.cycleTime + wave * 0.3).toFixed(1)),
      velocityUph: pkg.productionRate,
    });
  }

  return points;
}

export const INITIAL_DOWNTIME_PARETO: DowntimeCauseItem[] = [
  {
    reason: 'Carbide Tool Insert Changeover & Calibration',
    minutes: 11,
    occurrences: 4,
    station: 'CNC-01',
    sharePct: 20.4,
  },
  {
    reason: 'Electrode Tip Thermal Cooldown & Dressing',
    minutes: 14,
    occurrences: 3,
    station: 'WLD-03',
    sharePct: 25.9,
  },
  {
    reason: 'Sub-Assembly Fastener Feeder Micro-Stop',
    minutes: 12,
    occurrences: 6,
    station: 'ASM-02',
    sharePct: 22.2,
  },
  {
    reason: 'End-of-Line Carton Film Tension Re-thread',
    minutes: 9,
    occurrences: 2,
    station: 'PKG-05',
    sharePct: 16.7,
  },
  {
    reason: 'Optical Metrology Reference Re-zeroing',
    minutes: 8,
    occurrences: 3,
    station: 'QC-04',
    sharePct: 14.8,
  },
];

export function generateInitialProductionRecords(
  machines: MachineTelemetry[],
  thresholds: FactoryThresholds
): ProductionRecordRow[] {
  const rows: ProductionRecordRow[] = [];
  const shifts: ('Shift 1' | 'Shift 2' | 'Shift 3')[] = ['Shift 1', 'Shift 2', 'Shift 3'];
  const lines: ('Line A' | 'Line B' | 'Line C')[] = ['Line A', 'Line B', 'Line C'];
  const dates = ['2026-10-31', '2026-10-30', '2026-10-29'];

  // First 5 rows are exact live Line A Shift 1 records matching current machines
  for (let idx = 0; idx < machines.length; idx++) {
    const m = machines[idx];
    const pred = evaluateMachineBottleneck(m, thresholds);
    rows.push({
      recordId: `LIVE-${m.code}`,
      timestamp: `2026-10-31 11:15:0${idx}`,
      date: '2026-10-31',
      shift: 'Shift 1',
      line: 'Line A',
      machineId: m.id,
      machineName: m.name,
      utilization: m.utilization,
      cycleTime: m.cycleTime,
      queueLength: m.queueLength,
      downtime: m.downtime,
      temperature: m.temperature,
      defectRate: m.defectRate,
      unitsEntered: m.unitsEntered,
      unitsProcessed: m.unitsProcessed,
      unitsGood: m.unitsGood,
      unitsRejected: m.unitsRejected,
      oee: m.oee,
      riskScore: pred.riskScore,
      riskClassification: pred.classification,
      anomalyFlag: pred.riskScore >= 65 || m.temperature >= m.tempWarningLimit,
    });
  }

  let recNum = 101;
  for (const date of dates) {
    for (let s = 0; s < shifts.length; s++) {
      if (date === '2026-10-31' && s === 0) continue; // Already represented by live Shift 1 above
      for (const m of machines) {
        const line = lines[(recNum + s) % lines.length];
        const utilOffset = (s - 1) * 2.8 + (date === '2026-10-31' ? 0 : -2.0);
        const utilization = Number(Math.min(99, Math.max(58, m.utilization + utilOffset)).toFixed(1));
        const cycleTime = Number(Math.max(35, m.cycleTime + (s - 1) * 0.9).toFixed(1));
        const queueLength = Math.max(2, Math.round(m.queueLength + (s - 1) * 2));
        const downtime = Number(Math.max(3, m.downtime + (s - 1) * 2.5).toFixed(1));
        const temperature = Number((m.temperature + (s - 1) * 1.5).toFixed(1));
        const unitsProcessed = Math.max(180, Math.round(m.unitsProcessed - s * 22));
        const unitsRejected = Math.max(1, Math.round(unitsProcessed * (m.defectRate / 100)));
        const unitsGood = Math.max(0, unitsProcessed - unitsRejected);
        const unitsEntered = unitsProcessed + queueLength;
        const defectRate = Number(((unitsRejected / unitsProcessed) * 100).toFixed(2));

        const oeeObj = computeMachineOEE({
          downtimeMinutes: downtime,
          plannedTimeMinutes: 320,
          actualCycleTime: cycleTime,
          targetCycleTime: m.targetCycleTime,
          unitsGood,
          unitsProcessed,
          defectRatePct: defectRate,
        });

        const syntheticMachine: MachineTelemetry = {
          ...m,
          line,
          utilization,
          cycleTime,
          queueLength,
          downtime,
          temperature,
          defectRate,
          unitsEntered,
          unitsProcessed,
          unitsGood,
          unitsRejected,
          ...oeeObj,
        };
        const pred = evaluateMachineBottleneck(syntheticMachine, thresholds);

        rows.push({
          recordId: `REC-${recNum}`,
          timestamp: `${date} ${String(6 + s * 8).padStart(2, '0')}:30:00`,
          date,
          shift: shifts[s],
          line,
          machineId: m.id,
          machineName: m.name,
          utilization,
          cycleTime,
          queueLength,
          downtime,
          temperature,
          defectRate,
          unitsEntered,
          unitsProcessed,
          unitsGood,
          unitsRejected,
          oee: oeeObj.oee,
          riskScore: pred.riskScore,
          riskClassification: pred.classification,
          anomalyFlag: pred.riskScore >= 65 || temperature >= m.tempWarningLimit,
        });
        recNum++;
      }
    }
  }

  return rows;
}

export const SAMPLE_CSV_CONTENT = `recordId,timestamp,date,shift,line,machineId,machineName,utilization,cycleTime,queueLength,downtime,temperature,defectRate,unitsProcessed,unitsRejected
CSV-901,2026-10-31 11:20:00,2026-10-31,Shift 1,Line A,CNC-01,CNC Milling & Turning Center,95.4,49.8,34,29,77.5,2.08,452,9
CSV-902,2026-10-31 11:20:02,2026-10-31,Shift 1,Line A,ASM-02,Robotic Assembly Station,82.1,42.5,11,12,46.2,0.91,432,4
CSV-903,2026-10-31 11:20:04,2026-10-31,Shift 1,Line A,WLD-03,Precision Laser Welding Cell,89.6,46.4,21,26,75.8,1.90,407,8
CSV-904,2026-10-31 11:20:06,2026-10-31,Shift 1,Line A,QC-04,Quality Laser Inspection Station,77.4,41.1,8,7,39.8,1.28,391,5
CSV-905,2026-10-31 11:20:08,2026-10-31,Shift 1,Line A,PKG-05,Automated Packaging Cell,79.8,40.8,7,9,43.0,0.79,379,3`;
