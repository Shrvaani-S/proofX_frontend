import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, ScanLine } from "lucide-react";

const STEPS = [
  "Rendering files",
  "Calibrating resolution",
  "Aligning pages",
  "Detecting changes",
  "Classifying findings",
  "Compiling report",
];

// How long each step stays "active" before advancing (cosmetic pacing).
const STEP_DURATION_MS = 1600;
// Pause at all-green before the next pair's animation starts.
const BETWEEN_PAIRS_MS = 700;

interface PairName {
  master: string;
  revised: string;
  masterPages?: number;
  revisedPages?: number;
}

interface Props {
  isOpen: boolean;
  sessionLabel: string;
  bulkProgress?: { completed: number; total: number } | null;
  bulkPairNames?: PairName[];
  /** When false, steps are held frozen (upload still in progress).
   *  Steps start animating once this becomes true.
   *  Omit to use legacy behaviour (start immediately). */
  uploadComplete?: boolean;
  /** Set to true once the API has finished and results are ready. */
  apiDone?: boolean;
  /** Called when all steps have ticked off AND apiDone is true. */
  onComplete?: () => void;
}

const AnalysisProgressModal = ({
  isOpen,
  sessionLabel,
  bulkProgress,
  bulkPairNames,
  uploadComplete,
  apiDone,
  onComplete,
}: Props) => {
  // -1 = pre-upload / all pending; 0…STEPS.length-1 = animating; STEPS.length = all done
  const [activeStep, setActiveStep] = useState(-1);
  // Ref mirror of activeStep so the setInterval callback can read the current value
  // without a stale closure. Side-effects (clearInterval, setTimeout) must NEVER go
  // inside a React state-updater — Strict Mode invokes updaters more than once.
  const activeStepRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last `completed` value we've already acted on, so we can detect
  // a new pair finishing without double-triggering.
  const prevCompletedRef = useRef(0);
  // Set when the backend signals a pair is done while the animation is still running.
  // The animation picks this up when it naturally reaches the last step.
  const pendingNextRef = useRef(false);
  // Updated after every render so recursive setTimeout calls always get the latest function.
  const startAnimRef = useRef<(() => void) | null>(null);

  const isBulk = !!bulkProgress;
  const completed = bulkProgress?.completed ?? 0;
  const total = bulkProgress?.total ?? 1;

  // Re-assign after every render (no dep array) — all captured values are refs so
  // there is no stale-closure risk regardless of when this runs.
  useEffect(() => {
    startAnimRef.current = () => {
      if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

      activeStepRef.current = 0;
      setActiveStep(0);

      timerRef.current = setInterval(() => {
        // Read step from the ref — state would be stale inside this callback.
        const next = activeStepRef.current + 1;
        activeStepRef.current = next;
        setActiveStep(Math.min(next, STEPS.length));

        if (next >= STEPS.length) {
          // All steps done — hold here, never loop back.
          clearInterval(timerRef.current!);
          timerRef.current = null;

          if (pendingNextRef.current) {
            pendingNextRef.current = false;
            timeoutRef.current = setTimeout(() => startAnimRef.current?.(), BETWEEN_PAIRS_MS);
          }
        }
      }, STEP_DURATION_MS);
    };
  });

  // Unmount-only cleanup — effect re-runs must NOT cancel in-progress animations.
  useEffect(() => {
    return () => {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── Step animation ────────────────────────────────────────────────────────
  useEffect(() => {
    const clearAll = () => {
      if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };

    if (!isOpen)               { clearAll(); activeStepRef.current = -1; setActiveStep(-1); pendingNextRef.current = false; return; }
    if (uploadComplete === false) { clearAll(); activeStepRef.current = -1; setActiveStep(-1); pendingNextRef.current = false; return; }

    const pairJustCompleted = isBulk && completed > prevCompletedRef.current;
    prevCompletedRef.current = completed;

    if (pairJustCompleted) {
      // A pair just finished — let the current animation run at its natural pace.
      // Do NOT restart or fast-forward; just flag it so the interval can transition
      // to the next pair once "Compiling report" ticks off.
      if (!timerRef.current && !timeoutRef.current) {
        // Animation already idle (held at all-done); start next pair immediately.
        timeoutRef.current = setTimeout(() => startAnimRef.current?.(), BETWEEN_PAIRS_MS);
      } else {
        // Still animating — the interval will pick this up at STEPS.length.
        pendingNextRef.current = true;
      }
      return; // do NOT clear timers — the animation must finish uninterrupted
    }

    // Fresh start: modal opened or uploadComplete just became true.
    pendingNextRef.current = false;
    startAnimRef.current?.();
  }, [isOpen, completed, uploadComplete, isBulk]);

  // ── Completion gates ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen || isBulk) return;
    if (apiDone && activeStep >= STEPS.length) {
      onComplete?.();
    }
  }, [apiDone, activeStep, isOpen, isBulk, onComplete]);

  useEffect(() => {
    if (!isOpen || !isBulk || !apiDone || completed < total) return;
    onComplete?.();
  }, [apiDone, completed, total, isOpen, isBulk, onComplete]);

  if (!isOpen) return null;

  const activePair = bulkPairNames?.[completed] ?? null;
  const activeBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [completed]);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[100] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl p-7 w-[480px] flex flex-col gap-5">

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ScanLine className="h-4 w-4 text-primary animate-spin" style={{ animationDuration: "2.2s" }} />
            <span className="text-xs font-bold tracking-tight uppercase text-primary">ProofX</span>
          </div>
          <div className="text-lg font-semibold text-foreground">
            {isBulk ? `Analysing ${total} pair${total !== 1 ? "s" : ""}` : "Analysing labels"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{sessionLabel}</div>
        </div>

        {/* ── Bulk: active pair card ── */}
        {isBulk && activePair && (
          <div className="border rounded-lg overflow-hidden border-primary/30 bg-primary/[0.02]">
            {/* Active pair header */}
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                  <span className="text-muted-foreground">#{completed + 1}</span>
                  {" "}
                  {activePair.master}
                  <span className="text-muted-foreground mx-1">vs</span>
                  {activePair.revised}
                </div>
                {(activePair.masterPages !== undefined || activePair.revisedPages !== undefined) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {activePair.masterPages !== undefined && (
                      <span className="text-[10px] text-muted-foreground bg-surface-2 border border-border rounded px-1.5 py-0.5 leading-none">
                        {activePair.masterPages} {activePair.masterPages === 1 ? "pg" : "pgs"}
                      </span>
                    )}
                    {activePair.masterPages !== undefined && activePair.revisedPages !== undefined && (
                      <span className="text-[10px] text-muted-foreground">↔</span>
                    )}
                    {activePair.revisedPages !== undefined && (
                      <span className="text-[10px] text-muted-foreground bg-surface-2 border border-border rounded px-1.5 py-0.5 leading-none">
                        {activePair.revisedPages} {activePair.revisedPages === 1 ? "pg" : "pgs"}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">
                Processing
              </span>
            </div>

            {/* Step checklist */}
            <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
              {uploadComplete !== undefined && (
                <div className="flex items-center gap-2">
                  {uploadComplete === false
                    ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                    : <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  }
                  <span className={`text-[11px] leading-none ${uploadComplete === false ? "text-primary font-medium" : "text-foreground"}`}>
                    Uploading files
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {STEPS.map((step, si) => {
                  const done    = si < activeStep;
                  const current = si === activeStep;
                  return (
                    <div key={si} className="flex items-center gap-2">
                      {done
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        : current
                        ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                        : <Circle className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
                      }
                      <span className={`text-[11px] leading-none ${
                        done    ? "text-foreground"
                        : current ? "text-primary font-medium"
                        : "text-muted-foreground/40"
                      }`}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Bulk: compact numbered grid ── */}
        {isBulk && bulkPairNames && bulkPairNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-0.5">
            {bulkPairNames.map((pair, i) => {
              const isDone   = i < completed;
              const isActive = i === completed;
              return (
                <div
                  key={i}
                  ref={isActive ? activeBoxRef : null}
                  title={`#${i + 1}: ${pair.master} vs ${pair.revised}`}
                  className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                    isDone   ? "bg-green-500 text-white"
                    : isActive ? "bg-primary text-white"
                    : "bg-surface-2 text-muted-foreground/50 border border-border"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Single pair: step checklist ── */}
        {!isBulk && (
          <div className="flex flex-col gap-3">
            {uploadComplete !== undefined && (
              <div className="flex items-center gap-3">
                {uploadComplete === false
                  ? <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  : <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                }
                <span className={`text-sm ${uploadComplete === false ? "text-primary font-medium" : "text-foreground"}`}>
                  Uploading files
                </span>
              </div>
            )}
            {STEPS.map((step, si) => {
              const done    = si < activeStep;
              const current = si === activeStep;
              return (
                <div key={si} className="flex items-center gap-3">
                  {done
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    : current
                    ? <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                    : <Circle className="h-4 w-4 text-muted-foreground/20 shrink-0" />
                  }
                  <span className={`text-sm ${
                    done    ? "text-foreground"
                    : current ? "text-primary font-medium"
                    : "text-muted-foreground/40"
                  }`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Bulk: overall progress bar ── */}
        {isBulk && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pairs processed</span>
              <span className="font-medium text-foreground">{completed} / {total}</span>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="text-xs text-muted-foreground">
          Deterministic · No ML · Audit-ready
        </div>

      </div>
    </div>
  );
};

export default AnalysisProgressModal;
