export type NavigationPage =
  | 'dashboard'
  | 'monitoring'
  | 'prediction'
  | 'analytics'
  | 'workflow'
  | 'alerts'
  | 'data'
  | 'recommendations'
  | 'settings';

export type MachineOperationalStatus = 'Normal' | 'Warning' | 'Critical';

export type RiskClassification = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type SimulationScenarioId =
  | 'normal'
  | 'cnc_overload'
  | 'assembly_delay'
  | 'welding_failure'
  | 'quality_overload'
  | 'packaging_bottleneck';

export type SimulationSpeed = 1 | 2 | 5;

export type TimelineSegmentState = 'Running' | 'Micro-stop' | 'Stopped' | 'Setup';

export interface TimelineSegment {
  id: string;
  state: TimelineSegmentState;
  durationSec: number;
  durationPct: number;
  startTimeLabel: string;
  endTimeLabel?: string;
  jobRun?: string;
}

export interface MachineTelemetry {
  id: string;
  code: string;
  name: string;
  shortName: string;
  stageOrder: number;
  line: 'Line A' | 'Line B' | 'Line C';
  jobCode: string;
  status: MachineOperationalStatus;
  operatingState: TimelineSegmentState;
  productionRate: number; // units / hour
  cycleTime: number; // seconds / unit
  targetCycleTime: number; // nominal takt time in seconds
  utilization: number; // percentage 0-100
  plannedTimeMinutes: number; // elapsed planned production minutes in current shift
  downtime: number; // cumulative shift stoppage minutes
  queueLength: number; // WIP units waiting in station input buffer (unitsEntered - unitsProcessed)
  bufferCapacity: number; // max nominal input buffer units
  unitsEntered: number; // cumulative units entered into station buffer
  unitsProcessed: number; // cumulative units processed (unitsGood + unitsRejected)
  unitsGood: number; // cumulative conforming units passed to next stage
  unitsRejected: number; // cumulative defective/scrapped units rejected at this stage
  targetDemand: number; // shift target finished units
  temperature: number; // degrees Celsius
  tempWarningLimit: number;
  tempCriticalLimit: number;
  defectRate: number; // instantaneous/rolling defect percentage 0-100
  vibrationMmS: number; // ISO 10816 mm/s RMS
  availability: number; // % 0-100
  performance: number; // % 0-100
  quality: number; // % 0-100
  oee: number; // % 0-100 (Availability * Performance * Quality)
  isBlocked: boolean; // downstream buffer saturated
  isStarved: boolean; // input queue near zero while upstream delayed
  operatorCount: number;
  powerKw: number;
  timeline: TimelineSegment[];
}

export interface ParameterScoreDetail {
  key: 'utilization' | 'queue' | 'cycleTime' | 'downtime' | 'defectRate' | 'temperature';
  label: string;
  rawValue: number;
  unit: string;
  thresholdLabel: string;
  normalizedScore: number; // 0 - 100
  weight: number; // 0.25, 0.25, 0.20, 0.15, 0.10, 0.05
  weightedContribution: number;
}

export interface MachinePredictionResult {
  machineId: string;
  machineCode: string;
  machineName: string;
  riskScore: number; // 0 - 100 weighted risk score (deterministic, non-ML)
  classification: RiskClassification;
  predictedDelayMinutes: number;
  estimatedLostUnits: number;
  primaryFactors: string[];
  narrativeDiagnosis: string;
  recommendedActions: string[];
  parameterBreakdown: ParameterScoreDetail[];
}

export interface FactoryThresholds {
  nominalTaktSeconds: number;
  shiftDurationMinutes: number;
  shiftTargetUnits: number;
  utilizationWarningPct: number;
  utilizationCriticalPct: number;
  defaultBufferCapacity: number;
  tempWarningCelsius: number;
  tempCriticalCelsius: number;
  defectWarningPct: number;
  defectCriticalPct: number;
  downtimeWarningMinutes: number;
  downtimeCriticalMinutes: number;
  opcUaEndpoint: string;
  mqttBrokerTopic: string;
}

export interface FactoryKPIs {
  rawMaterialReleased: number;
  totalProcessedAcrossStages: number;
  totalGoodFinalStage: number;
  totalRejectedAllStages: number;
  totalWipInSystem: number;
  totalOutput: number; // strictly equals finishedGoodsDispatched (PKG-05.unitsGood)
  finishedGoodsDispatched: number;
  shiftTarget: number;
  outputVariancePct: number;
  fleetOee: number; // arithmetic mean of individual station OEEs
  compositeFleetOee: number; // Avg Availability * Avg Performance * Avg Quality
  avgAvailability: number;
  avgPerformance: number;
  avgQuality: number;
  avgUtilization: number;
  peakUtilization: number;
  peakUtilizationMachine: string;
  avgCycleTime: number;
  taktVarianceSeconds: number;
  downtimePercentage: number;
  totalDowntimeMinutes: number;
  totalPlannedMinutes: number;
  maxBottleneckRisk: number;
  maxBottleneckClassification: RiskClassification;
  primaryBottleneckMachine: string;
  primaryBottleneckId: string;
  massBalanceConserved: boolean;
}

export type AlertSeverity = 'Warning' | 'High' | 'Critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface FactoryAlert {
  id: string; // deterministic key for active deduplication e.g. ALT-UTIL-CNC-01
  machineId: string;
  machineName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: string;
  updatedAt: string;
  triggerMetric: string;
  currentValue: string;
  thresholdValue: string;
  description: string;
  rootCauseHypothesis: string;
  recommendedAction: string;
  mitigationType:
    | 'rebalance_load'
    | 'clear_buffer'
    | 'thermal_cooldown'
    | 'expedite_inspection'
    | 'boost_packaging'
    | 'general_tune';
}

export interface TimeSeriesPoint {
  timestamp: string; // sequential HH:MM:SS simulation timestamp
  simClockMs: number;
  plannedOutput: number;
  actualOutput: number; // PKG-05.unitsGood
  totalRejected: number;
  avgUtilization: number;
  avgCycleTime: number;
  totalQueue: number; // total WIP across all 5 buffers
  fleetOee: number;
  maxRiskScore: number;
  cncUtil: number;
  asmUtil: number;
  wldUtil: number;
  qcUtil: number;
  pkgUtil: number;
  cncCycle: number;
  asmCycle: number;
  wldCycle: number;
  qcCycle: number;
  pkgCycle: number;
  velocityUph: number;
}

export interface DowntimeCauseItem {
  reason: string;
  minutes: number;
  occurrences: number;
  station: string;
  sharePct: number;
}

export interface ProductionRecordRow {
  recordId: string;
  timestamp: string;
  date: string;
  shift: 'Shift 1' | 'Shift 2' | 'Shift 3';
  line: 'Line A' | 'Line B' | 'Line C';
  machineId: string;
  machineName: string;
  utilization: number;
  cycleTime: number;
  queueLength: number;
  downtime: number;
  temperature: number;
  defectRate: number;
  unitsEntered: number;
  unitsProcessed: number;
  unitsGood: number;
  unitsRejected: number;
  oee: number;
  riskScore: number;
  riskClassification: RiskClassification;
  anomalyFlag: boolean;
}

export interface SmartRecommendation {
  id: string;
  machineId: string;
  machineName: string;
  problemCategory: string;
  priority: 'Immediate' | 'High' | 'Preventive';
  title: string;
  detectedCondition: string;
  actionPlan: string[];
  expectedOperationalBenefit: string;
  impactMetrics: string;
  applied: boolean;
  mitigationAction: () => void;
}
