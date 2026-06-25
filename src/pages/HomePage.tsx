import { type ReactNode } from "react";
import { ArrowRight, ScanLine, FileCheck2, ClipboardList, CheckCircle2 } from "lucide-react";

interface Props {
  onQuickCompare: () => void;
  onFullWorkflow: () => void;
}

const QUICK_FEATURES = [
  "Single or bulk label pairs",
  "PDF & PNG support",
  "Text, graphics & barcode diff",
  "Exportable comparison report",
];

const LRF_FEATURES = [
  "Declare expected changes upfront",
  "Auto-classify findings as Expected / Unexpected",
  "Change priorities with severity levels",
  "Audit-ready LRF validation trail",
];

export function HomePage({ onQuickCompare, onFullWorkflow }: Props) {
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header
        className="bg-primary text-white px-6 flex items-center shadow-md flex-shrink-0"
        style={{ minHeight: 52 }}
      >
        <div className="flex items-center gap-2">
          <ScanLine size={18} />
          <span className="text-sm font-bold tracking-tight uppercase">ProofX</span>
          <span className="text-white/30 mx-1">|</span>
          <span className="text-xs text-white/70 font-medium">Label proofing reading tool</span>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-surface-2">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Deterministic · No ML · Audit-ready
          </div>
          <h1 className="text-[32px] font-bold tracking-tight text-foreground leading-tight">
            Select your workflow
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Compare labels and flag differences — run a quick comparison or validate against a Label Requirement Form.
          </p>
        </div>

        {/* Workflow cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl">

          {/* Card 1 — Quick Comparison */}
          <WorkflowCard
            accent="#F07922"
            badge="Quick · No setup"
            icon={<FileCheck2 className="h-6 w-6" style={{ color: "#F07922" }} />}
            title="Label visual comparison"
            description="Upload a master and revised label pair. Differences are detected and annotated automatically across all categories."
            features={QUICK_FEATURES}
            cta="Start Comparison"
            ctaStyle="bg-accent text-accent-foreground hover:bg-accent-hover"
            onClick={onQuickCompare}
          />

          {/* Card 2 — Full Workflow with LRF */}
          <WorkflowCard
            accent="#1C2E59"
            badge="Validated · Audit-ready"
            icon={<ClipboardList className="h-6 w-6 text-primary" />}
            title="Label proof reading"
            description="Begin with a Label Requirement Form to declare expected changes. Every finding is automatically classified as Expected or Unexpected."
            features={LRF_FEATURES}
            cta="Start with LRF"
            ctaStyle="bg-primary text-white hover:opacity-90"
            onClick={onFullWorkflow}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-xs text-muted-foreground flex-shrink-0">
        ProofX · Label Compliance
      </footer>
    </div>
  );
}

// ─── WorkflowCard ───────────────────────────────────────────────────────────

function WorkflowCard({
  accent,
  badge,
  icon,
  title,
  description,
  features,
  cta,
  ctaStyle,
  onClick,
}: {
  accent: string;
  badge: string;
  icon: ReactNode;
  title: string;
  description: string;
  features: string[];
  cta: string;
  ctaStyle: string;
  onClick: () => void;
}) {
  return (
    <div
      className="bg-white border border-border shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
      style={{ borderTop: `3px solid ${accent}` }}
      onClick={onClick}
    >
      <div className="px-6 pt-5 pb-4 flex-1">
        {/* Icon + badge */}
        <div className="flex items-start justify-between mb-4">
          <div
            className="h-11 w-11 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accent}12` }}
          >
            {icon}
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border"
            style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}08` }}
          >
            {badge}
          </span>
        </div>

        {/* Title + description */}
        <h2 className="text-lg font-bold text-foreground tracking-tight mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">{description}</p>

        {/* Feature list */}
        <ul className="space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-foreground/80">
              <CheckCircle2
                className="h-3.5 w-3.5 flex-shrink-0 mt-px"
                style={{ color: accent }}
              />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="px-6 pb-5 pt-3">
        <button
          className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${ctaStyle}`}
        >
          {cta}
          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
