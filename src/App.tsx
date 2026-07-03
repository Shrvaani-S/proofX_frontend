import { useEffect, useRef, useState } from "react";
import { HistoryPage } from "@/pages/HistoryPage";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { LoggedInElsewhere } from "@/pages/LoggedInElsewhere";
import { useSingleTab } from "@/hooks/use-single-tab";
import { useLogoutOnClose } from "@/hooks/use-logout-on-close";
import { LRFPage } from "@/pages/LRFPage";
import { UploadPage, type UploadedFileNames } from "@/pages/UploadPage";
import AnalysisProgressModal from "@/components/AnalysisProgressModal";
import { ResultsPage } from "@/pages/ResultsPage";
import { alignCompare, startBulkCompare, getBulkStatus, reconcile, isAuthenticated, logout } from "@/lib/api";
import type { BulkJobStatus, BulkPairResult, BulkPageMismatch } from "@/lib/api";
import { buildLabelPair } from "@/lib/backendMapping";
import { buildReconcileLRF, applyReconciliation, type ReconciliationOverrides } from "@/lib/lrfReconcile";
import type { LabelPair } from "@/types/label";
import type { LRFData } from "@/types/lrf";

type Stage = "home" | "history" | "lrf" | "upload" | "processing" | "results";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(isAuthenticated);
  // Each bulk poll cycle gets a unique generation number. Any setTimeout callback
  // whose generation doesn't match the current one is silently dropped — this
  // prevents stale polls from a cancelled/retried run from mutating state.
  const pollGenerationRef = useRef(0);

  // Redirect to login when any API call receives a 401 (token expired/revoked).
  useEffect(() => {
    const handler = () => {
      setAuthed(false);
      setStage("home");
    };
    window.addEventListener("proofx:unauthorized", handler);
    return () => window.removeEventListener("proofx:unauthorized", handler);
  }, []);

  // Cancel any in-flight poll if the component ever unmounts (edge case).
  useEffect(() => {
    return () => { pollGenerationRef.current += 1; };
  }, []);

  const tabStatus = useSingleTab(authed);
  // Log out (release the server single-session lock) when the holder tab closes.
  useLogoutOnClose(authed && tabStatus === "active");
  const [stage, setStage] = useState<Stage>("home");
  const [lrfData, setLrfData] = useState<LRFData | null>(null);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [pairs, setPairs] = useState<LabelPair[]>([]);
  const [reconciliationByPair, setReconciliationByPair] = useState<Record<string, ReconciliationOverrides>>({});
  const [runError, setRunError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number } | null>(null);
  const [bulkPairNames, setBulkPairNames] = useState<{ master: string; revised: string }[]>([]);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [pageMismatches, setPageMismatches] = useState<BulkPageMismatch[] | null>(null);
  const [pendingBulkFiles, setPendingBulkFiles] = useState<{ files: UploadedFileNames; count: number } | null>(null);
  const [pendingResults, setPendingResults] = useState<{
    pairs: LabelPair[];
    reconciliation: Record<string, ReconciliationOverrides>;
    partialError?: string;
  } | null>(null);

  const handleAnalysisComplete = () => {
    if (!pendingResults) return;
    setPairs(pendingResults.pairs);
    setReconciliationByPair(pendingResults.reconciliation);
    setRunError(pendingResults.partialError ?? null);
    setBulkProgress(null);
    setPendingResults(null);
    setStage("results");
  };

  const sessionLabel =
    mode === "single"
      ? pairs[0] ? `${pairs[0].masterName} vs ${pairs[0].revisedName}` : ""
      : `${pairs.length} label pairs`;

  const runComparison = async (m: "single" | "bulk", count: number, files: UploadedFileNames, confirmSkip = false) => {
    setMode(m);
    setStage("processing");
    setRunError(null);
    setBulkProgress(null);
    setUploadComplete(false);
    setPendingResults(null);

    try {
      let results: BulkPairResult[];

      if (m === "single") {
        const response = await alignCompare(files.masterFiles[0], files.revisedFiles[0], {
          onUploadDone: () => setUploadComplete(true),
        });

        results = [{
          file_index: 0,
          page_index: 0,
          run_id: response.run_id,
          status: "done",
          base_name: files.masterNames[0],
          revised_name: files.revisedNames[0],
          combined_report: response.combined_report,
          notes: response.notes,
          comparison_inputs: response.comparison_inputs,
          proof_png_base64: response.proof_png_base64,
          base_image_png_base64: response.base_image_png_base64,
          revised_image_png_base64: response.revised_image_png_base64,
        }];
      } else {
        // Expand pair names to page-level so the modal pair list matches
        // the backend's page-level work items (one row per page comparison).
        const expandedNames: { master: string; revised: string; masterPages?: number; revisedPages?: number }[] = [];
        for (let fi = 0; fi < files.masterFiles.length; fi++) {
          const mp = files.masterPageCounts?.[fi] ?? 1;
          const rp = files.revisedPageCounts?.[fi] ?? 1;
          const pages = Math.min(mp, rp);
          for (let p = 0; p < pages; p++) {
            const pageLabel = pages > 1 ? ` (page ${p + 1})` : "";
            expandedNames.push({
              master: `${files.masterNames[fi]}${pageLabel}`,
              revised: `${files.revisedNames[fi]}${pageLabel}`,
              masterPages: mp,
              revisedPages: rp,
            });
          }
        }
        setBulkPairNames(expandedNames);
        setBulkProgress({ completed: 0, total: expandedNames.length });

        const bulkStart = await startBulkCompare(files.masterFiles, files.revisedFiles, {
          onUploadDone: () => setUploadComplete(true),
          confirmSkip,
        });

        if ("status" in bulkStart && bulkStart.status === "needs_confirmation") {
          setStage("upload");
          setPageMismatches(bulkStart.mismatches);
          setPendingBulkFiles({ files, count });
          return;
        }

        // After the early-return guard above, bulkStart is narrowed to the success
        // shape. TypeScript can't always infer this across discriminated unions,
        // so we assert using a property-existence check as the narrowing guard.
        if (!("job_id" in bulkStart)) throw new Error("Unexpected response from bulk-compare");
        const { job_id, total: backendTotal } = bulkStart;
        // Sync total with backend's actual page count in case frontend page-count
        // reading (PDF.js) differed from what the backend computed.
        setBulkProgress({ completed: 0, total: backendTotal });
        const POLL_MS = 2000;
        // getBulkStatus's response grows every poll (it re-sends every
        // completed result's base64 images, not just new ones since the
        // last poll), so a single transient truncated/dropped response —
        // a proxy hiccup, a dev-server reload, a flaky connection — becomes
        // more likely the longer a bulk run goes. Tolerate a few consecutive
        // failures before giving up, rather than discarding an otherwise
        // near-complete run over one bad poll.
        const MAX_CONSECUTIVE_POLL_FAILURES = 3;
        let consecutivePollFailures = 0;
        // Bump the generation so any previous stale poll callbacks are ignored.
        pollGenerationRef.current += 1;
        const myGeneration = pollGenerationRef.current;
        const finalStatus = await new Promise<BulkJobStatus>((resolve, reject) => {
          const poll = async () => {
            // Bail out if this poll cycle has been superseded (retry or unmount).
            if (pollGenerationRef.current !== myGeneration) return;
            try {
              const status = await getBulkStatus(job_id);
              if (pollGenerationRef.current !== myGeneration) return;
              consecutivePollFailures = 0;
              setBulkProgress({ completed: status.completed + status.failed, total: status.total });
              if (status.status === "done") {
                resolve(status);
              } else {
                setTimeout(poll, POLL_MS);
              }
            } catch (err) {
              if (pollGenerationRef.current !== myGeneration) return;
              consecutivePollFailures += 1;
              if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
                reject(err);
              } else {
                setTimeout(poll, POLL_MS);
              }
            }
          };
          setTimeout(poll, POLL_MS);
        });

        results = finalStatus.results;
      }

      // ── Shared processing loop ─────────────────────────────────────────────
      const nextPairs: LabelPair[] = [];
      const nextReconciliation: Record<string, ReconciliationOverrides> = {};
      const errors: string[] = [];
      const skipped: string[] = [];

      const { lrf: reconcileLrf, refImages } = lrfData
        ? buildReconcileLRF(lrfData, lrfData.metadata.crNumber || "LRF")
        : { lrf: null, refImages: [] };

      // Count how many results share each file_index — files with more than one
      // entry are multi-page PDFs and need a page label in the sidebar.
      const pageCountByFile = new Map<number, number>();
      for (const r of results) {
        if (r.status === "done") {
          pageCountByFile.set(r.file_index, (pageCountByFile.get(r.file_index) ?? 0) + 1);
        }
      }

      for (const [idx, result] of results.entries()) {
        if (result.status === "error" || !result.combined_report) {
          errors.push(`${result.base_name}: ${result.error ?? "unknown error"}`);
          continue;
        }
        // Use the result's array position so every page gets a unique pairId
        // even when multiple pages come from the same file (same file_index).
        const pairId = `p${idx + 1}`;
        const isMultiPage = (pageCountByFile.get(result.file_index) ?? 1) > 1;
        const pageLabel = isMultiPage && result.page_index != null
          ? ` (page ${result.page_index + 1})`
          : "";
        const isFlagged = result.combined_report.alignment_status === "FLAGGED";
        const { pair, idMap } = buildLabelPair(
          pairId,
          `${result.base_name}${pageLabel}`,
          `${result.revised_name}${pageLabel}`,
          {
            run_id: result.run_id ?? "",
            combined_report: result.combined_report,
            notes: result.notes ?? [],
            comparison_inputs: result.comparison_inputs ?? "full_page",
            proof_png_base64: result.proof_png_base64 ?? "",
            base_image_png_base64: result.base_image_png_base64 ?? "",
            revised_image_png_base64: result.revised_image_png_base64 ?? "",
          },
        );
        if (isFlagged) pair.alignmentFlagged = true;
        nextPairs.push(pair);

        if (reconcileLrf && !isFlagged) {
          const report = await reconcile(result.run_id, reconcileLrf, { refImages });
          nextReconciliation[pairId] = applyReconciliation(report, idMap);
        }
      }

      if (nextPairs.length === 0 && (errors.length > 0 || skipped.length > 0)) {
        throw new Error([...skipped, ...errors].join("; "));
      }

      setPendingResults({
        pairs: nextPairs,
        reconciliation: nextReconciliation,
        partialError: errors.length > 0 ? `${errors.length} pair(s) failed: ${errors.join("; ")}` : undefined,
      });
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setBulkProgress(null);
      setPendingResults(null);
      setStage("upload");
    }
  };

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
    setStage("home");
  };

  // Single active tab per browser: a second tab/window is blocked outright.
  if (tabStatus === "blocked") {
    return <LoggedInElsewhere />;
  }
  if (tabStatus === "checking") {
    return null; // brief (<=250ms) probe window; avoids a flash of the wrong screen
  }

  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  if (stage === "home") {
    return (
      <HomePage
        onQuickCompare={() => { setLrfData(null); setStage("upload"); }}
        onFullWorkflow={() => setStage("lrf")}
        onLogout={handleLogout}
        onHistory={() => setStage("history")}
      />
    );
  }

  if (stage === "history") {
    return <HistoryPage onBack={() => setStage("home")} />;
  }

  if (stage === "lrf") {
    return (
      <LRFPage
        initialData={lrfData}
        onNext={(data) => { setLrfData(data); setStage("upload"); }}
        onSkip={() => { setLrfData(null); setStage("upload"); }}
        onBack={() => setStage("home")}
      />
    );
  }

  if (stage === "results") {
    return (
      <ResultsPage
        pairs={pairs}
        mode={mode}
        lrfData={lrfData}
        isLrfWorkflow={lrfData !== null}
        reconciliationByPair={reconciliationByPair}
        partialError={runError ?? undefined}
        onBack={lrfData !== null ? () => setStage("upload") : () => setStage("home")}
        onHome={() => setStage("home")}
      />
    );
  }

  return (
    <>
      <UploadPage
        lrfData={lrfData}
        runError={runError}
        onBack={() => lrfData !== null ? setStage("lrf") : setStage("home")}
        onRun={runComparison}
      />
      <AnalysisProgressModal
        isOpen={stage === "processing"}
        sessionLabel={sessionLabel}
        bulkProgress={bulkProgress}
        bulkPairNames={bulkPairNames}
        uploadComplete={uploadComplete}
        apiDone={pendingResults !== null}
        onComplete={handleAnalysisComplete}
      />

      {pageMismatches && pendingBulkFiles && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-7 w-[500px] flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground uppercase tracking-wide mb-0.5">
                  Page Count Mismatch
                </div>
                <div className="text-xs text-muted-foreground">
                  {pageMismatches.length} pair{pageMismatches.length !== 1 ? "s" : ""} cannot be compared
                </div>
              </div>
            </div>

            <p className="text-sm text-foreground leading-relaxed">
              The following pairs have different page counts between their master and revised files. They will be <span className="font-semibold">skipped</span> if you proceed.
            </p>

            <ul className="text-xs text-muted-foreground space-y-1 border border-border rounded px-4 py-3 bg-surface-2 max-h-40 overflow-y-auto">
              {pageMismatches.map((m, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="truncate font-medium text-foreground">{m.base_name}</span>
                  <span className="ml-auto shrink-0 text-[10px]">
                    {m.base_pages}p vs {m.revised_pages}p
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-3 pt-1 border-t border-border">
              <button
                onClick={() => { setPageMismatches(null); setPendingBulkFiles(null); setStage("upload"); }}
                className="px-5 py-2.5 text-sm font-semibold border border-border rounded-lg hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { files, count } = pendingBulkFiles;
                  setPageMismatches(null);
                  setPendingBulkFiles(null);
                  runComparison("bulk", count, files, true);
                }}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold uppercase tracking-wider bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors shadow-sm"
              >
                Skip &amp; Proceed
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
