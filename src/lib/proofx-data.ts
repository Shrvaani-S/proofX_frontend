// Barrel re-export — file split into:
//   @/types/label    (Category, BBox, Finding, LabelPair)
//   @/constants      (LABEL_W, LABEL_H, CATEGORIES, CAT_COLOR, CAT_PREFIX)
//   @/data/mockData  (MOCK_PAIRS)
export type { Category, BBox, Finding, LabelPair } from "@/types/label";
export { LABEL_W, LABEL_H, CATEGORIES, CAT_COLOR, CAT_PREFIX } from "@/constants";
export { MOCK_PAIRS } from "@/data/mockData";
