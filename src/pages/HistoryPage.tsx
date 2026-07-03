import { useState, useEffect } from "react";
import { ScanLine, ArrowLeft, Download, Clock, Loader2 } from "lucide-react";
import { getHistory, exportHistoryCSV, downloadProof, workflowDisplayName } from "@/lib/api";
import type { HistoryRun } from "@/lib/api";
import { HistoryTable } from "@/components/HistoryTable";

interface Props {
  onBack: () => void;
}

export function HistoryPage({ onBack }: Props) {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getHistory({ limit: 50 })
      .then((data) => {
        setRuns(data.runs);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await exportHistoryCSV();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header
        className="bg-primary text-white px-6 flex items-center justify-between shadow-md flex-shrink-0"
        style={{ minHeight: 52 }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <span className="text-white/30">|</span>
          <div className="flex items-center gap-2">
            <ScanLine size={18} />
            <span className="text-sm font-bold tracking-tight uppercase">ProofX</span>
            <span className="text-white/30 mx-1">|</span>
            <span className="text-xs text-white/70 font-medium">Run History</span>
          </div>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={exporting || loading || runs.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-auto px-6 py-6 bg-surface-2">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">Loading history…</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Clock size={40} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No comparison runs yet.</p>
            <p className="text-xs text-muted-foreground/60">
              Run a comparison to see it here.
            </p>
          </div>
        )}

        {!loading && !error && runs.length > 0 && (
          <div className="bg-white border border-border rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {[
                    "Date / Time",
                    "Master",
                    "Revised",
                    "Mode",
                    "Pairs",
                    "Findings",
                    "Workflow",
                    "Status",
                    "",
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((run) => (
                  <HistoryRow key={run.run_id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-xs text-muted-foreground flex-shrink-0">
        ProofX · Label Compliance
      </footer>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function HistoryRow({ run }: { run: HistoryRun }) {
  const dateLabel = formatDate(run.created_at);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const canDownload = run.mode === "single";

  const handleDownload = async () => {
    if (!canDownload || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadProof(run.run_id);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <tr className="hover:bg-surface-2/50 transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{dateLabel}</td>
      <td className="px-4 py-3 text-xs font-medium text-foreground max-w-[160px] truncate" title={run.base_name ?? undefined}>
        {run.base_name || "—"}
      </td>
      <td className="px-4 py-3 text-xs font-medium text-foreground max-w-[160px] truncate" title={run.revised_name ?? undefined}>
        {run.revised_name || "—"}
      </td>
      <td className="px-4 py-3">
        <ModeBadge mode={run.mode} />
      </td>
      <td className="px-4 py-3 text-xs text-center text-foreground">{run.pair_count}</td>
      <td className="px-4 py-3 text-xs text-center text-foreground">
        {run.findings_count ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3">
        <WorkflowBadge workflow={run.workflow} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleDownload}
          disabled={!canDownload || downloading}
          title={canDownload ? "Download proof report" : "Not available for bulk runs"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-colors border ${
            canDownload
              ? downloadError
                ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                : "border-border bg-surface-2 text-foreground hover:bg-white hover:border-primary/40 hover:text-primary"
              : "border-transparent text-muted-foreground/30 cursor-not-allowed"
          }`}
        >
          {downloading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />
          }
          {canDownload && <span>{downloading ? "…" : "Download"}</span>}
        </button>
        {downloadError && (
          <p className="mt-1 text-[10px] text-red-600 leading-tight max-w-[120px]">{downloadError}</p>
        )}
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
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
      style={{ color: "#1C2E59", borderColor: "#1C2E5940", backgroundColor: "#1C2E5908" }}
    >
      {workflowDisplayName(workflow)}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
