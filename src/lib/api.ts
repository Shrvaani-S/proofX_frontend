// Client for the proofx_backend FastAPI routers (router/align_compare.py,
// router/reconcile.py). Mirrors the backend's actual JSON contract — see
// proofx_backend/CLAUDE.md and align_then_compare.py's `combined` dict.

// Fail early in production builds if the API URL is not configured.
if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  throw new Error("[ProofX] VITE_API_BASE_URL is not set. Configure it in your .env file before building for production.");
}
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

/** LRF session metadata forwarded to the backend so it can persist them
 *  alongside the run and return them in future history-report fetches. */
export interface ReconcileLRFMetadata {
  requested_by?: string;
  cr_number?: string;
  part_number?: string;
  product_name?: string;
  label_version?: string;
  date?: string;
}

export interface ReconcileLRF {
  lrf_id: string;
  requirements: ReconcileRequirement[];
  /** Optional — backend stores these and returns them in HistoryReport. */
  metadata?: ReconcileLRFMetadata;
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
//
// The bulk pipeline is two-phase: POST /bulk-compare pre-processes (aligns)
// every page in the background and parks the job in `needs_confirmation` with
// a list of the pages it will NOT compare; the user then confirms (compare the
// survivors) or cancels (discard + re-upload). Comparison output images are no
// longer returned inline — they are pulled per page from GET /bulk-image.

/** A page the backend flagged during pre-processing and will not compare. */
export interface BulkExcludedPage {
  file_index: number;
  page_index: number | null; // null for a whole-file page-count mismatch
  base_name: string;
  revised_name: string;
  classification: "dimension_error" | "variable_shift" | "page_count_mismatch" | "error";
  reason?: string | null;
}

/** Lightweight per-page summary carried in the poll response (no images, no
 *  full report — those are fetched on demand). */
export interface BulkPageResultSummary {
  file_index: number;
  page_index: number | null;
  base_name: string;
  revised_name: string;
  status: "done" | "error";
  findings_total?: number;
  comparison_inputs?: "cropped_overlap" | "full_page";
  alignment_status?: string | null;
  low_confidence?: boolean;
  error?: string;
}

export type BulkJobPhase =
  | "preprocessing"
  | "needs_confirmation"
  | "comparing"
  | "done"
  | "error";

export interface BulkJobStatus {
  job_id: string;
  status: BulkJobPhase;
  phase_a: { total: number; done: number };
  compare: { total: number; completed: number; failed: number };
  excluded: BulkExcludedPage[];
  excluded_count: number;
  will_compare_count: number;
  results: BulkPageResultSummary[];
  error?: string | null;
}

export interface BulkCompareStartResponse {
  job_id: string;
  status: "preprocessing";
}

/** Full detail for one compared page (GET /bulk-result). */
export interface BulkPageReport {
  job_id?: string;
  file_index?: number;
  page_index?: number;
  combined_report: CombinedReport;
  notes: string[];
  comparison_inputs: "cropped_overlap" | "full_page";
}

/** Client-assembled per-page result: the poll summary joined with its
 *  on-demand report + fetched images, shaped like the old inline result so the
 *  shared render loop stays unchanged. */
export interface BulkPairResult {
  file_index: number;
  page_index: number | null;
  run_id: string;
  status: "done" | "error" | "skipped_page_mismatch";
  base_name: string;
  revised_name: string;
  combined_report?: CombinedReport;
  notes?: string[];
  comparison_inputs?: "cropped_overlap" | "full_page";
  proof_png_base64?: string;
  base_image_png_base64?: string;
  revised_image_png_base64?: string;
  error?: string;
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

/** Clears the local token and dispatches an event so the UI can redirect to login. */
function handleUnauthorized(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new CustomEvent("proofx:unauthorized"));
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/** POST via XHR so we can fire `onUploadDone` the moment the request body
 *  has been fully sent (before the server responds). */
function xhrPost<T>(
  url: string,
  form: FormData,
  opts?: { onUploadDone?: () => void; headers?: Record<string, string> },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (opts?.headers) {
      for (const [k, v] of Object.entries(opts.headers)) {
        xhr.setRequestHeader(k, v);
      }
    }
    if (opts?.onUploadDone) {
      xhr.upload.addEventListener("load", opts.onUploadDone);
    }
    xhr.onload = () => {
      if (xhr.status === 401) {
        handleUnauthorized();
        reject(new Error("Session expired. Please log in again."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        let detail = xhr.statusText;
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string };
          detail = body.detail ?? xhr.statusText;
        } catch {}
        reject(new Error(detail));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function alignCompare(
  base: File,
  revised: File,
  opts: { page?: number; nativeResolution?: boolean; onUploadDone?: () => void } = {},
): Promise<AlignCompareResponse> {
  const form = new FormData();
  form.append("base", base);
  form.append("revised", revised);
  form.append("page", String(opts.page ?? 0));
  form.append("native_resolution", String(opts.nativeResolution ?? false));

  try {
    return await xhrPost<AlignCompareResponse>(`${API_BASE_URL}/api/align-compare`, form, {
      onUploadDone: opts.onUploadDone,
      headers: authHeaders(),
    });
  } catch (err) {
    throw new Error(`align-compare failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** POST /api/bulk-compare — saves the uploads and kicks off phase-A
 *  pre-processing in the background. Returns immediately; poll getBulkStatus. */
export async function startBulkCompare(
  bases: File[],
  reviseds: File[],
  opts: { nativeResolution?: boolean; onUploadDone?: () => void } = {},
): Promise<BulkCompareStartResponse> {
  const form = new FormData();
  for (const f of bases) form.append("bases", f);
  for (const f of reviseds) form.append("reviseds", f);
  form.append("native_resolution", String(opts.nativeResolution ?? false));

  try {
    return await xhrPost<BulkCompareStartResponse>(`${API_BASE_URL}/api/bulk-compare`, form, {
      onUploadDone: opts.onUploadDone,
      headers: authHeaders(),
    });
  } catch (err) {
    throw new Error(`bulk-compare failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** GET /api/bulk-status/{job_id} — poll one bulk job's progress.
 *
 *  `resultsSince`/`excludedSince` ask the backend for only the entries
 *  appended since the caller's last poll (both lists are append-only), rather
 *  than resending the whole accumulated list every tick. Pass the previous
 *  response's `compare.completed + compare.failed` / `excluded_count` as the
 *  next call's cursor. Omit both to get everything from the start. */
export async function getBulkStatus(
  jobId: string,
  opts: { resultsSince?: number; excludedSince?: number } = {},
): Promise<BulkJobStatus> {
  const params = new URLSearchParams();
  if (opts.resultsSince) params.set("results_since", String(opts.resultsSince));
  if (opts.excludedSince) params.set("excluded_since", String(opts.excludedSince));
  const qs = params.toString();
  const res = await fetch(`${API_BASE_URL}/api/bulk-status/${jobId}${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`bulk-status failed: ${detail}`);
  }
  return res.json();
}

/** POST /api/bulk-confirm/{job_id} — proceed past the popup: compare the
 *  surviving (non-excluded) pages. Poll getBulkStatus until status === "done". */
export async function confirmBulk(
  jobId: string,
): Promise<{ job_id: string; status: string; total: number }> {
  const res = await fetch(`${API_BASE_URL}/api/bulk-confirm/${jobId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await parseErrorDetail(res));
  }
  return res.json();
}

/** POST /api/bulk-cancel/{job_id} — discard the job and all its stored files
 *  (the re-upload path). */
export async function cancelBulk(
  jobId: string,
): Promise<{ job_id: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/bulk-cancel/${jobId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await parseErrorDetail(res));
  }
  return res.json();
}

/** GET /api/bulk-result/{job_id}/{file_index}/{page_index} — full detail
 *  (combined report + notes) for one compared page. */
export async function getBulkResult(
  jobId: string,
  fileIndex: number,
  pageIndex: number,
): Promise<BulkPageReport> {
  const res = await fetch(
    `${API_BASE_URL}/api/bulk-result/${jobId}/${fileIndex}/${pageIndex}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await parseErrorDetail(res));
  }
  return res.json();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("failed to read image blob"));
    reader.onloadend = () => {
      // reader.result is a "data:image/png;base64,XXXX" URL — strip the prefix
      // so the value matches the raw base64 the render layer expects.
      const dataUrl = String(reader.result ?? "");
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}

/** GET /api/bulk-image/... — fetch one output image (auth-protected, so it
 *  can't go straight in an <img src>) and return it as raw base64. */
export async function fetchBulkImageBase64(
  jobId: string,
  fileIndex: number,
  pageIndex: number,
  kind: "proof" | "base" | "revised",
): Promise<string> {
  const res = await fetch(
    `${API_BASE_URL}/api/bulk-image/${jobId}/${fileIndex}/${pageIndex}/${kind}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`bulk-image failed: ${res.statusText}`);
  }
  return blobToBase64(await res.blob());
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
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`reconcile failed: ${await parseErrorDetail(res)}`);
  }
  return res.json();
}

export async function bulkReconcile(
  jobId: string,
  fileIndex: number,
  pageIndex: number,
  lrf: ReconcileLRF,
  opts: { reviewerAcknowledged?: string[]; refImages?: RefImageUpload[] } = {},
): Promise<ReconcileReport> {
  const form = new FormData();
  form.append("lrf", JSON.stringify(lrf));
  form.append("reviewer_acknowledged", JSON.stringify(opts.reviewerAcknowledged ?? []));
  for (const ref of opts.refImages ?? []) {
    form.append("ref_images", ref.file, ref.name);
  }

  const res = await fetch(
    `${API_BASE_URL}/api/bulk-reconcile/${jobId}/${fileIndex}/${pageIndex}`,
    { method: "POST", body: form, headers: authHeaders() },
  );
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`bulk reconcile failed: ${await parseErrorDetail(res)}`);
  }
  return res.json();
}

// ── History ───────────────────────────────────────────────────────────────────

export interface HistoryFilePair {
  base_name: string;
  revised_name: string;
  status: "done" | "error" | "skipped_page_mismatch";
}

export interface HistoryRun {
  run_id: string;
  created_at: string;
  base_name: string;
  revised_name: string;
  mode: "single" | "bulk";
  pair_count: number;
  analysed_pair_count: number;
  skipped_count: number;
  file_pairs: HistoryFilePair[] | null;
  findings_count: number | null;
  workflow: string | null;
  status: "pass" | "fail";
}

// GET /api/history/{run_id}/report — everything needed to rebuild a
// LabelPair and re-run the same exportPDF() the results page uses, without
// re-running alignment. Only ever populated for single-mode passing runs.
export interface HistoryReport {
  run_id: string;
  base_name: string;
  revised_name: string;
  findings_report: ComparisonReport;
  base_image_png_base64: string;
  revised_image_png_base64: string;
  reconcile_report: ReconcileReport | null;
  /** Populated once the backend stores LRF metadata on the reconcile call. */
  requested_by?: string | null;
  cr_number?: string | null;
  part_number?: string | null;
  product_name?: string | null;
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
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`history fetch failed: ${await parseErrorDetail(res)}`);
  }
  return res.json();
}

