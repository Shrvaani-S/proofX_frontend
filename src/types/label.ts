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
}
