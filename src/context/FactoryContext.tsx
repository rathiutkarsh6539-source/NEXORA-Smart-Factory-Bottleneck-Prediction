import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_FACTORY_THRESHOLDS,
  INITIAL_DOWNTIME_PARETO,
  buildInitialTimeSeries,
  buildScenarioMachines,
  formatSimTimestamp,
  generateInitialProductionRecords,
  normalizeTimelinePercentages,
} from '../data/initialFactoryData';
import {
  DowntimeCauseItem,
  FactoryAlert,
  FactoryKPIs,
  FactoryThresholds,
  MachinePredictionResult,
  MachineTelemetry,
  NavigationPage,
  ProductionRecordRow,
  SimulationScenarioId,
  SimulationSpeed,
  TimeSeriesPoint,
  TimelineSegmentState,
} from '../types/factory';
import {
  calculateFactoryKPIs,
  clamp,
  computeMachineOEE,
  deriveOperationalStatus,
  evaluateAllPredictions,
  evaluateMachineBottleneck,
  safeNumber,
} from '../utils/bottleneckEngine';
import {
  stepFactorySimulation,
  synchronizeAlertsFromTelemetry,
} from '../utils/simulationEngine';

export interface CsvUploadReport {
  success: boolean;
  rowsImported: number;
  rowsRejected: number;
  anomaliesDetected: number;
  message: string;
}

interface AtomicSimState {
  machines: MachineTelemetry[];
  simClockMs: number;
  timeSeries: TimeSeriesPoint[];
  tickCount: number;
}

interface FactoryContextValue {
  activePage: NavigationPage;
  setActivePage: (page: NavigationPage) => void;
  telemetrySourceMode: 'SIMULATED';
  simClockMs: number;
  simClockFormatted: string;
  machines: MachineTelemetry[];
  predictions: MachinePredictionResult[];
  kpis: FactoryKPIs;
  thresholds: FactoryThresholds;
  updateThresholds: (partial: Partial<FactoryThresholds>) => void;
  resetThresholds: () => void;
  isRunning: boolean;
  toggleSimulation: () => void;
  setSimulationRunning: (running: boolean) => void;
  simulationSpeed: SimulationSpeed;
  setSimulationSpeed: (speed: SimulationSpeed) => void;
  scenario: SimulationScenarioId;
  selectScenario: (scenario: SimulationScenarioId) => void;
  triggerMachineSetup: (machineId: string) => void;
  resetSimulation: () => void;
  alerts: FactoryAlert[];
  activeAlertCount: number;
  acknowledgeAlert: (alertId: string) => void;
  resolveAlert: (alertId: string) => void;
  executeAlertMitigation: (alertId: string) => void;
  applyMachineMitigation: (machineId: string, recommendationId?: string) => void;
  appliedRecommendationIds: string[];
  updateMachineParameter: (
    machineId: string,
    updates: Partial<
      Pick<
        MachineTelemetry,
        'utilization' | 'cycleTime' | 'queueLength' | 'temperature' | 'defectRate' | 'downtime'
      >
    >
  ) => void;
  timeSeries: TimeSeriesPoint[];
  downtimePareto: DowntimeCauseItem[];
  productionRecords: ProductionRecordRow[];
  uploadCsvDataset: (csvText: string) => CsvUploadReport;
  exportRecordsCsv: () => string;
  globalSearchQuery: string;
  setGlobalSearchQuery: (q: string) => void;
  selectedFocusMachineId: string | null;
  setSelectedFocusMachineId: (id: string | null) => void;
  tickCount: number;
}

const FactoryContext = createContext<FactoryContextValue | undefined>(undefined);

function createInitialSimState(
  scenario: SimulationScenarioId,
  thresholds: FactoryThresholds
): AtomicSimState {
  const startClock = Date.now();
  const machines = buildScenarioMachines(scenario, thresholds, startClock);
  const timeSeries = buildInitialTimeSeries(machines, thresholds, startClock);
  return {
    machines,
    simClockMs: startClock,
    timeSeries,
    tickCount: 0,
  };
}

