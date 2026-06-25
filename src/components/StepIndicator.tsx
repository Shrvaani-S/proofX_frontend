import { ChevronRight } from "lucide-react";

interface Props {
  current: number;
  labels?: string[];
}

export const STEPS_LRF    = ["Label Requirement Form", "Upload Labels", "Analysis"];
export const STEPS_QUICK  = ["Upload Labels", "Analysis"];

export default function StepIndicator({ current, labels = STEPS_LRF }: Props) {
  return (
    <div className="flex items-center">
      {labels.map((label, i) => {
        const step = i + 1;
        const isDone = step < current;
        const isActive = step === current;
        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                isActive
                  ? "text-white border-b-2 border-white"
                  : isDone
                  ? "text-white/80"
                  : "text-white/35"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  isActive
                    ? "bg-white text-primary border-white"
                    : isDone
                    ? "bg-white/20 text-white border-white/40"
                    : "bg-transparent text-white/35 border-white/25"
                }`}
              >
                {isDone ? "✓" : step}
              </span>
              {label}
            </div>
            {i < labels.length - 1 && (
              <ChevronRight size={14} className="text-white/40 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}
