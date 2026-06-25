import type { LRFCategoryId } from "@/data/lrfAttributes";

interface Props {
  counts: Record<LRFCategoryId, number>;
}

const CHIP: Record<LRFCategoryId, string> = {
  text:     "bg-blue-100 text-blue-800",
  graphics: "bg-violet-100 text-violet-800",
  barcode:  "bg-amber-100 text-amber-800",
};

const LABELS: Record<LRFCategoryId, string> = {
  text:     "Text",
  graphics: "Graphics",
  barcode:  "Barcode",
};

const ORDER: LRFCategoryId[] = ["text", "graphics", "barcode"];

export default function LRFSummaryBar({ counts }: Props) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-5 py-3">
      <span className="text-sm font-medium text-foreground">Summary:</span>
      {ORDER.map((cat) =>
        counts[cat] > 0 ? (
          <span
            key={cat}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${CHIP[cat]}`}
          >
            {LABELS[cat]}: {counts[cat]}
          </span>
        ) : null
      )}
    </div>
  );
}
