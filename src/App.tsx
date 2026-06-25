import { useState } from "react";
import { HomePage } from "@/pages/HomePage";
import { LRFPage } from "@/pages/LRFPage";
import { UploadPage, type UploadedFileNames } from "@/pages/UploadPage";
import AnalysisProgressModal from "@/components/AnalysisProgressModal";
import { ResultsPage } from "@/pages/ResultsPage";
import { alignCompare, reconcile } from "@/lib/api";
import { buildLabelPair } from "@/lib/backendMapping";
import { buildReconcileLRF, applyReconciliation, type ReconciliationOverrides } from "@/lib/lrfReconcile";
import type { LabelPair } from "@/types/label";
import type { LRFData } from "@/types/lrf";

type Stage = "home" | "lrf" | "upload" | "processing" | "results";

export default function App() {
  const [stage, setStage] = useState<Stage>("home");
  const [lrfData, setLrfData] = useState<LRFData | null>(null);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [pairs, setPairs] = useState<LabelPair[]>([]);
  const [reconciliationByPair, setReconciliationByPair] = useState<Record<string, ReconciliationOverrides>>({});
  const [runError, setRunError] = useState<string | null>(null);

  const sessionLabel =
    mode === "single"
      ? pairs[0] ? `${pairs[0].masterName} vs ${pairs[0].revisedName}` : ""
      : `${pairs.length} label pairs`;

  const runComparison = async (m: "single" | "bulk", count: number, files: UploadedFileNames) => {
    setMode(m);
    setStage("processing");
    setRunError(null);
    try {
      const nextPairs: LabelPair[] = [];
      const nextReconciliation: Record<string, ReconciliationOverrides> = {};

      for (let i = 0; i < count; i++) {
        const response = await alignCompare(files.masterFiles[i], files.revisedFiles[i]);
        const pairId = `p${i + 1}`;
        const { pair, idMap } = buildLabelPair(
          pairId, files.masterNames[i], files.revisedNames[i], response,
        );
        nextPairs.push(pair);

        const { lrf: reconcileLrf, refImages } = lrfData
          ? buildReconcileLRF(lrfData, lrfData.metadata.crNumber || "LRF")
          : { lrf: null, refImages: [] };
        if (reconcileLrf) {
          const report = await reconcile(response.run_id, reconcileLrf, { refImages });
          nextReconciliation[pairId] = applyReconciliation(report, idMap);
        }
      }

      setPairs(nextPairs);
      setReconciliationByPair(nextReconciliation);
      setStage("results");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setStage("upload");
    }
  };

  if (stage === "home") {
    return (
      <HomePage
        onQuickCompare={() => { setLrfData(null); setStage("upload"); }}
        onFullWorkflow={() => setStage("lrf")}
      />
    );
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
      <AnalysisProgressModal isOpen={stage === "processing"} sessionLabel={sessionLabel} />
    </>
  );
}
