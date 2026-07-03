import { useState } from "react";
import { HistoryPage } from "@/pages/HistoryPage";
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
import type { BulkJobStatus } from "@/lib/api";
import { buildLabelPair } from "@/lib/backendMapping";
import { buildReconcileLRF, applyReconciliation, type ReconciliationOverrides } from "@/lib/lrfReconcile";
import type { LabelPair } from "@/types/label";
import type { LRFData } from "@/types/lrf";

type Stage = "home" | "history" | "lrf" | "upload" | "processing" | "results";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(isAuthenticated);
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

  const sessionLabel =
    mode === "single"
      ? pairs[0] ? `${pairs[0].masterName} vs ${pairs[0].revisedName}` : ""
      : `${pairs.length} label pairs`;

  const runComparison = async (m: "single" | "bulk", count: number, files: UploadedFileNames) => {
    setMode(m);
    setStage("processing");
    setRunError(null);
    setBulkProgress(null);

    if (m === "single") {
      try {
        const response = await alignCompare(files.masterFiles[0], files.revisedFiles[0]);
        const pairId = "p1";
        const { pair, idMap } = buildLabelPair(pairId, files.masterNames[0], files.revisedNames[0], response);

        const nextReconciliation: Record<string, ReconciliationOverrides> = {};
        const { lrf: reconcileLrf, refImages } = lrfData
          ? buildReconcileLRF(lrfData, lrfData.metadata.crNumber || "LRF")
          : { lrf: null, refImages: [] };
        if (reconcileLrf) {
          const report = await reconcile(response.run_id, reconcileLrf, { refImages });
          nextReconciliation[pairId] = applyReconciliation(report, idMap);
        }

        setPairs([pair]);
        setReconciliationByPair(nextReconciliation);
        setStage("results");
      } catch (err) {
        setRunError(err instanceof Error ? err.message : String(err));
        setStage("upload");
      }
      return;
    }

    // ── Bulk path: POST once, poll until done ───────────────────────────────
    await startBulkFlow(files);
  };

  // Any page-count-mismatched pair is always skipped (never compared, never
  // blocks the rest of the batch) — confirmSkip is passed upfront so this is
  // a single request/poll cycle with no separate confirmation step.
  const startBulkFlow = async (files: UploadedFileNames) => {
    setStage("processing");
    setRunError(null);
    try {
      const startResp = await startBulkCompare(files.masterFiles, files.revisedFiles, { confirmSkip: true });
      setBulkProgress({ completed: 0, total: startResp.total });

      const POLL_MS = 2000;
      const finalStatus = await new Promise<BulkJobStatus>((resolve, reject) => {
        const poll = async () => {
          try {
            const status = await getBulkStatus(startResp.job_id);
            setBulkProgress({ completed: status.completed + status.failed, total: status.total });
            if (status.status === "done") {
              resolve(status);
            } else {
              setTimeout(poll, POLL_MS);
            }
          } catch (err) {
            reject(err);
          }
        };
        setTimeout(poll, POLL_MS);
      });

      const nextPairs: LabelPair[] = [];
      const nextReconciliation: Record<string, ReconciliationOverrides> = {};
      const errors: string[] = [];
      const skipped: string[] = [];

      const { lrf: reconcileLrf, refImages } = lrfData
        ? buildReconcileLRF(lrfData, lrfData.metadata.crNumber || "LRF")
        : { lrf: null, refImages: [] };

      // A file with more than one result page gets "(page N)" appended to
      // its displayed name so multi-page labels are distinguishable; a
      // single-page file (the common case) is shown exactly as before.
      const pagesPerFile = new Map<number, number>();
      for (const result of finalStatus.results) {
        if (result.status === "skipped_page_mismatch") continue;
        pagesPerFile.set(result.file_index, (pagesPerFile.get(result.file_index) ?? 0) + 1);
      }

      for (const result of finalStatus.results) {
        if (result.status === "skipped_page_mismatch") {
          skipped.push(`${result.base_name} vs ${result.revised_name}: ${result.reason ?? "page count mismatch"}`);
          continue;
        }
        if (result.status === "error" || !result.combined_report) {
          errors.push(`${result.base_name}: ${result.error ?? "unknown error"}`);
          continue;
        }
        const pageIdx = result.page_index ?? 0;
        const isMultiPage = (pagesPerFile.get(result.file_index) ?? 1) > 1;
        const pageSuffix = isMultiPage ? ` (page ${pageIdx + 1})` : "";
        const pairId = `p${result.file_index + 1}-${pageIdx + 1}`;
        const { pair, idMap } = buildLabelPair(
          pairId,
          result.base_name + pageSuffix,
          result.revised_name + pageSuffix,
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
        nextPairs.push(pair);

        if (reconcileLrf && result.run_id) {
          const report = await reconcile(result.run_id, reconcileLrf, { refImages });
          nextReconciliation[pairId] = applyReconciliation(report, idMap);
        }
      }

      if (nextPairs.length === 0 && (errors.length > 0 || skipped.length > 0)) {
        throw new Error([...skipped, ...errors].join("; "));
      }

      setPairs(nextPairs);
      setReconciliationByPair(nextReconciliation);
      setBulkProgress(null);
      setStage("results");

      const issues: string[] = [];
      if (skipped.length > 0) issues.push(`${skipped.length} pair(s) skipped: ${skipped.join("; ")}`);
      if (errors.length > 0) issues.push(`${errors.length} pair(s) failed: ${errors.join("; ")}`);
      if (issues.length > 0) setRunError(issues.join(" | "));
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setBulkProgress(null);
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
      <AnalysisProgressModal isOpen={stage === "processing"} sessionLabel={sessionLabel} bulkProgress={bulkProgress} />
    </>
  );
}