/**
 * Conserves mass across the 5 serial stations when mitigating a bottleneck station:
 * Excess WIP drained from `targetId` is processed as conforming units and cascaded cleanly
 * down the line so `rawMaterialReleased === sum(WIP) + sum(Rejected) + FinishedGoods` always holds.
 */
export function rebalanceStationWithMassConservation(
  prevMachines: MachineTelemetry[],
  targetId: string,
  thresholds: FactoryThresholds,
  simClockMs: number
): MachineTelemetry[] {
  const ordered = [...prevMachines]
    .sort((a, b) => a.stageOrder - b.stageOrder)
    .map((m) => ({ ...m, timeline: m.timeline.map((s) => ({ ...s })) }));

  const targetIdx = ordered.findIndex((m) => m.id === targetId);
  if (targetIdx === -1) return ordered;

  const target = ordered[targetIdx];
  const desiredQueue = Math.min(9, target.queueLength);
  let carryForwardGood = Math.max(0, target.queueLength - desiredQueue);

  for (let i = targetIdx; i < ordered.length; i++) {
    const st = ordered[i];
    if (i === targetIdx) {
      st.unitsProcessed += carryForwardGood;
      st.unitsGood += carryForwardGood;
      st.queueLength = Math.max(0, st.unitsEntered - st.unitsProcessed);
    } else {
      st.unitsEntered += carryForwardGood;
      const currentQ = st.unitsEntered - st.unitsProcessed;
      // Keep downstream buffers healthy (around <= 10 units) and forward excess to warehouse
      const targetDownstreamQ = Math.min(10, currentQ);
      const passFurther = Math.max(0, currentQ - targetDownstreamQ);
      st.unitsProcessed += passFurther;
      st.unitsGood += passFurther;
      st.queueLength = Math.max(0, st.unitsEntered - st.unitsProcessed);
      carryForwardGood = passFurther;
    }
  }

  return ordered.map((m) => {
    const isTarget = m.id === targetId;
    const nextCycle = isTarget ? thresholds.nominalTaktSeconds - 0.5 : m.cycleTime;
    const nextUtil = isTarget ? 74.5 : Math.min(m.utilization, 82.0);
    const nextTemp = isTarget ? Math.min(m.temperature, 49.5) : m.temperature;
    const nextDowntime = isTarget ? Math.min(m.downtime, 10) : m.downtime;
    const exactDefect =
      isTarget
        ? 0.85
        : m.unitsProcessed > 0
        ? Number(((m.unitsRejected / m.unitsProcessed) * 100).toFixed(2))
        : m.defectRate;

    const oeeStats = computeMachineOEE({
      downtimeMinutes: nextDowntime,
      plannedTimeMinutes: m.plannedTimeMinutes,
      actualCycleTime: nextCycle,
      targetCycleTime: thresholds.nominalTaktSeconds,
      unitsGood: m.unitsGood,
      unitsProcessed: m.unitsProcessed,
      defectRatePct: exactDefect,
    });

    const updated: MachineTelemetry = {
      ...m,
      cycleTime: Number(nextCycle.toFixed(1)),
      utilization: Number(nextUtil.toFixed(1)),
      temperature: Number(nextTemp.toFixed(1)),
      downtime: Number(nextDowntime.toFixed(1)),
      defectRate: exactDefect,
      productionRate: Math.round(3600 / nextCycle),
      isBlocked: false,
      isStarved: false,
      operatingState: 'Running',
      status: 'Normal',
      ...oeeStats,
    };

    const pred = evaluateMachineBottleneck(updated, thresholds);
    updated.status = deriveOperationalStatus(updated, pred.riskScore, thresholds);

    if (isTarget && updated.timeline.length > 0) {
      const stamp = formatSimTimestamp(simClockMs);
      updated.timeline = normalizeTimelinePercentages([
        ...updated.timeline.slice(-11),
        {
          id: `${updated.code}-reb-${simClockMs}`,
          state: 'Running',
          durationSec: 12,
          durationPct: 0,
          startTimeLabel: stamp,
          endTimeLabel: stamp,
          jobRun: updated.jobCode,
        },
      ]);
    }
    return updated;
  });
}

