import { Type, ShieldCheck, Barcode, ChevronDown } from "lucide-react";
import type { LRFCategoryId } from "@/data/lrfAttributes";

interface Props {
  activeCategory: LRFCategoryId | null;
  changeCounts: Record<LRFCategoryId, number>;
  onSelect: (cat: LRFCategoryId) => void;
}

const TAB_CONFIG: { id: LRFCategoryId; label: string; Icon: React.ElementType }[] = [
  { id: "text",     label: "Text",     Icon: Type        },
  { id: "graphics", label: "Graphics", Icon: ShieldCheck },
  { id: "barcode",  label: "Barcode",  Icon: Barcode     },
];

export default function LRFCategoryTabs({ activeCategory, changeCounts, onSelect }: Props) {
  return (
    <div className="py-4 px-4 relative z-10 bg-white">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Select Change Category
      </p>
      <div className="grid grid-cols-3 gap-3">
        {TAB_CONFIG.map(({ id, label, Icon }) => {
          const isActive = activeCategory === id;
          const count = changeCounts[id];
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`relative flex flex-col items-center gap-1.5 rounded-lg border-2 px-4 py-4 transition-all ${
                isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-white hover:border-muted-foreground/30"
              }`}
            >
              <Icon size={20} className={isActive ? "text-primary" : "text-muted-foreground"} />
              <span className={`text-sm font-medium ${isActive ? "text-primary" : "text-foreground"}`}>
                {label}
              </span>
              <span className={`text-xs ${count > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {count} change{count !== 1 ? "s" : ""}
              </span>
              {isActive && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white rounded-full text-primary shadow-sm border border-primary/20 z-10 translate-y-1/2 flex items-center justify-center w-6 h-6">
                  <ChevronDown size={14} className="mt-[2px]" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
