// Maps the backend's label_comparator/align_then_compare output (see
// proofx_backend/router/align_compare.py) onto this app's existing
// LabelPair/Finding types — no new finding semantics invented here, just a
//1:1 re-shaping of the backend's published JSON contract.

import type { Category, Finding, LabelPair } from "@/types/label";
import { CAT_PREFIX } from "@/constants";
import type { AlignCompareResponse, BackendFinding, HistoryReport } from "@/lib/api";

const CATEGORY_BY_BACKEND_TYPE: Record<BackendFinding["type"], Category> = {
  text: "text",
  barcode: "barcode",
  graphic: "graphics",
  // label_comparator has no frontend-facing "colour-only" category; closest
  // existing bucket is graphics (colour-only changes are still visual/graphic).
  colour: "graphics",
};

export interface MappedFindings {
  findings: Finding[];
  /** backend Finding.id (int) -> frontend Finding.id (e.g. "T1") */
  idMap: Record<number, string>;
}

export function mapFindings(backendFindings: BackendFinding[]): MappedFindings {
  const counters: Record<Category, number> = { text: 0, graphics: 0, barcode: 0 };
  const idMap: Record<number, string> = {};

  const findings = backendFindings.map((bf): Finding => {
    const category = CATEGORY_BY_BACKEND_TYPE[bf.type];
    counters[category] += 1;
    const frontendId = `${CAT_PREFIX[category]}${counters[category]}`;
    idMap[bf.id] = frontendId;

    const [x, y, w, h] = bf.bbox;
    const bbox = { x, y, w, h };

    return {
      id: frontendId,
      category,
      description: bf.summary,
      before: bf.base_value ?? "(not present)",
      after: bf.revised_value ?? "(not present)",
      // Base and revised are always identical pixel dimensions at this point
      // (locked guarantee — see CLAUDE.md), so one bbox is valid for both panels.
      master: bbox,
      revised: bbox,
    };
  });

  return { findings, idMap };
}

export function buildLabelPair(
  id: string,
  masterName: string,
  revisedName: string,
  response: AlignCompareResponse,
): { pair: LabelPair; idMap: Record<number, string> } {
  const { findings, idMap } = mapFindings(response.combined_report.comparison.findings);
  const [width, height] = response.combined_report.comparison.dimensions;

  const pair: LabelPair = {
    id,
    name: masterName.replace(/\.[^/.]+$/, ""),
    masterName,
    revisedName,
    masterVersion: "base",
    revisedVersion: "revised",
    masterUrl: `data:image/png;base64,${response.base_image_png_base64}`,
    revisedUrl: `data:image/png;base64,${response.revised_image_png_base64}`,
    findings,
    width,
    height,
    // Always fully loaded — this builder is only ever called with a complete
    // AlignCompareResponse already in hand (single-mode compare, or a bulk
    // pair's on-demand detail fetch). Only bulk skeletons (App.tsx's
    // proceedBulk) start as `loaded: false`.
    loaded: true,
  };

  return { pair, idMap };
}

/** exportPDF() (ExportModal.tsx) decides how to resolve `masterUrl`/`revisedUrl`
 *  purely from the *filename's* extension (isPdf(pair.masterName)) — for a live
 *  comparison that's safe because masterUrl/revisedUrl are always the rendered
 *  post-alignment PNGs, never the raw upload, and a `.pdf`-named live pair is
 *  always the *active* pair with a real card ref to fall back on if the PDF
 *  branch is (wrongly) taken. Neither is true for a reconstructed history
 *  report — there's no DOM to fall back to — so a `.pdf`-named run would
 *  silently lose its images. Swap the extension so isPdf() always sees a
 *  non-PDF name; only affects export display, matches what the data actually is. */
function imageSafeName(name: string): string {
  return name.replace(/\.pdf$/i, ".png");
}

/** Same 1:1 reshape as buildLabelPair, sourced from GET /api/history/{run_id}/report
 *  instead of a live AlignCompareResponse — lets the history table's "Download
 *  Report" button reuse the exact same exportPDF() the results page uses,
 *  without re-running alignment. */
export function buildLabelPairFromReport(
  id: string,
  masterName: string,
  revisedName: string,
  report: HistoryReport,
): { pair: LabelPair; idMap: Record<number, string> } {
  const { findings, idMap } = mapFindings(report.findings_report.findings);
  const [width, height] = report.findings_report.dimensions;

  const safeMasterName = imageSafeName(masterName);
  const safeRevisedName = imageSafeName(revisedName);

  const pair: LabelPair = {
    id,
    name: safeMasterName.replace(/\.[^/.]+$/, ""),
    masterName: safeMasterName,
    revisedName: safeRevisedName,
    masterVersion: "base",
    revisedVersion: "revised",
    masterUrl: `data:image/png;base64,${report.base_image_png_base64}`,
    revisedUrl: `data:image/png;base64,${report.revised_image_png_base64}`,
    findings,
    width,
    height,
    loaded: true,
  };

  return { pair, idMap };
}