export async function getHistoryReport(runId: string): Promise<HistoryReport> {
  const res = await fetch(`${API_BASE_URL}/api/history/${runId}/report`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`report fetch failed: ${await parseErrorDetail(res)}`);
  }
  return res.json();
}

export async function downloadProof(runId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/history/${runId}/proof`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`download failed: ${await parseErrorDetail(res)}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ProofX_Report_${runId}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/** GET /api/history/{run_id}/export-pdf — server-rendered report PDF
 *  (report_pdf.py), single mode. Replaces the old client-side jsPDF
 *  assembly (ExportModal.tsx's exportPDF()) for this flow: the backend
 *  renders from its own persisted findings/images/reconciliation data, so
 *  the export is authoritative regardless of frontend/browser state. */
export async function downloadHistoryReportPdf(runId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/history/${runId}/export-pdf`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`export-pdf failed: ${await parseErrorDetail(res)}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ProofX_Report_${runId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface BulkExportStatus {
  job_id: string;
  export_status: "running" | "done" | "error" | null;
  export_error: string | null;
}

/** POST /api/bulk-jobs/{job_id}/export-pdf — kick off server-side PDF report
 *  generation for a completed bulk job. Job-based (matches the bulk-compare
 *  two-phase pattern) since rendering a large batch (S3 fetch + reconcile +
 *  draw per page) can take a while: poll getBulkExportStatus until
 *  "done"/"error", then downloadBulkExportResult. */
export async function startBulkExportPdf(
  jobId: string,
): Promise<{ job_id: string; export_status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/bulk-jobs/${jobId}/export-pdf`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await parseErrorDetail(res));
  }
  return res.json();
}

export async function getBulkExportStatus(jobId: string): Promise<BulkExportStatus> {
  const res = await fetch(`${API_BASE_URL}/api/bulk-jobs/${jobId}/export-status`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await parseErrorDetail(res));
  }
  return res.json();
}

export async function downloadBulkExportResult(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/bulk-jobs/${jobId}/export-result`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`export-result failed: ${await parseErrorDetail(res)}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ProofX_Bulk_Report_${jobId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportHistoryCSV(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/history/export/csv`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(`history CSV export failed: ${await parseErrorDetail(res)}`);
  }
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
