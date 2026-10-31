import React, { useMemo, useState } from 'react';
import { formatSimTimestamp, normalizeTimelinePercentages } from '../../data/initialFactoryData';
import { MachineTelemetry, TimelineSegmentState } from '../../types/factory';

interface MachineStatusTimelineProps {
  machines: MachineTelemetry[];
  simClockMs: number;
  onSelectMachine?: (machineId: string) => void;
  onTriggerSetup?: (machineId: string) => void;
}

const STATE_COLOR_MAP: Record<TimelineSegmentState, string> = {
  Running: 'bg-emerald-500',
  'Micro-stop': 'bg-amber-500',
  Stopped: 'bg-rose-500',
  Setup: 'bg-sky-500',
};

export const MachineStatusTimeline: React.FC<MachineStatusTimelineProps> = ({
  machines,
  simClockMs,
  onSelectMachine,
  onTriggerSetup,
}) => {
  const [showProductionRuns, setShowProductionRuns] = useState(true);
  const [windowSec, setWindowSec] = useState<60 | 180 | 360>(360);

  // Build exact sequential time axis ticks based on live simulation clock
  const timeTicks = useMemo(() => {
    const steps = 4;
    const list: string[] = [];
    for (let i = steps; i >= 0; i--) {
      const tMs = simClockMs - (i * (windowSec * 1000)) / steps;
      list.push(formatSimTimestamp(tMs));
    }
    return list;
  }, [simClockMs, windowSec]);

  return (
    <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Machine Operating State Timeline (Simulated History)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Live state transitions synchronized with simulation clock · Supports Running, Micro-stop, Stopped, and Setup states
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showProductionRuns}
              onChange={(e) => setShowProductionRuns(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span>Show batch & good/reject counts</span>
          </label>

          <select
            value={windowSec}
            onChange={(e) => setWindowSec(Number(e.target.value) as 60 | 180 | 360)}
            aria-label="Timeline window"
            className="rounded-lg border border-[#1e293b] bg-[#090d18] px-2.5 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value={60}>Recent 60s Sim Window</option>
            <option value={180}>Recent 3m Sim Window</option>
            <option value={360}>Full 6m Sim History</option>
          </select>
        </div>
      </div>

      {/* 4-State Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          {(['Running', 'Micro-stop', 'Stopped', 'Setup'] as TimelineSegmentState[]).map((st) => (
            <span key={st} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-xs ${STATE_COLOR_MAP[st]}`} />
              <span>{st}</span>
            </span>
          ))}
        </div>
        <span className="font-mono text-[11px] text-slate-400">
          Hover segments for exact state timestamps & duration
        </span>
      </div>

      {/* Gantt Rows Driven Directly by Machine Simulation History */}
      <div className="mt-4 space-y-3.5">
        {machines.map((m) => {
          // Slice recent segments up to `windowSec` so zooming the window genuinely slices history
          let accSec = 0;
          const reversedSlice = [];
          for (let i = m.timeline.length - 1; i >= 0; i--) {
            const seg = m.timeline[i];
            if (accSec >= windowSec && reversedSlice.length > 0) break;
            const remaining = Math.max(2.4, windowSec - accSec);
            const clippedDuration = Math.min(seg.durationSec, remaining);
            reversedSlice.push({ ...seg, durationSec: clippedDuration });
            accSec += clippedDuration;
          }
          const visibleSegments = normalizeTimelinePercentages(reversedSlice.reverse());

          return (
            <div key={m.id} className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-center">
              <div className="flex items-center justify-between md:col-span-3 md:pr-3">
                <button
                  type="button"
                  onClick={() => onSelectMachine?.(m.id)}
                  className="truncate text-left text-xs font-medium text-slate-200 hover:text-cyan-300 transition-colors"
                >
                  {m.code} · {m.shortName}
                </button>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-400">
                    {m.operatingState}
                  </span>
                  {onTriggerSetup && (
                    <button
                      type="button"
                      onClick={() => onTriggerSetup(m.id)}
                      title={`Run 3-step Setup changeover on ${m.code}`}
                      className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 hover:bg-slate-800 whitespace-nowrap"
                    >
                      Setup
                    </button>
                  )}
                </div>
              </div>

              <div className="md:col-span-9">
                <div className="flex h-5 w-full overflow-hidden rounded-sm bg-[#090d18] p-0.5 gap-0.5">
                  {visibleSegments.map((seg) => (
                    <div
                      key={seg.id}
                      style={{ width: `${seg.durationPct}%` }}
                      title={`${m.code} · ${seg.state} | ${seg.startTimeLabel} → ${
                        seg.endTimeLabel ?? ''
                      } (${seg.durationSec.toFixed(1)}s)`}
                      className={`h-full transition-opacity duration-200 ${
                        STATE_COLOR_MAP[seg.state]
                      } opacity-90 hover:opacity-100`}
                    />
                  ))}
                </div>

                {showProductionRuns && (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-xs bg-slate-800/45 px-2 py-0.5 text-[11px] text-slate-400">
                    <span className="font-mono">{m.jobCode}</span>
                    <span className="font-mono tabular-nums">
                      Processed {m.unitsProcessed} ({m.unitsGood} good · {m.unitsRejected} reject) ·
                      WIP {m.queueLength}u · Cycle {m.cycleTime.toFixed(1)}s
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Sequential Non-Repeating Time Axis */}
        <div className="grid grid-cols-1 md:grid-cols-12 pt-1">
          <div className="hidden md:block md:col-span-3" />
          <div className="flex justify-between font-mono text-[11px] text-slate-500 tabular-nums md:col-span-9">
            {timeTicks.map((t, idx) => (
              <span key={`${t}-${idx}`}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
