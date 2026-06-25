// Client for the proofx_backend FastAPI routers (router/align_compare.py,
// router/reconcile.py). Mirrors the backend's actual JSON contract — see
// proofx_backend/CLAUDE.md and align_then_compare.py's `combined` dict.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://label-comparator-new.azurewebsites.net";

export interface BackendFinding {
  id: number;
  type: "text" | "barcode" | "graphic" | "colour";
  bbox: [number, number, number, number]; // x, y, w, h
  summary: string;
  base_value: string | null;
  revised_value: string | null;
  delta_e_max: number;
  ocr_confidence: number | null;
  low_confidence: boolean;
}

export interface ComparisonReport {
  pair_id: string;
  dimensions: [number, number]; // width, height — identical for base/revised, post-alignment
  dpi: number;
  summary: { total: number; by_type: Record<string, number>; low_confidence_count: number };
  findings: BackendFinding[];
  effective_delta_e_threshold?: number;
}

export interface CombinedReport {
  pair_id: string;
  alignment_method: string;
  alignment_status: string;
  comparison_inputs: "cropped_overlap" | "full_page";
  effective_delta_e_threshold: number;
  resolution_mode: string;
  glyph_stroke_px: number | null;
  resolution_upscale_factor: number;
  low_confidence_resolution: boolean;
  working_long_edge_px: number;
  uncompared_regions: unknown;
  notes: string[];
  alignment: unknown;
  comparison: ComparisonReport;
}

export interface AlignCompareResponse {
  run_id: string;
  combined_report: CombinedReport;
  notes: string[];
  comparison_inputs: "cropped_overlap" | "full_page";
  proof_png_base64: string;
  base_image_png_base64: string;
  revised_image_png_base64: string;
}

export interface ReconcileRequirement {
  id: string;
  field: string;
  old: string;
  new: string;
  match_type?: string;
}

export interface ReconcileLRF {
  lrf_id: string;
  requirements: ReconcileRequirement[];
}

/** A reference image to upload alongside a reconcile() call — `name` must match
 *  the `ref_image:<name>` token used in the corresponding requirement's old/new value
 *  (see reconciliation_layer's "graphic" match_type: two reference images, old + new). */
export interface RefImageUpload {
  name: string;
  file: File;
}

export type ReconcileVerdict = "DONE_CORRECT" | "DONE_INCORRECT" | "NOT_DONE" | "NEEDS_REVIEW";

export interface ReconcileReportRequirement {
  id: string;
  field: string;
  match_type: string;
  verdict: ReconcileVerdict;
  evidence_finding_ids: number[];
  reason: string;
}

export interface ReconcileUnexpectedItem {
  change: string;
  finding_ids: number[];
  acknowledged: boolean;
}

export interface ReconcileReport {
  lrf_id: string;
  pair_id: string;
  overall: "PASS" | "BLOCKED";
  global_flags: string[];
  requirements: ReconcileReportRequirement[];
  unexpected: ReconcileUnexpectedItem[];
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function alignCompare(
  base: File,
  revised: File,
  opts: { page?: number; nativeResolution?: boolean } = {},
): Promise<AlignCompareResponse> {
  const form = new FormData();
  form.append("base", base);
  form.append("revised", revised);
  form.append("page", String(opts.page ?? 0));
  form.append("native_resolution", String(opts.nativeResolution ?? false));

  const res = await fetch(`${API_BASE_URL}/api/align-compare`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`align-compare failed: ${await parseErrorDetail(res)}`);
  return res.json();
}

export async function reconcile(
  runId: string,
  lrf: ReconcileLRF,
  opts: { reviewerAcknowledged?: string[]; refImages?: RefImageUpload[] } = {},
): Promise<ReconcileReport> {
  const form = new FormData();
  form.append("run_id", runId);
  form.append("lrf", JSON.stringify(lrf));
  form.append("reviewer_acknowledged", JSON.stringify(opts.reviewerAcknowledged ?? []));
  for (const ref of opts.refImages ?? []) {
    form.append("ref_images", ref.file, ref.name);
  }

  const res = await fetch(`${API_BASE_URL}/api/reconcile`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`reconcile failed: ${await parseErrorDetail(res)}`);
  return res.json();
}
