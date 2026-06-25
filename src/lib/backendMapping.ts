// Maps the backend's label_comparator/align_then_compare output (see
// proofx_backend/router/align_compare.py) onto this app's existing
// LabelPair/Finding types — no new finding semantics invented here, just a
//1:1 re-shaping of the backend's published JSON contract.

import type { Category, Finding, LabelPair } from "@/types/label";
import { CAT_PREFIX } from "@/constants";
import type { AlignCompareResponse, BackendFinding } from "@/lib/api";

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
  };

  return { pair, idMap };
}
