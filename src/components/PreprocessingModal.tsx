import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, ScanLine, XCircle } from "lucide-react";
import type { BulkExcludedPage } from "@/lib/api";

const PREPROCESS_STEPS = [
  "Rendering files",
  "Calibrating resolution",
  "Aligning pages",
];

const STEP_DURATION_MS = 1800;
const BETWEEN_PAIRS_MS = 0;

export interface PreprocessPairName {
  master: string;
  revised: string;
  fileIndex: number;
  pageIndex: number;
}

interface Props {
  isOpen: boolean;
  total: number;
  done: number;
  uploadComplete: boolean;
  pairNames: PreprocessPairName[];
  excluded: BulkExcludedPage[];
  isComplete?: boolean;
  onContinue?: () => void;
  onReupload?: () => void;
}

const PreprocessingModal = ({
  isOpen,
  total,
  done,
  uploadComplete,
  pairNames,
  excluded,
  isComplete = false,
  onContinue,
  onReupload,
}: Props) => {
  const [activeStep, setActiveStep] = useState(-1);
  const activeStepRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDoneRef = useRef(0);
  const pendingNextRef = useRef(false);
  // True when the timer has reached the last step and is waiting for `done` to increment
  const waitingForDoneRef = useRef(false);
  const startAnimRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    startAnimRef.current = () => {
      if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      activeStepRef.current = 0;
      setActiveStep(0);
      timerRef.current = setInterval(() => {
        const next = activeStepRef.current + 1;
        activeStepRef.current = next;
        setActiveStep(Math.min(next, PREPROCESS_STEPS.length));

        // Stop at the last step — only tick it off when done actually increments
        if (next >= PREPROCESS_STEPS.length - 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          waitingForDoneRef.current = true;

          if (pendingNextRef.current) {
            // done already arrived while we were animating — hold for a full step
            // duration first so all pairs look uniform, then complete
            pendingNextRef.current = false;
            timeoutRef.current = setTimeout(() => {
              waitingForDoneRef.current = false;
              activeStepRef.current = PREPROCESS_STEPS.length;
              setActiveStep(PREPROCESS_STEPS.length);
              timeoutRef.current = setTimeout(() => startAnimRef.current?.(), BETWEEN_PAIRS_MS);
            }, STEP_DURATION_MS);
          }
          // else: waitingForDoneRef = true, will be resolved when done fires
        }
      }, STEP_DURATION_MS);
    };
  });

  useEffect(() => {
    return () => {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const clearAll = () => {
      if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };

    if (!isOpen)       { clearAll(); activeStepRef.current = -1; setActiveStep(-1); pendingNextRef.current = false; waitingForDoneRef.current = false; return; }
    if (!uploadComplete) { clearAll(); activeStepRef.current = -1; setActiveStep(-1); pendingNextRef.current = false; waitingForDoneRef.current = false; return; }

    const pairJustCompleted = done > prevDoneRef.current;
    prevDoneRef.current = done;

    if (pairJustCompleted) {
      if (waitingForDoneRef.current) {
        if (!timeoutRef.current) {
          // Normal case: animation is holding at last step, done just arrived — tick it off
          waitingForDoneRef.current = false;
          activeStepRef.current = PREPROCESS_STEPS.length;
          setActiveStep(PREPROCESS_STEPS.length);
          timeoutRef.current = setTimeout(() => startAnimRef.current?.(), BETWEEN_PAIRS_MS);
        }
        // else: timeout already scheduled via pendingNextRef path — let it complete naturally
      } else if (!timerRef.current && !timeoutRef.current) {
        timeoutRef.current = setTimeout(() => startAnimRef.current?.(), BETWEEN_PAIRS_MS);
      } else {
        // Timer still running before the last step
        pendingNextRef.current = true;
      }
      return;
    }

    pendingNextRef.current = false;
    startAnimRef.current?.();
  }, [isOpen, done, uploadComplete]);

  if (!isOpen) return null;

  const currentPair = pairNames[done] ?? null;
  const excludedSet = new Set(excluded.map(e => `${e.file_index}-${e.page_index ?? 0}`));
  const passedPairs = pairNames
    .slice(0, done)
    .filter(p => !excludedSet.has(`${p.fileIndex}-${p.pageIndex}`));

  const failLabel = (c: string) => {
    if (c === "variable_shift")      return "Layout mismatch";
    if (c === "page_count_mismatch") return "Page count differs";
    if (c === "dimension_error")     return "Size mismatch";
    return "Processing failed";
  };

  const failDescription = (c: string) => {
    if (c === "variable_shift")      return "Pages could not be aligned for comparison";
    if (c === "page_count_mismatch") return "Master and revised have different page counts";
    if (c === "dimension_error")     return "Page dimensions differ between master and revised";
    return "An error occurred while processing this file";
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[100] flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl p-7 w-[580px] flex flex-col gap-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ScanLine className="h-4 w-4 text-primary animate-spin" style={{ animationDuration: "2.2s" }} />
            <span className="text-xs font-bold tracking-tight uppercase text-primary">ProofX</span>
          </div>
          <div className="text-lg font-semibold text-foreground">
            Pre-processing {total} pair{total !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Pipeline animation — current pair */}
        {currentPair && (
          <div className="border rounded-lg overflow-hidden border-primary/30 bg-primary/[0.02]">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                  <span className="text-muted-foreground">#{done + 1}</span>
                  {" "}{currentPair.master}
                  <span className="text-muted-foreground mx-1">vs</span>
                  {currentPair.revised}
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">
                Processing
              </span>
            </div>

            <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
              {/* Upload step */}
              <div className="flex items-center gap-2">
                {!uploadComplete
                  ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                  : <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                }
                <span className={`text-[11px] leading-none ${!uploadComplete ? "text-primary font-medium" : "text-foreground"}`}>
                  Uploading files
                </span>
              </div>
              {/* Pre-process steps */}
              {PREPROCESS_STEPS.map((step, si) => {
                const done_ = si < activeStep;
                const current = si === activeStep;
                return (
                  <div key={si} className="flex items-center gap-2">
                    {done_
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      : current
                      ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                      : <Circle className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
                    }
                    <span className={`text-[11px] leading-none ${done_ ? "text-foreground" : current ? "text-primary font-medium" : "text-muted-foreground/40"}`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pass + Fail tables — always rendered so modal height stays stable */}
        <div className="flex gap-3">
          {/* Pass */}
          <div className="flex-1 border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-b border-border">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
              <span className="text-xs font-semibold text-green-800">Pass ({passedPairs.length})</span>
            </div>
            <div className="h-40 overflow-y-auto">
              {passedPairs.length === 0
                ? <div className="px-3 py-2 text-[11px] text-muted-foreground italic">None yet</div>
                : passedPairs.map((p, i) => (
                  <div key={i} className="px-3 py-1.5 text-[11px] text-foreground truncate border-b border-border/40 last:border-0">
                    {p.master}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Skipped — all excluded, with reason */}
          <div className="flex-1 border border-red-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-b border-red-200">
              <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
              <span className="text-xs font-semibold text-red-800">Skipped ({excluded.length})</span>
            </div>
            <div className="h-40 overflow-y-auto">
              {excluded.length === 0
                ? <div className="px-3 py-2 text-[11px] text-muted-foreground italic">None</div>
                : excluded.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 border-b border-red-100/60 last:border-0 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-1 text-[11px] text-foreground truncate min-w-0">
                          {e.base_name}
                        </span>
                        {e.page_index != null && (
                          <span className="text-[10px] text-muted-foreground shrink-0">Page {e.page_index + 1}</span>
                        )}
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-red-500 shrink-0">
                          {failLabel(e.classification)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {failDescription(e.classification)}
                      </p>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Pre-processing</span>
            <span className="font-medium text-foreground">{done} / {total}</span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>

        {isComplete && (
          <div className="flex gap-3">
            {onReupload && (
              <button
                onClick={onReupload}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold hover:bg-surface-2 active:bg-surface-2/80 transition-colors"
              >
                Re-upload
              </button>
            )}
            <button
              onClick={onContinue}
              className={`${onReupload ? "flex-1" : "w-full"} py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:bg-primary/80 transition-colors`}
            >
              Continue
            </button>
          </div>
        )}

        <div className="text-xs text-muted-foreground">Deterministic · No ML · Audit-ready</div>
      </div>
    </div>
  );
};

export default PreprocessingModal;
