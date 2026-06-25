import { LRF_ATTRIBUTE_LOOKUP } from "@/data/lrfAttributes";
import type { Finding } from "@/types/label";
import type { LRFData } from "@/types/lrf";

export function classifyFinding(
  f: Finding,
  lrfData: LRFData | null | undefined,
): "expected" | "unexpected" | null {
  if (!lrfData) return null;
  const definedIds = Object.entries(lrfData.changes)
    .filter(([, cd]) => cd.changeType !== "")
    .map(([id]) => id);
  if (definedIds.length === 0) return null;
  const desc = f.description.toLowerCase();
  const match = definedIds.some((id) => {
    const info = LRF_ATTRIBUTE_LOOKUP[id];
    if (!info || info.categoryId !== f.category) return false;
    const keywords = info.label.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    return keywords.length > 0 && keywords.some((kw) => desc.includes(kw));
  });
  return match ? "expected" : "unexpected";
}
