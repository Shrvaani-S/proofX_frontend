// Client for the proofx_backend FastAPI routers (router/align_compare.py,
// router/reconcile.py). Mirrors the backend's actual JSON contract — see
// proofx_backend/CLAUDE.md and align_then_compare.py's `combined` dict.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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

// ── Bulk compare types ────────────────────────────────────────────────────

export interface BulkPairResult {
  index: number;
  run_id: string;
  status: "done" | "error";
  base_name: string;
  revised_name: string;
  // Present when status === "done"
  combined_report?: CombinedReport;
  notes?: string[];
  comparison_inputs?: "cropped_overlap" | "full_page";
  proof_png_base64?: string;
  base_image_png_base64?: string;
  revised_image_png_base64?: string;
  // Present when status === "error"
  error?: string;
}

export interface BulkJobStatus {
  job_id: string;
  status: "running" | "done";
  total: number;
  completed: number;
  failed: number;
  results: BulkPairResult[];
}

// ─── Auth ────────────────────────────────────────────────────────────────────

// The token lives in sessionStorage (scoped to a single tab), NOT localStorage.
// This enforces one active tab per browser: a second tab starts with no token,
// is sent to the login screen, and the backend's single-session lock rejects the
// re-login with 409 — identical to opening the app in another browser. Trade-off:
// closing the tab drops the local token (the server-side lock frees at expiry or
// on explicit logout).
const TOKEN_KEY = "proofx_token";

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

/** POST /api/auth/login — exchanges email + password for a JWT and stores it. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  const data: LoginResponse = await res.json();
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
  return data;
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/** POST /api/auth/logout — releases the single-session lock, then clears the
 *  local token regardless of the request outcome. */
export async function logout(): Promise<void> {
  const token = getToken();
  try {
    if (token) {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // Network error — still clear locally so the user isn't stuck logged in.
  } finally {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

/** Fire-and-forget logout for the page-unload (tab close) path. A normal async
 *  fetch is abandoned the moment the tab closes, so we use `keepalive` to let the
 *  request outlive the document. (sendBeacon can't carry the Authorization header
 *  this endpoint requires.) Unlike `logout()` it deliberately does NOT clear the
 *  local token: on a true close sessionStorage is discarded anyway, and on a
 *  refresh that slips past our reload guard the surviving token keeps the user
 *  signed in locally rather than bouncing them to the login screen. */
export function logoutBeacon(): void {
  const token = getToken();
  if (!token) return;
  try {
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
  } catch {
    // Unload path — nothing actionable if the request can't be dispatched.
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

  const res = await fetch(`${API_BASE_URL}/api/align-compare`, {
    method: "POST",
    body: form,
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`align-compare failed: ${await parseErrorDetail(res)}`);
  return res.json();
}

export async function startBulkCompare(
  bases: File[],
  reviseds: File[],
  opts: { page?: number; nativeResolution?: boolean } = {},
): Promise<{ job_id: string; total: number }> {
  const form = new FormData();
  for (const f of bases) form.append("bases", f);
  for (const f of reviseds) form.append("reviseds", f);
  form.append("page", String(opts.page ?? 0));
  form.append("native_resolution", String(opts.nativeResolution ?? false));

  const res = await fetch(`${API_BASE_URL}/api/bulk-compare`, {
    method: "POST",
    body: form,
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`bulk-compare failed: ${await parseErrorDetail(res)}`);
  return res.json();
}

export async function getBulkStatus(jobId: string): Promise<BulkJobStatus> {
  const res = await fetch(`${API_BASE_URL}/api/bulk-status/${jobId}`);
  if (!res.ok) throw new Error(`bulk-status failed: ${await parseErrorDetail(res)}`);
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

  const res = await fetch(`${API_BASE_URL}/api/reconcile`, {
    method: "POST",
    body: form,
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`reconcile failed: ${await parseErrorDetail(res)}`);
  return res.json();
}

// ── History ───────────────────────────────────────────────────────────────────

export interface HistoryRun {
  run_id: string;
  created_at: string;
  base_name: string;
  revised_name: string;
  mode: "single" | "bulk";
  pair_count: number;
  findings_count: number | null;
  workflow: string | null;
  status: "pass" | "fail";
}

export interface HistoryResponse {
  runs: HistoryRun[];
  count: number;
}

// Backend now stamps "Visual Comparison" / "Proof Reading" on new runs, but
// rows created before that rename may still carry the old null / "LRF"
// values — map those to the current product naming so old history rows
// still render sensibly.
export function workflowDisplayName(workflow: string | null): string {
  if (workflow === null) return "Visual Comparison";
  if (workflow === "LRF") return "Proof Reading";
  return workflow;
}

export async function getHistory(
  opts: { skip?: number; limit?: number } = {},
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (opts.skip !== undefined) params.set("skip", String(opts.skip));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const res = await fetch(`${API_BASE_URL}/api/history?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`history fetch failed: ${await parseErrorDetail(res)}`);
  return res.json();
}

export async function downloadProof(runId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/history/${runId}/proof`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`download failed: ${await parseErrorDetail(res)}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ProofX_Report_${runId}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportHistoryCSV(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/history/export/csv`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`history CSV export failed: ${await parseErrorDetail(res)}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cd = res.headers.get("content-disposition") ?? "";
  const match = cd.match(/filename="?([^"]+)"?/);
  a.download = match ? match[1] : "ProofX_History.csv";
  a.click();
  URL.revokeObjectURL(url);
}
