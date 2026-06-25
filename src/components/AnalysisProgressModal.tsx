import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { CATEGORIES } from "@/lib/proofx-data";

interface Props {
  isOpen: boolean;
  sessionLabel: string;
}

// Progress here is purely cosmetic — the real work is the backend
// align-compare/reconcile request in flight, whose duration we don't know
// up front. Each bar climbs monotonically toward a near-100% ceiling,
// slowing down as it approaches it (an asymptotic curve), and never resets
// while isOpen — it just keeps inching forward for however long the real
// request takes. The parent (App.tsx) leaves the "processing" stage once
// the real API call resolves, which unmounts/closes this modal.
const PROGRESS_CEILING = 96;
const PROGRESS_TIME_CONSTANT_MS = 2600;

const AnalysisProgressModal = ({ isOpen, sessionLabel }: Props) => {
  const [progress, setProgress] = useState<number[]>([0, 0, 0, 0]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    setProgress([0, 0, 0, 0]);
    const start = Date.now();
    const offsets = [0, 150, 300, 450];

    intervalRef.current = setInterval(() => {
      const next = offsets.map((off) => {
        const t = Math.max(0, Date.now() - start - off);
        return PROGRESS_CEILING * (1 - Math.exp(-t / PROGRESS_TIME_CONSTANT_MS));
      });
      setProgress(next);
    }, 60);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const overall = Math.round(progress.reduce((a, b) => a + b, 0) / progress.length);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[100] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl p-8 w-[400px] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <ScanLine className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold tracking-tight uppercase text-primary">ProofX</span>
        </div>
        <div className="text-lg font-semibold text-foreground mb-0.5">Analysing labels</div>
        <div className="text-xs text-muted-foreground mb-6 truncate">{sessionLabel}</div>

        {/* Per-category progress */}
        <div className="space-y-4">
          {CATEGORIES.map((c, i) => {
            const pct = progress[i];
            const done = pct >= 100;
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span className="text-foreground">{c.label}</span>
                  <span className={done ? "text-accent font-medium" : "text-muted-foreground"}>
                    {done ? "Done" : "Analysing..."}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-100 ease-out rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: c.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall percentage */}
        <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
          <span>Deterministic · No ML · Audit-ready</span>
          <span className="font-medium text-foreground">{overall}%</span>
        </div>
      </div>
    </div>
  );
};

export default AnalysisProgressModal;
