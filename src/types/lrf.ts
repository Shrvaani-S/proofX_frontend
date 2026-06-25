export type { LRFCategoryId, LRFAttributeDef, LRFGroupDef, LRFCategoryDef, LRFChangeType } from "@/data/lrfAttributes";

export interface LRFChangeData {
  changeType: string;
  /** Current/master value being changed (Remove, Modify) — empty for Add. */
  oldValue: string;
  /** Value the revised label should have (Add, Modify) — empty for Remove. */
  newValue: string;
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
