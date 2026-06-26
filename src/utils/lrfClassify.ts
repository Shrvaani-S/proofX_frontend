import { LRF_ATTRIBUTE_LOOKUP } from "@/data/lrfAttributes";
import type { Finding } from "@/types/label";
import type { LRFData } from "@/types/lrf";

// OCR never captures the URL protocol, so strip it before comparing.
function norm(val: string): string {
  return val.replace(/^https?:\/\//i, "").toLowerCase().trim();
}

// Three-tier flexible match to handle OCR word-segmentation differences:
//   1. Exact substring — fastest, used when OCR preserved spacing.
//   2. Space-normalised — collapses all whitespace before comparing, handles
//      CamelCase vs spaced variants ("MedosInternationalSARL" ↔ "Medos International SARL").
//   3. Word-level overlap — splits val into significant words (≥3 chars) and
//      checks that ≥75% appear as substrings of text; handles rotated-OCR
//      output where commas/spaces between words are lost or shuffled.
function valueIn(val: string, text: string): boolean {
  if (!val || !text) return false;
  if (text.includes(val)) return true;
  const noSp = (s: string) => s.replace(/\s+/g, "");
  if (noSp(text).includes(noSp(val))) return true;
  const words = val.split(/[\s,./:;()\-]+/).filter((w) => w.length >= 3);
  if (words.length < 2) return false;
  const hits = words.filter((w) => text.includes(w)).length;
  return hits / words.length >= 0.75;
}

export function classifyFinding(
  f: Finding,
  lrfData: LRFData | null | undefined,
): "expected" | "unexpected" | null {
  if (!lrfData) return null;
  const changes = Object.entries(lrfData.changes).filter(([, cd]) => cd.changeType !== "");
  if (changes.length === 0) return null;

  const fBefore = norm(f.before === "(not present)" ? "" : f.before);
  const fAfter  = norm(f.after  === "(not present)" ? "" : f.after);
  const desc    = f.description.toLowerCase();

  const match = changes.some(([id, cd]) => {
    const info = LRF_ATTRIBUTE_LOOKUP[id];
    if (!info || info.categoryId !== f.category) return false;

    const oldVal = norm(cd.oldValue);
    const newVal = norm(cd.newValue);

    if (oldVal && newVal) {
      // Modify — both sides must appear: old in before (or summary), new in after (or summary).
      return (valueIn(oldVal, fBefore) || valueIn(oldVal, desc)) &&
             (valueIn(newVal, fAfter)  || valueIn(newVal, desc));
    }
    if (newVal) {
      // Add — new value must appear in after.
      return valueIn(newVal, fAfter) || valueIn(newVal, desc);
    }
    if (oldVal) {
      // Remove — old value must appear in before.
      return valueIn(oldVal, fBefore) || valueIn(oldVal, desc);
    }

    // No explicit values (e.g. a symbol Add/Remove where the user only set changeType).
    // For graphics only, fall back to keyword match on the attribute label as best-effort.
    // For text/barcode without values we cannot reliably match, so leave as unexpected.
    if (f.category === "graphics") {
      const keywords = info.label.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
      return keywords.length > 0 && keywords.some((kw) => desc.includes(kw));
    }
    return false;
  });

  return match ? "expected" : "unexpected";
}
