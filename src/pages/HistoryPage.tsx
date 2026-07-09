import { useState, useEffect } from "react";
import { ScanLine, ArrowLeft, Download, Clock } from "lucide-react";
import { getHistory, exportHistoryCSV } from "@/lib/api";
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
            <img src="/novintix-logo.png" alt="Novintix" className="h-7 w-auto" style={{ mixBlendMode: "screen" }} />
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
          <HistoryTable runs={runs} />
        )}
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-xs text-muted-foreground flex-shrink-0">
        ProofX · Label Compliance
      </footer>
    </div>
  );
}
