import { useState, useEffect } from "react";
import { ScanLine, ArrowLeft, Download, Clock } from "lucide-react";
import { getHistory, exportHistoryCSV, workflowDisplayName } from "@/lib/api";
import type { HistoryRun } from "@/lib/api";

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

  return (
    <tr className="hover:bg-surface-2/50 transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{dateLabel}</td>
      <td className="px-4 py-3 text-xs font-medium text-foreground max-w-[160px] truncate" title={run.base_name}>
        {run.base_name}
      </td>
      <td className="px-4 py-3 text-xs font-medium text-foreground max-w-[160px] truncate" title={run.revised_name}>
        {run.revised_name}
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
