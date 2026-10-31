import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { AlertSeverity, AlertStatus } from '../../types/factory';

export const AlertsView: React.FC = () => {
  const { alerts, acknowledgeAlert, resolveAlert, executeAlertMitigation } = useFactory();

  const [statusFilter, setStatusFilter] = useState<'all' | AlertStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | AlertSeverity>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const counts = useMemo(
    () => ({
      active: alerts.filter((a) => a.status === 'active').length,
      acknowledged: alerts.filter((a) => a.status === 'acknowledged').length,
      resolved: alerts.filter((a) => a.status === 'resolved').length,
    }),
    [alerts]
  );

  const filteredAlerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return alerts.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (
        q &&
        !a.machineName.toLowerCase().includes(q) &&
        !a.id.toLowerCase().includes(q) &&
        !a.triggerMetric.toLowerCase().includes(q) &&
        !a.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [alerts, statusFilter, severityFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Incident Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="text-xs text-slate-400">Active Unacknowledged Alerts</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-rose-400 tabular-nums">
            {counts.active}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Deduplicated deterministic condition tracking
          </div>
        </div>

        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="text-xs text-slate-400">Acknowledged (In Triage)</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-sky-400 tabular-nums">
            {counts.acknowledged}
          </div>
          <div className="mt-1 text-xs text-slate-400">Assigned to shift floor supervisor</div>
        </div>

        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="text-xs text-slate-400">Resolved Audit History</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {counts.resolved}
          </div>
          <div className="mt-1 text-xs text-slate-400">Mitigated and logged in shift trail</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
        {/* Status Segmented Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#1e293b] bg-[#090d18] p-1">
          {(['all', 'active', 'acknowledged', 'resolved'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-slate-800 text-cyan-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as 'all' | AlertSeverity)}
            aria-label="Filter by alert severity"
            className="rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Warning">Warning</option>
          </select>

          <div className="flex items-center rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5">
            <Search className="mr-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, machine, metric..."
              className="w-44 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Alert Records List */}
      <div className="space-y-3.5">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#1e293b] bg-[#0f1626] py-14 text-center px-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <h3 className="mt-3 text-sm font-semibold text-slate-200">
              No Matching Alert Records
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Adjust status/severity filters or switch simulation scenarios to trigger threshold alerts.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isCrit = alert.severity === 'Critical';
            const isResolved = alert.status === 'resolved';
            const isAck = alert.status === 'acknowledged';

            return (
              <article
                key={alert.id}
                className={`rounded-xl border bg-[#0f1626] p-5 transition-colors ${
                  isResolved
                    ? 'border-[#1e293b] opacity-80'
                    : isCrit
                    ? 'border-rose-500/50'
                    : 'border-amber-500/40'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono font-semibold text-slate-300">{alert.id}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`flex items-center gap-1 font-semibold ${
                          isCrit ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      >
                        {isCrit ? (
                          <ShieldAlert className="h-3.5 w-3.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        )}
                        {alert.severity}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono font-medium uppercase ${
                          isResolved
                            ? 'text-emerald-400'
                            : isAck
                            ? 'text-sky-400'
                            : 'text-rose-300'
                        }`}
                      >
                        {alert.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Triggered {alert.timestamp}</span>
                    </div>

                    <h3 className="mt-1.5 text-base font-semibold text-slate-100">
                      {alert.machineName} ({alert.machineId}) — {alert.triggerMetric}
                    </h3>
                  </div>

                  <div className="text-right font-mono text-xs tabular-nums">
                    <div className="text-slate-200 font-semibold">
                      Observed: {alert.currentValue}
                    </div>
                    <div className="text-slate-400">Limit: {alert.thresholdValue}</div>
                  </div>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                  {alert.description}
                </p>

                <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[#1e293b] pt-3 text-xs md:grid-cols-2">
                  <div>
                    <span className="text-slate-400">Root Cause Hypothesis: </span>
                    <span className="text-slate-200">{alert.rootCauseHypothesis}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Prescribed Corrective Action: </span>
                    <span className="text-cyan-300">{alert.recommendedAction}</span>
                  </div>
                </div>

                {!isResolved && (
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#1e293b] pt-3.5">
                    {alert.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Check className="h-3.5 w-3.5 text-sky-400" />
                        <span>Acknowledge</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => resolveAlert(alert.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Resolve</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => executeAlertMitigation(alert.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>Execute Corrective Action</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
