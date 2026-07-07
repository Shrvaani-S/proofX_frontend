export type Category = "text" | "graphics" | "barcode";

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Finding {
  id: string;
  category: Category;
  description: string;
  before: string;
  after: string;
  master: BBox;
  revised: BBox;
}

export interface LabelPair {
  id: string;
  name: string;
  masterName: string;
  revisedName: string;
  masterVersion: string;
  revisedVersion: string;
  masterUrl?: string;
  revisedUrl?: string;
  findings: Finding[];
  /** Real pixel dimensions of the compared images (post-alignment); bbox coordinates are in this
   *  space. Falls back to LABEL_W/LABEL_H (mock data) when absent. */
  width?: number;
  height?: number;
  /** True when the backend flagged this pair for a variable shift in alignment.
   *  The pair is still shown in results but findings may be unreliable. */
  alignmentFlagged?: boolean;
  /** False for a bulk-mode pair whose full findings/images haven't been
   *  fetched yet (see `bulkRef`) — fetched lazily when the user views it,
   *  rather than all at once when the batch finishes. Single-mode and history
   *  pairs are always fully loaded, so they omit this (treated as true). */
  loaded?: boolean;
  /** Findings count from the lightweight bulk-status summary, shown in the
   *  sidebar badge before the full `findings` array has been loaded. */
  findingsCount?: number;
  /** Set if the on-demand fetch for this pair failed; surfaced with a retry
   *  affordance instead of silently showing an empty/mock label. */
  loadError?: string;
  /** Coordinates needed to lazily fetch this pair's full report + images.
   *  Bulk mode only — absent for single-mode/history pairs, which already
   *  carry everything up front. */
  bulkRef?: { jobId: string; fileIndex: number; pageIndex: number };
  /** Backend run_id for a single-mode pair (see router/align_compare.py) —
   *  lets Export Report re-fetch this pair's data fresh from the backend
   *  (GET /api/history/{run_id}/report) instead of trusting client state.
   *  Empty/absent for bulk pairs, which use `bulkRef` for the same purpose. */
  run_id?: string;
}
