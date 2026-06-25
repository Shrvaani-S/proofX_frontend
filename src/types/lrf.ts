export type { LRFCategoryId, LRFAttributeDef, LRFGroupDef, LRFCategoryDef, LRFChangeType } from "@/data/lrfAttributes";

export interface LRFChangeData {
  changeType: string;
  /** Current/master value being changed (Remove, Modify) — empty for Add. For image
   *  attributes (e.g. logo_change), this holds the uploaded old image's filename. */
  oldValue: string;
  /** Value the revised label should have (Add, Modify) — empty for Remove. For image
   *  attributes, this holds the uploaded new image's filename. */
  newValue: string;
  /** The actual uploaded old reference image (image attributes only, changeType "Modify") —
   *  needed for real graphic-diff reconciliation, since the backend's logo match_type
   *  compares real image bytes, not a filename string. */
  oldFile?: File;
  /** The actual uploaded new reference image (image attributes, "Add" or "Modify"). */
  newFile?: File;
}

export interface LRFMetadata {
  crNumber: string;
  partNumber: string;
  labelVersion: string;   // "Rev A → Rev B" combined format
  productName: string;
  requestedBy: string;
  date: string;
}

export interface LRFData {
  metadata: LRFMetadata;
  /** keyed by attribute id — only attributes with a non-empty changeType are considered active */
  changes: Record<string, LRFChangeData>;
  /** keyed by group id — custom attributes added by the user */
  customAttributes: Record<string, import("@/data/lrfAttributes").LRFAttributeDef[]>;
}
