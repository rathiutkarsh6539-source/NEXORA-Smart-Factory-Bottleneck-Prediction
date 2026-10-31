import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Search,
  Upload,
} from 'lucide-react';
import { CsvUploadReport, useFactory } from '../../context/FactoryContext';
import { SAMPLE_CSV_CONTENT } from '../../data/initialFactoryData';
import { RiskClassification } from '../../types/factory';

export const DataManagementView: React.FC = () => {
  const {
    productionRecords,
    uploadCsvDataset,
    exportRecordsCsv,
    machines,
    telemetrySourceMode,
  } = useFactory();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadReport, setUploadReport] = useState<CsvUploadReport | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [machineFilter, setMachineFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState<'ALL' | RiskClassification>('ALL');
  const [anomaliesOnly, setAnomaliesOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const handleFileContent = (text: string) => {
    const report = uploadCsvDataset(text);
    setUploadReport(report);
    setCurrentPage(1);
  };

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      handleFileContent(text);
    };
    reader.readAsText(file);
  };

  const handleDownloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return productionRecords.filter((r) => {
      if (machineFilter !== 'ALL' && r.machineId !== machineFilter) return false;
      if (riskFilter !== 'ALL' && r.riskClassification !== riskFilter) return false;
      if (anomaliesOnly && !r.anomalyFlag) return false;
      if (
        q &&
        !r.recordId.toLowerCase().includes(q) &&
        !r.machineName.toLowerCase().includes(q) &&
        !r.machineId.toLowerCase().includes(q) &&
        !r.date.includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [productionRecords, searchQuery, machineFilter, riskFilter, anomaliesOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageSlice = filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize);

  const anomalyCount = productionRecords.filter((r) => r.anomalyFlag).length;

  return (
    <div className="space-y-6">
      {/* Data Quality & Schema Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="text-xs text-slate-400">
            Centralized Records ({telemetrySourceMode} + Imported)
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {productionRecords.length}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Top 5 rows (`LIVE-*`) stay synchronized with active simulation
          </div>
        </div>

        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="text-xs text-slate-400">Mass & Bound Validation</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            100% Validated
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Enforces Processed = Good + Rejected and non-negative WIP
          </div>
        </div>

        <div className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-4">
          <div className="text-xs text-slate-400">Flagged High-Risk Rows</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-amber-400 tabular-nums">
            {anomalyCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Weighted risk score ≥ 65 or thermal warning breach
          </div>
        </div>
      </div>

      {/* CSV Uploader & Dataset Actions */}
      <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Production CSV Dataset Ingestion & Export
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Upload CSV telemetry files for schema validation, OEE (A × P × Q) scoring, and weighted bottleneck evaluation
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleFileContent(SAMPLE_CSV_CONTENT)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-cyan-400" />
              <span>Ingest Sample Batch</span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleDownloadCsv(SAMPLE_CSV_CONTENT, 'nexora_sample_production_template.csv')
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              <span>Download Template CSV</span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleDownloadCsv(
                  exportRecordsCsv(),
                  `nexora_analyzed_production_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Analyzed CSV</span>
            </button>
          </div>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileSelect(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-7 px-4 text-center transition-colors ${
            isDragging
              ? 'border-cyan-400 bg-cyan-500/10'
              : 'border-slate-700 bg-[#090d18] hover:border-slate-500'
          }`}
        >
          <Upload className="h-6 w-6 text-cyan-400" />
          <p className="mt-2 text-xs font-medium text-slate-200">
            Drop a production `.csv` dataset here or click to browse
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Required columns: machineId, utilization, cycleTime, queueLength (optional: unitsProcessed, unitsRejected, downtime, temperature, defectRate)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
            className="hidden"
          />
        </div>

        {uploadReport && (
          <div
            className={`mt-3 flex items-center justify-between rounded-lg border px-4 py-2.5 text-xs ${
              uploadReport.success
                ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/20 text-rose-200'
            }`}
          >
            <span className="flex items-center gap-2">
              {uploadReport.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              {uploadReport.message}
            </span>
            <span className="font-mono tabular-nums">
              Imported: {uploadReport.rowsImported} · Rejected: {uploadReport.rowsRejected}
            </span>
          </div>
        )}
      </section>

      {/* Searchable & Filterable Telemetry Table */}
      <section className="rounded-xl border border-[#1e293b] bg-[#0f1626] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1e293b]">
          <div className="flex items-center rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5">
            <Search className="mr-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search record ID, station, date..."
              className="w-52 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={machineFilter}
              onChange={(e) => {
                setMachineFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter records by machine"
              className="rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Stations</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>

            <select
              value={riskFilter}
              onChange={(e) => {
                setRiskFilter(e.target.value as 'ALL' | RiskClassification);
                setCurrentPage(1);
              }}
              aria-label="Filter records by risk tier"
              className="rounded-lg border border-[#1e293b] bg-[#090d18] px-3 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Risk Tiers</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MODERATE">MODERATE</option>
              <option value="LOW">LOW</option>
            </select>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={anomaliesOnly}
                onChange={(e) => {
                  setAnomaliesOnly(e.target.checked);
                  setCurrentPage(1);
                }}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-cyan-500"
              />
              <span>Anomalies only</span>
            </label>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1e293b] text-slate-400">
                <th className="py-2.5 pr-3 font-medium">Record ID</th>
                <th className="px-3 py-2.5 font-medium">Timestamp · Shift</th>
                <th className="px-3 py-2.5 font-medium">Station</th>
                <th className="px-3 py-2.5 text-right font-medium">Processed</th>
                <th className="px-3 py-2.5 text-right font-medium">Good / Rej</th>
                <th className="px-3 py-2.5 text-right font-medium">WIP</th>
                <th className="px-3 py-2.5 text-right font-medium">Cycle (s)</th>
                <th className="px-3 py-2.5 text-right font-medium">OEE %</th>
                <th className="py-2.5 pl-3 text-right font-medium">Risk Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]/70">
              {pageSlice.map((row) => (
                <tr key={row.recordId} className="hover:bg-slate-800/35">
                  <td className="py-2.5 pr-3 font-mono text-slate-300">{row.recordId}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-400 tabular-nums">
                    {row.timestamp} · {row.shift}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-200">
                    {row.machineId} · {row.line}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-200 tabular-nums">
                    {row.unitsProcessed}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    <span className="text-emerald-400">{row.unitsGood}</span>
                    <span className="text-slate-500"> / </span>
                    <span className="text-rose-400">{row.unitsRejected}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-200 tabular-nums">
                    {row.queueLength}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-200 tabular-nums">
                    {row.cycleTime.toFixed(1)}s
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-cyan-300 tabular-nums">
                    {row.oee.toFixed(1)}%
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono font-semibold tabular-nums">
                    <span
                      className={
                        row.riskClassification === 'CRITICAL'
                          ? 'text-rose-400'
                          : row.riskClassification === 'HIGH'
                          ? 'text-amber-400'
                          : row.riskClassification === 'MODERATE'
                          ? 'text-sky-400'
                          : 'text-emerald-400'
                      }
                    >
                      {row.riskScore}/100 ({row.riskClassification})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-[#1e293b] pt-3 text-xs text-slate-400">
          <span className="font-mono tabular-nums">
            Showing {(safePage - 1) * pageSize + (pageSlice.length > 0 ? 1 : 0)}–
            {(safePage - 1) * pageSize + pageSlice.length} of {filteredRecords.length} records
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 disabled:opacity-40 hover:bg-slate-800"
            >
              Previous
            </button>
            <span className="font-mono tabular-nums">
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 disabled:opacity-40 hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
