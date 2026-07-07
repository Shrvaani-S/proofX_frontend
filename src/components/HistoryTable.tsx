import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  downloadBulkExportResult,
  downloadHistoryReportPdf,
  downloadProof,
  getBulkExportStatus,
  startBulkExportPdf,
  workflowDisplayName,
} from "@/lib/api";
import type { HistoryRun } from "@/lib/api";

interface Props {
  runs: HistoryRun[];
  /** Slightly denser row padding/text — used on the home page's "Recent Runs"
   *  preview table. HistoryPage uses the default (roomier) sizing. */
  compact?: boolean;
  /** Rows shown per page. Defaults to 5. */
  pageSize?: number;
}

const COLUMNS = [
  "Date / Time",
  "Master",
  "Revised",
  "Mode",
  "Analysed Pairs",
  "Skipped",
  "Findings",
  "Workflow",
  "Status",
  "Download Report",
];

export function HistoryTable({ runs, compact = false, pageSize = 5 }: Props) {
  const cellPad = compact ? "px-4 py-2.5" : "px-4 py-3";
  const headPad = compact ? "px-4 py-2.5" : "px-4 py-3";
  const textSize = compact ? "text-[11px]" : "text-xs";

  const pageCount = Math.max(1, Math.ceil(runs.length / pageSize));
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the underlying run list changes (new fetch,
  // filter, etc.) so we never get stuck on a page that no longer exists.
  useEffect(() => setPage(1), [runs]);

  const clampedPage = Math.min(page, pageCount);
  const pageRuns = runs.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {COLUMNS.map((col) => (
              <th
                key={col}
                className={`${headPad} text-left ${textSize} font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {pageRuns.map((run) => (
            <HistoryRow key={run.run_id} run={run} cellPad={cellPad} textSize={textSize} />
          ))}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface-2">
          <span className="text-[11px] text-muted-foreground">
            Page {clampedPage} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage === 1}
              className="inline-flex items-center justify-center h-7 w-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={clampedPage === pageCount}
              className="inline-flex items-center justify-center h-7 w-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function HistoryRow({ run, cellPad, textSize }: { run: HistoryRun; cellPad: string; textSize: string }) {
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  // Master and Revised share one expand state — clicking either chevron
  // opens the same side-by-side breakdown (they're one uploaded batch, not
  // two independent lists).
  const [expanded, setExpanded] = useState(false);

  const hasBreakdown = run.mode === "bulk" && !!run.file_pairs && run.file_pairs.length > 0;
  const canDownload = run.status === "pass";

  // run.run_id doubles as the bulk job_id (see router/bulk_compare.py's
  // _write_history) — the job-based export endpoints work identically for a
  // history row as they do from the live results page, as long as the job
  // hasn't TTL-expired (24h, bulk_jobs). Past that, start_export_pdf 404s
  // and the caller falls back to the flat proof PNG, same as single mode's
  // fallback for pre-feature runs.
  const handleDownload = async () => {
    setDownloading(true);
    setDlError(null);
    try {
      if (run.mode === "single") {
        // Server renders the PDF from its own persisted findings/images/
        // reconciliation data (report_pdf.py) — no client-side assembly.
        await downloadHistoryReportPdf(run.run_id);
      } else {
        await startBulkExportPdf(run.run_id);
        let status = await getBulkExportStatus(run.run_id);
        while (status.export_status === "running") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          status = await getBulkExportStatus(run.run_id);
        }
        if (status.export_status === "error") {
          throw new Error(status.export_error || "PDF generation failed.");
        }
        await downloadBulkExportResult(run.run_id);
      }
    } catch {
      // Older/expired runs (past the full-report feature, or past bulk's 24h
      // TTL window) only have the flat proof PNG — fall back rather than
      // leaving the click dead.
      try {
        await downloadProof(run.run_id);
      } catch (err) {
        setDlError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <tr className="hover:bg-surface-2/50 transition-colors">
        <td className={`${cellPad} ${textSize} text-muted-foreground whitespace-nowrap`}>
          {formatDate(run.created_at)}
        </td>
        <td className={`${cellPad} ${textSize} font-medium text-foreground max-w-[160px]`}>
          <FileCell name={run.base_name} hasBreakdown={hasBreakdown} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
        </td>
        <td className={`${cellPad} ${textSize} font-medium text-foreground max-w-[160px]`}>
          <FileCell name={run.revised_name} hasBreakdown={hasBreakdown} expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
        </td>
        <td className={cellPad}>
          <ModeBadge mode={run.mode} />
        </td>
        <td className={`${cellPad} ${textSize} text-center text-foreground`}>{run.analysed_pair_count}</td>
        <td className={`${cellPad} ${textSize} text-center text-foreground`}>
          {run.skipped_count > 0 ? run.skipped_count : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={`${cellPad} ${textSize} text-center text-foreground`}>
          {run.findings_count ?? <span className="text-muted-foreground">—</span>}
        </td>
        <td className={cellPad}>
          <WorkflowBadge workflow={run.workflow} />
        </td>
        <td className={cellPad}>
          <StatusBadge status={run.status} />
        </td>
        <td className={`${cellPad} text-center whitespace-nowrap`}>
          {canDownload ? (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={11} />
                {downloading ? "Downloading…" : "Download Report"}
              </button>
              {dlError && <span className="text-[10px] text-red-500">{dlError}</span>}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
      </tr>
      {hasBreakdown && expanded && (
        <FileBreakdownRow pairs={run.file_pairs!} />
      )}
    </>
  );
}

function FileCell({
  name, hasBreakdown, expanded, onToggle,
}: { name: string; hasBreakdown: boolean; expanded: boolean; onToggle: () => void }) {
  if (!hasBreakdown) {
    return <span className="truncate block" title={name}>{name}</span>;
  }
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 text-left hover:text-accent transition-colors rounded outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
    >
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span className="truncate">{name}</span>
    </button>
  );
}

/** Nested breakdown row for a bulk run's file_pairs — Master and Revised
 *  listed side by side, one row per originally-uploaded pair, since a
 *  base/revised file pair is one uploaded batch, not two independent lists. */
function FileBreakdownRow({ pairs }: { pairs: NonNullable<HistoryRun["file_pairs"]> }) {
  return (
    <tr>
      <td colSpan={COLUMNS.length} className="px-4 py-2 bg-surface-2/60">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-semibold py-1 pl-8">Master</th>
              <th className="text-left font-semibold py-1">Revised</th>
              <th className="text-left font-semibold py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((fp, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="py-1.5 pl-8 truncate max-w-[240px]" title={fp.base_name}>{fp.base_name}</td>
                <td className="py-1.5 truncate max-w-[240px]" title={fp.revised_name}>{fp.revised_name}</td>
                <td className="py-1.5">
                  <FilePairStatusBadge status={fp.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "pass" | "fail" }) {
  return status === "pass" ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
      Pass
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">
      Fail
    </span>
  );
}

function FilePairStatusBadge({ status }: { status: "done" | "error" | "skipped_page_mismatch" }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
        Done
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
      Skipped
    </span>
  );
}

function ModeBadge({ mode }: { mode: "single" | "bulk" }) {
  return mode === "bulk" ? (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
      style={{ color: "#F07922", borderColor: "#F0792240", backgroundColor: "#F0792208" }}
    >
      Bulk
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-muted-foreground border border-border">
      Single
    </span>
  );
}

function WorkflowBadge({ workflow }: { workflow: string | null }) {
  const label = workflowDisplayName(workflow);
  if (label === "Visual Comparison") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-muted-foreground border border-border">
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
      style={{ color: "#1C2E59", borderColor: "#1C2E5940", backgroundColor: "#1C2E5908" }}
    >
      {label}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