export const FactoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePage, setActivePage] = useState<NavigationPage>('dashboard');
  const [thresholds, setThresholds] = useState<FactoryThresholds>(DEFAULT_FACTORY_THRESHOLDS);
  const [scenario, setScenario] = useState<SimulationScenarioId>('normal');
  const [simState, setSimState] = useState<AtomicSimState>(() =>
    createInitialSimState('normal', DEFAULT_FACTORY_THRESHOLDS)
  );
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>(1);
  const [appliedRecommendationIds, setAppliedRecommendationIds] = useState<string[]>([]);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [selectedFocusMachineId, setSelectedFocusMachineId] = useState<string | null>(null);

  const mitigatedStationsRef = useRef<Set<string>>(new Set());
  const setupTicksMapRef = useRef<Map<string, number>>(new Map());

  const [alerts, setAlerts] = useState<FactoryAlert[]>(() => {
    const initStamp = formatSimTimestamp(Date.now() - 48_000);
    return [
      {
        id: 'ALT-THERM-DRIFT-WLD-03',
        machineId: 'WLD-03',
        machineName: 'Precision Laser Welding Cell',
        severity: 'Warning',
        status: 'acknowledged',
        timestamp: initStamp,
        updatedAt: initStamp,
        triggerMetric: 'Pre-Shift Coolant Check',
        currentValue: '61.2°C nominal',
        thresholdValue: '74.0°C warn',
        description:
          'Scheduled thermal verification logged on WLD-03 weld head during Shift 1 lot initialization.',
        rootCauseHypothesis: 'Secondary chiller flow valve calibrated to 85% nominal duty.',
        recommendedAction: 'Monitor closed-loop coolant temperature across high-load batches.',
        mitigationType: 'thermal_cooldown',
      },
    ];
  });

  const [historicalAndUploadedRecords, setHistoricalAndUploadedRecords] = useState<
    ProductionRecordRow[]
  >(() =>
    generateInitialProductionRecords(
      buildScenarioMachines('normal', DEFAULT_FACTORY_THRESHOLDS),
      DEFAULT_FACTORY_THRESHOLDS
    ).filter((r) => !r.recordId.startsWith('LIVE-'))
  );

  const { machines, simClockMs, timeSeries, tickCount } = simState;

  const predictions = useMemo(
    () => evaluateAllPredictions(machines, thresholds),
    [machines, thresholds]
  );

  const kpis = useMemo(
    () => calculateFactoryKPIs(machines, predictions, thresholds),
    [machines, predictions, thresholds]
  );

  // Centralized Downtime Pareto derived directly from live `machines` downtime minutes
  const downtimePareto: DowntimeCauseItem[] = useMemo(() => {
    const totalDt = Math.max(
      1,
      machines.reduce((acc, m) => acc + m.downtime, 0)
    );
    return INITIAL_DOWNTIME_PARETO.map((item) => {
      const station = machines.find((m) => m.id === item.station);
      const minutes = station ? Number(station.downtime.toFixed(1)) : item.minutes;
      return {
        ...item,
        minutes,
        sharePct: Number(((minutes / totalDt) * 100).toFixed(1)),
      };
    }).sort((a, b) => b.minutes - a.minutes);
  }, [machines]);

  // Centralized Production Records: Top 5 rows always reflect live Line A Shift 1 machines
  const productionRecords: ProductionRecordRow[] = useMemo(() => {
    const stampDate = '2026-10-31';
    const stampTime = formatSimTimestamp(simClockMs);
    const liveRows: ProductionRecordRow[] = machines.map((m) => {
      const pred = predictions.find((p) => p.machineId === m.id);
      const riskScore = pred?.riskScore ?? 20;
      const riskClassification = pred?.classification ?? 'LOW';
      return {
        recordId: `LIVE-${m.code}`,
        timestamp: `${stampDate} ${stampTime}`,
        date: stampDate,
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
        riskScore,
        riskClassification,
        anomalyFlag: riskScore >= 65 || m.temperature >= m.tempWarningLimit,
      };
    });
    return [...liveRows, ...historicalAndUploadedRecords];
  }, [machines, predictions, simClockMs, historicalAndUploadedRecords]);

  // Synchronize alerts whenever machines or thresholds update
  useEffect(() => {
    setAlerts((prev) =>
      synchronizeAlertsFromTelemetry(prev, machines, predictions, thresholds, simClockMs)
    );
  }, [machines, predictions, thresholds, simClockMs]);

  // Real-time simulation interval loop
  useEffect(() => {
    if (!isRunning) return;

    const wallIntervalMs = simulationSpeed === 5 ? 480 : simulationSpeed === 2 ? 1200 : 2400;

    const timer = window.setInterval(() => {
      const activeSetupSet = new Set<string>();
      setupTicksMapRef.current.forEach((remaining, stationId) => {
        if (remaining > 0) {
          activeSetupSet.add(stationId);
          if (remaining - 1 <= 0) {
            setupTicksMapRef.current.delete(stationId);
          } else {
            setupTicksMapRef.current.set(stationId, remaining - 1);
          }
        }
      });

      setSimState((prev) => {
        const nextStep = stepFactorySimulation({
          prevMachines: prev.machines,
          prevSimClockMs: prev.simClockMs,
          scenario,
          thresholds,
          mitigatedStationIds: mitigatedStationsRef.current,
          setupStationIds: activeSetupSet,
        });

        return {
          machines: nextStep.machines,
          simClockMs: nextStep.simClockMs,
          timeSeries: [...prev.timeSeries.slice(-17), nextStep.newTimeSeriesPoint],
          tickCount: prev.tickCount + 1,
        };
      });
    }, wallIntervalMs);

    return () => window.clearInterval(timer);
  }, [isRunning, simulationSpeed, scenario, thresholds]);

  const selectScenario = useCallback(
    (nextScenario: SimulationScenarioId) => {
      mitigatedStationsRef.current.clear();
      setupTicksMapRef.current.clear();
      setAppliedRecommendationIds([]);
      setScenario(nextScenario);

      const switchStamp = formatSimTimestamp(simClockMs + 2400);
      setAlerts((currAlerts) =>
        currAlerts.map((a) =>
          a.status === 'active' ? { ...a, status: 'resolved', updatedAt: switchStamp } : a
        )
      );

      setSimState((prev) => {
        const nextClock = prev.simClockMs + 2400;
        const nextMachines = buildScenarioMachines(nextScenario, thresholds, nextClock);
        const nextSeries = buildInitialTimeSeries(nextMachines, thresholds, nextClock);
        return {
          machines: nextMachines,
          simClockMs: nextClock,
          timeSeries: nextSeries,
          tickCount: prev.tickCount + 1,
        };
      });
    },
    [thresholds, simClockMs]
  );

  const triggerMachineSetup = useCallback((machineId: string) => {
    setupTicksMapRef.current.set(machineId, 3);
    setSimState((prev) => {
      const nextClock = prev.simClockMs + 2400;
      const stamp = formatSimTimestamp(nextClock);
      const updatedMachines = prev.machines.map((m) => {
        if (m.id !== machineId) return m;
        const nextTimeline = normalizeTimelinePercentages([
          ...m.timeline.slice(-11),
          {
            id: `${m.code}-setup-${nextClock}`,
            state: 'Setup' as TimelineSegmentState,
            durationSec: 7.2,
            durationPct: 0,
            startTimeLabel: formatSimTimestamp(prev.simClockMs),
            endTimeLabel: stamp,
            jobRun: `SETUP-${m.code}`,
          },
        ]);
        return {
          ...m,
          operatingState: 'Setup' as TimelineSegmentState,
          productionRate: 0,
          timeline: nextTimeline,
        };
      });
      return {
        ...prev,
        machines: updatedMachines,
        simClockMs: nextClock,
      };
    });
  }, []);

  const resetSimulation = useCallback(() => {
    mitigatedStationsRef.current.clear();
    setupTicksMapRef.current.clear();
    setAppliedRecommendationIds([]);
    setScenario('normal');
    setSimulationSpeed(1);
    setIsRunning(true);
    const fresh = createInitialSimState('normal', thresholds);
    setSimState(fresh);
    const resetStamp = formatSimTimestamp(fresh.simClockMs);
    setAlerts((prev) =>
      prev.map((a) =>
        a.status === 'active' ? { ...a, status: 'resolved', updatedAt: resetStamp } : a
      )
    );
  }, [thresholds]);

  const toggleSimulation = useCallback(() => {
    setIsRunning((r) => !r);
  }, []);

  const setSimulationRunning = useCallback((running: boolean) => {
    setIsRunning(running);
  }, []);

  const updateThresholds = useCallback(
    (partial: Partial<FactoryThresholds>) => {
      const merged = { ...thresholds, ...partial };
      setThresholds(merged);
      setSimState((currSim) => {
        const recalibrated = currSim.machines.map((m) => {
          const oeeStats = computeMachineOEE({
            downtimeMinutes: m.downtime,
            plannedTimeMinutes: m.plannedTimeMinutes,
            actualCycleTime: m.cycleTime,
            targetCycleTime: merged.nominalTaktSeconds,
            unitsGood: m.unitsGood,
            unitsProcessed: m.unitsProcessed,
            defectRatePct: m.defectRate,
          });
          const draft: MachineTelemetry = {
            ...m,
            targetCycleTime: merged.nominalTaktSeconds,
            targetDemand: merged.shiftTargetUnits,
            ...oeeStats,
          };
          const pred = evaluateMachineBottleneck(draft, merged);
          draft.status = deriveOperationalStatus(draft, pred.riskScore, merged);
          return draft;
        });
        return {
          ...currSim,
          machines: recalibrated,
        };
      });
    },
    [thresholds]
  );

  const resetThresholds = useCallback(() => {
    updateThresholds(DEFAULT_FACTORY_THRESHOLDS);
  }, [updateThresholds]);

  const applyMachineMitigation = useCallback(
    (machineId: string, recommendationId?: string) => {
      mitigatedStationsRef.current.add(machineId);
      if (recommendationId) {
        setAppliedRecommendationIds((prev) =>
          prev.includes(recommendationId) ? prev : [...prev, recommendationId]
        );
      }

      setSimState((prev) => {
        const nextClock = prev.simClockMs + 2400;
        const nextMachines = rebalanceStationWithMassConservation(
          prev.machines,
          machineId,
          thresholds,
          nextClock
        );
        const preds = evaluateAllPredictions(nextMachines, thresholds);
        const updatedKpis = calculateFactoryKPIs(nextMachines, preds, thresholds);
        const cnc = nextMachines[0];
        const asm = nextMachines[1];
        const wld = nextMachines[2];
        const qc = nextMachines[3];
        const pkg = nextMachines[4];

        const pt: TimeSeriesPoint = {
          timestamp: formatSimTimestamp(nextClock),
          simClockMs: nextClock,
          plannedOutput: Math.round(
            thresholds.shiftTargetUnits *
              clamp(cnc.plannedTimeMinutes / thresholds.shiftDurationMinutes, 0.1, 1)
          ),
          actualOutput: updatedKpis.totalOutput,
          totalRejected: updatedKpis.totalRejectedAllStages,
          avgUtilization: updatedKpis.avgUtilization,
          avgCycleTime: updatedKpis.avgCycleTime,
          totalQueue: updatedKpis.totalWipInSystem,
          fleetOee: updatedKpis.fleetOee,
          maxRiskScore: updatedKpis.maxBottleneckRisk,
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
          machines: nextMachines,
          simClockMs: nextClock,
          timeSeries: [...prev.timeSeries.slice(-17), pt],
          tickCount: prev.tickCount + 1,
        };
      });

      const nowStr = formatSimTimestamp(simClockMs);
      setAlerts((prev) =>
        prev.map((a) =>
          a.machineId === machineId && a.status !== 'resolved'
            ? { ...a, status: 'resolved', updatedAt: nowStr }
            : a
        )
      );
    },
    [thresholds, simClockMs]
  );

  const acknowledgeAlert = useCallback(
    (alertId: string) => {
      const nowStr = formatSimTimestamp(simClockMs);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId && a.status === 'active'
            ? { ...a, status: 'acknowledged', updatedAt: nowStr }
            : a
        )
      );
    },
    [simClockMs]
  );

  const resolveAlert = useCallback(
    (alertId: string) => {
      const nowStr = formatSimTimestamp(simClockMs);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: 'resolved', updatedAt: nowStr } : a))
      );
    },
    [simClockMs]
  );

  const executeAlertMitigation = useCallback(
    (alertId: string) => {
      const target = alerts.find((a) => a.id === alertId);
      if (target) {
        applyMachineMitigation(target.machineId);
      }
      resolveAlert(alertId);
    },
    [alerts, applyMachineMitigation, resolveAlert]
  );

  const updateMachineParameter = useCallback(
    (
      machineId: string,
      updates: Partial<
        Pick<
          MachineTelemetry,
          'utilization' | 'cycleTime' | 'queueLength' | 'temperature' | 'defectRate' | 'downtime'
        >
      >
    ) => {
      setSimState((prev) => {
        const ordered = [...prev.machines]
          .sort((a, b) => a.stageOrder - b.stageOrder)
          .map((m) => ({ ...m }));
        const idx = ordered.findIndex((m) => m.id === machineId);
        if (idx === -1) return prev;

        const target = ordered[idx];

        // Maintain strict serial mass balance if queueLength is manually adjusted
        if (updates.queueLength !== undefined) {
          const desiredQ = Math.max(0, Math.round(updates.queueLength));
          const deltaQ = desiredQ - target.queueLength;
          if (deltaQ > 0) {
            // Stage +deltaQ raw units seamlessly up to `idx`'s input buffer
            for (let j = 0; j <= idx; j++) {
              ordered[j].unitsEntered += deltaQ;
              if (j < idx) {
                ordered[j].unitsProcessed += deltaQ;
                ordered[j].unitsGood += deltaQ;
              }
              ordered[j].queueLength = Math.max(
                0,
                ordered[j].unitsEntered - ordered[j].unitsProcessed
              );
            }
          } else if (deltaQ < 0) {
            // Drain -deltaQ units forward from `idx` down through `PKG-05`
            const drain = Math.min(target.queueLength, -deltaQ);
            for (let j = idx; j < ordered.length; j++) {
              if (j === idx) {
                ordered[j].unitsProcessed += drain;
                ordered[j].unitsGood += drain;
              } else {
                ordered[j].unitsEntered += drain;
                ordered[j].unitsProcessed += drain;
                ordered[j].unitsGood += drain;
              }
              ordered[j].queueLength = Math.max(
                0,
                ordered[j].unitsEntered - ordered[j].unitsProcessed
              );
            }
          }
        }

        const nextCycle =
          updates.cycleTime !== undefined ? clamp(updates.cycleTime, 25, 75) : target.cycleTime;
        const nextUtil =
          updates.utilization !== undefined
            ? clamp(updates.utilization, 30, 99.5)
            : target.utilization;
        const nextTemp =
          updates.temperature !== undefined
            ? clamp(updates.temperature, 25, 98)
            : target.temperature;
        const nextDefect =
          updates.defectRate !== undefined
            ? clamp(updates.defectRate, 0.1, 12)
            : target.defectRate;
        const nextDowntime =
          updates.downtime !== undefined
            ? clamp(updates.downtime, 0, target.plannedTimeMinutes * 0.9)
            : target.downtime;

        target.cycleTime = Number(nextCycle.toFixed(1));
        target.utilization = Number(nextUtil.toFixed(1));
        target.temperature = Number(nextTemp.toFixed(1));
        target.defectRate = Number(nextDefect.toFixed(2));
        target.downtime = Number(nextDowntime.toFixed(1));
        target.productionRate = Math.round(3600 / nextCycle);

        const recomputed = ordered.map((m) => {
          const oeeStats = computeMachineOEE({
            downtimeMinutes: m.downtime,
            plannedTimeMinutes: m.plannedTimeMinutes,
            actualCycleTime: m.cycleTime,
            targetCycleTime: m.targetCycleTime,
            unitsGood: m.unitsGood,
            unitsProcessed: m.unitsProcessed,
            defectRatePct: m.defectRate,
          });
          const draft: MachineTelemetry = { ...m, ...oeeStats };
          const pred = evaluateMachineBottleneck(draft, thresholds);
          draft.status = deriveOperationalStatus(draft, pred.riskScore, thresholds);
          draft.operatingState =
            draft.status === 'Critical' && draft.temperature >= draft.tempCriticalLimit
              ? 'Stopped'
              : draft.status !== 'Normal'
              ? 'Micro-stop'
              : 'Running';
          return draft;
        });

        return {
          ...prev,
          machines: recomputed,
        };
      });
    },
    [thresholds]
  );

  const uploadCsvDataset = useCallback(
    (csvText: string): CsvUploadReport => {
      const lines = csvText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        return {
          success: false,
          rowsImported: 0,
          rowsRejected: 0,
          anomaliesDetected: 0,
          message: 'CSV file must contain a header row and at least one data record.',
        };
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const requiredCols = ['machineid', 'utilization', 'cycletime', 'queuelength'];
      const missing = requiredCols.filter((req) => !headers.includes(req));
      if (missing.length > 0) {
        return {
          success: false,
          rowsImported: 0,
          rowsRejected: lines.length - 1,
          anomaliesDetected: 0,
          message: `Schema validation failed: missing required columns (${missing.join(', ')}).`,
        };
      }

      const imported: ProductionRecordRow[] = [];
      let rejected = 0;
      let anomalies = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols.length < requiredCols.length) {
          rejected++;
          continue;
        }
        const rowMap: Record<string, string> = {};
        headers.forEach((h, idx) => {
          rowMap[h] = cols[idx] ?? '';
        });

        const machineId = (rowMap['machineid'] || 'CNC-01').toUpperCase();
        const utilization = safeNumber(rowMap['utilization'], NaN);
        const cycleTime = safeNumber(rowMap['cycletime'], NaN);
        const queueLength = safeNumber(rowMap['queuelength'], NaN);

        if (
          Number.isNaN(utilization) ||
          Number.isNaN(cycleTime) ||
          Number.isNaN(queueLength) ||
          utilization < 0 ||
          utilization > 100 ||
          cycleTime <= 0 ||
          queueLength < 0
        ) {
          rejected++;
          continue;
        }

        const downtime = Math.max(0, safeNumber(rowMap['downtime'], 10));
        const temperature = safeNumber(rowMap['temperature'], 48);
        const defectRate = clamp(safeNumber(rowMap['defectrate'], 1.0), 0, 100);
        const unitsProcessed = Math.max(0, Math.round(safeNumber(rowMap['unitsprocessed'], 410)));
        const parsedRejected = rowMap['unitsrejected']
          ? Math.min(unitsProcessed, Math.max(0, Math.round(safeNumber(rowMap['unitsrejected'], 0))))
          : Math.min(unitsProcessed, Math.round(unitsProcessed * (defectRate / 100)));
        const unitsGood = Math.max(0, unitsProcessed - parsedRejected);
        const unitsEntered = unitsProcessed + Math.round(queueLength);

        const matchedStation = machines.find((m) => m.id === machineId) ?? machines[0];
        const oeeStats = computeMachineOEE({
          downtimeMinutes: downtime,
          plannedTimeMinutes: 320,
          actualCycleTime: cycleTime,
          targetCycleTime: thresholds.nominalTaktSeconds,
          unitsGood,
          unitsProcessed,
          defectRatePct: defectRate,
        });

        const synthetic: MachineTelemetry = {
          ...matchedStation,
          id: machineId,
          name: (rowMap['machinename'] || matchedStation.name).replace(/^"|"$/g, ''),
          utilization,
          cycleTime,
          queueLength: Math.round(queueLength),
          downtime,
          temperature,
          defectRate,
          unitsEntered,
          unitsProcessed,
          unitsGood,
          unitsRejected: parsedRejected,
          ...oeeStats,
        };

        const pred = evaluateMachineBottleneck(synthetic, thresholds);
        const isAnomaly = pred.riskScore >= 65 || temperature >= matchedStation.tempWarningLimit;
        if (isAnomaly) anomalies++;

        const shiftVal =
          rowMap['shift'] === 'Shift 2' || rowMap['shift'] === 'Shift 3'
            ? rowMap['shift']
            : 'Shift 1';
        const lineVal =
          rowMap['line'] === 'Line B' || rowMap['line'] === 'Line C' ? rowMap['line'] : 'Line A';

        imported.push({
          recordId: rowMap['recordid'] || `CSV-${simClockMs.toString().slice(-4)}-${i}`,
          timestamp: rowMap['timestamp'] || `2026-10-31 ${formatSimTimestamp(simClockMs + i * 1000)}`,
          date: rowMap['date'] || '2026-10-31',
          shift: shiftVal,
          line: lineVal,
          machineId,
          machineName: synthetic.name,
          utilization,
          cycleTime,
          queueLength: Math.round(queueLength),
          downtime,
          temperature,
          defectRate,
          unitsEntered,
          unitsProcessed,
          unitsGood,
          unitsRejected: parsedRejected,
          oee: oeeStats.oee,
          riskScore: pred.riskScore,
          riskClassification: pred.classification,
          anomalyFlag: isAnomaly,
        });
      }

      if (imported.length > 0) {
        setHistoricalAndUploadedRecords((prev) => [...imported, ...prev]);
      }

      return {
        success: imported.length > 0,
        rowsImported: imported.length,
        rowsRejected: rejected,
        anomaliesDetected: anomalies,
        message:
          imported.length > 0
            ? `Validated and imported ${imported.length} telemetry records (${anomalies} high-risk anomalies flagged).`
            : 'No valid telemetry records found in uploaded file.',
      };
    },
    [machines, thresholds, simClockMs]
  );

  const exportRecordsCsv = useCallback((): string => {
    const header =
      'recordId,timestamp,date,shift,line,machineId,machineName,utilization,cycleTime,queueLength,downtime,temperature,defectRate,unitsEntered,unitsProcessed,unitsGood,unitsRejected,oee,riskScore,riskClassification,anomalyFlag';
    const body = productionRecords.map((r) =>
      [
        r.recordId,
        r.timestamp,
        r.date,
        r.shift,
        r.line,
        r.machineId,
        `"${r.machineName}"`,
        r.utilization,
        r.cycleTime,
        r.queueLength,
        r.downtime,
        r.temperature,
        r.defectRate,
        r.unitsEntered,
        r.unitsProcessed,
        r.unitsGood,
        r.unitsRejected,
        r.oee,
        r.riskScore,
        r.riskClassification,
        r.anomalyFlag,
      ].join(',')
    );
    return [header, ...body].join('\n');
  }, [productionRecords]);

  const activeAlertCount = useMemo(
    () => alerts.filter((a) => a.status === 'active').length,
    [alerts]
  );

  const value: FactoryContextValue = {
    activePage,
    setActivePage,
    telemetrySourceMode: 'SIMULATED',
    simClockMs,
    simClockFormatted: formatSimTimestamp(simClockMs),
    machines,
    predictions,
    kpis,
    thresholds,
    updateThresholds,
    resetThresholds,
    isRunning,
    toggleSimulation,
    setSimulationRunning,
    simulationSpeed,
    setSimulationSpeed,
    scenario,
    selectScenario,
    triggerMachineSetup,
    resetSimulation,
    alerts,
    activeAlertCount,
    acknowledgeAlert,
    resolveAlert,
    executeAlertMitigation,
    applyMachineMitigation,
    appliedRecommendationIds,
    updateMachineParameter,
    timeSeries,
    downtimePareto,
    productionRecords,
    uploadCsvDataset,
    exportRecordsCsv,
    globalSearchQuery,
    setGlobalSearchQuery,
    selectedFocusMachineId,
    setSelectedFocusMachineId,
    tickCount,
  };

  return <FactoryContext.Provider value={value}>{children}</FactoryContext.Provider>;
};

export function useFactory(): FactoryContextValue {
  const ctx = useContext(FactoryContext);
  if (!ctx) {
    throw new Error('useFactory must be used within a FactoryProvider');
  }
  return ctx;
}
