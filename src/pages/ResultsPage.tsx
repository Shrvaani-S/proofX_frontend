import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Home, Maximize2, ScanLine, X } from "lucide-react";
import { LabelImage } from "@/components/LabelImage";
import { exportPDF } from "@/report/ExportModal";
// import { ExportModal } from "@/report/ExportModal"; // TODO: Re-enable for full export modal UI
import StepIndicator, { STEPS_LRF, STEPS_QUICK } from "@/components/StepIndicator";
import { CATEGORIES, CAT_COLOR, LABEL_H, LABEL_W } from "@/constants";
import type { Category, Finding, LabelPair } from "@/types/label";
import type { LRFData } from "@/types/lrf";
import { classifyFinding } from "@/utils/lrfClassify";
import type { ReconciliationOverrides } from "@/lib/lrfReconcile";

interface Props {
  pairs: LabelPair[];
  mode: "single" | "bulk";
  lrfData?: LRFData | null;
  isLrfWorkflow?: boolean;
  /** Real backend reconciliation verdicts, keyed by pair id — only present for LRF fields the
   *  backend engine can actually verify (see lib/lrfReconcile.ts). Falls back to the client-side
   *  classifyFinding heuristic for everything else. */
  reconciliationByPair?: Record<string, ReconciliationOverrides>;
  /** Warning shown when some pairs were skipped (e.g. alignment flagged). */
  partialError?: string;
  onBack: () => void;
  onHome?: () => void;
}


export function ResultsPage({ pairs, mode, lrfData, isLrfWorkflow, reconciliationByPair, partialError, onBack, onHome }: Props) {
  const [partialErrorDismissed, setPartialErrorDismissed] = useState(false);
  const [activePairId, setActivePairId] = useState(pairs[0].id);
  const [activeCats, setActiveCats] = useState<Set<Category | "all">>(
    new Set<Category | "all">(["all"]),
  );
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const [hoveredFindingId, setHoveredFindingId] = useState<string | null>(null);
  const [masterZoom, setMasterZoom] = useState(100);
  const [revisedZoom, setRevisedZoom] = useState(100);
  const [hoveredPanel, setHoveredPanel] = useState<"master" | "revised" | null>(null);

  const calcFit = (el: HTMLDivElement) => {
    // Use the active pair's dimensions so fit-to-window is correct when switching
    // between bulk pairs that may have different sizes. `pair` is a closure
    // variable declared later in this render — safe because calcFit is never
    // invoked synchronously before `pair` is initialised.
    const w = pair.width ?? LABEL_W;
    const h = pair.height ?? LABEL_H;
    const availH = el.clientHeight - 48;
    const availW = el.clientWidth - 48;
    if (availH > 0 && availW > 0 && w > 0 && h > 0) {
      // Floor low enough that large real-backend images can fit; without this the
      // old 30% floor sat above the true fit and the full label could never show.
      return Math.round(Math.max(5, Math.min(200, Math.min(availW / w, availH / h) * 100)));
    }
    return 100;
  };

  // Dynamic lower bound for manual zoom-out: always low enough to reach the
  // fit-the-whole-label point, but never above the 30% default floor for small
  // labels (preserves prior behaviour when the label is smaller than the viewport).
  const minZoom = (el: HTMLDivElement | null) => (el ? Math.min(30, calcFit(el)) : 30);

  // Auto-fit zoom whenever the active pair changes so the full label is always
  // visible without scrolling (not just on first mount).
  useLayoutEffect(() => {
    const el = masterRef.current;
    if (!el) return;
    const z = calcFit(el);
    setMasterZoom(z);
    setRevisedZoom(z);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePairId]);
  const [syncScroll, setSyncScroll] = useState(true);
  // const [showExport, setShowExport] = useState(false); // TODO: Re-enable for export modal
  const [isExporting, setIsExporting] = useState(false);
  const [activeStatus, setActiveStatus] = useState<"all" | "expected" | "unexpected">("all");

  const activePairIndex = Math.max(0, pairs.findIndex((p) => p.id === activePairId));
  const pair = pairs[activePairIndex];
  const activePairLoaded = pair.loaded;
  const canvasW = pair.width ?? LABEL_W;
  const canvasH = pair.height ?? LABEL_H;
  const reconciliation = reconciliationByPair?.[pair.id];

  const getStatus = (f: Finding): "expected" | "unexpected" | null =>
    reconciliation?.byFrontendId[f.id] ?? classifyFinding(f, lrfData);

  const visibleFindings = useMemo(() => {
    let findings = activeCats.has("all")
      ? pair.findings
      : pair.findings.filter((f) => activeCats.has(f.category));
    if (isLrfWorkflow && activeStatus !== "all") {
      findings = findings.filter((f) => getStatus(f) === activeStatus);
    }
    return findings;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, activeCats, lrfData, activeStatus, reconciliation]);

  const toggleCat = (c: Category | "all") => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (c === "all") return new Set<Category | "all">(["all"]);
      next.delete("all");
      if (next.has(c)) next.delete(c);
      else next.add(c);
      if (next.size === 0) next.add("all");
      return next;
    });
  };

  // Sync scroll
  const masterRef = useRef<HTMLDivElement>(null);
  const revisedRef = useRef<HTMLDivElement>(null);
  const masterCardRef = useRef<HTMLDivElement>(null);
  const revisedCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!syncScroll) return;
    const m = masterRef.current;
    const r = revisedRef.current;
    if (!m || !r) return;
    let lock = false;
    const sync = (a: HTMLDivElement, b: HTMLDivElement) => () => {
      if (lock) return;
      lock = true;
      b.scrollTop = a.scrollTop;
      b.scrollLeft = a.scrollLeft;
      requestAnimationFrame(() => (lock = false));
    };
    const onM = sync(m, r);
    const onR = sync(r, m);
    m.addEventListener("scroll", onM);
    r.addEventListener("scroll", onR);
    return () => {
      m.removeEventListener("scroll", onM);
      r.removeEventListener("scroll", onR);
    };
  }, [syncScroll, activePairId, activePairLoaded]);

  // Scroll to finding on click
  const handleFindingClick = (f: Finding) => {
    setSelectedFinding(f.id);
    setPulseKey((k) => k + 1);
    [masterRef.current, revisedRef.current].forEach((el, idx) => {
      if (!el) return;
      const bb = idx === 0 ? f.master : f.revised;
      const scale = (idx === 0 ? masterZoom : revisedZoom) / 100;
      const targetY = bb.y * scale - 80;
      el.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
    });
  };

  // Reset selection and scroll position when switching pairs
  useEffect(() => {
    setSelectedFinding(null);
    masterRef.current?.scrollTo({ top: 0, left: 0 });
    revisedRef.current?.scrollTo({ top: 0, left: 0 });
  }, [activePairId]);

  // Window-level handler is the only reliable way to intercept Ctrl+scroll before
  // the browser processes it as a page zoom (element-level listeners fire too late
  // in Chromium's compositor pipeline).
  useEffect(() => {
    const updater = (z: number, delta: number, min: number) =>
      Math.max(min, Math.min(200, z + (delta > 0 ? -10 : 10)));
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const mMin = minZoom(masterRef.current);
      const rMin = minZoom(revisedRef.current);
      if (syncScroll || !hoveredPanel) {
        setMasterZoom((z) => updater(z, e.deltaY, mMin));
        setRevisedZoom((z) => updater(z, e.deltaY, rMin));
      } else if (hoveredPanel === "master") {
        setMasterZoom((z) => updater(z, e.deltaY, mMin));
      } else {
        setRevisedZoom((z) => updater(z, e.deltaY, rMin));
      }
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [syncScroll, hoveredPanel]);

  const handleResetMasterZoom = () => {
    const el = masterRef.current;
    if (el) {
      const z = calcFit(el);
      setMasterZoom(z);
      if (syncScroll) setRevisedZoom(z);
    }
    masterRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    if (syncScroll) revisedRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const handleResetRevisedZoom = () => {
    const el = revisedRef.current;
    if (el) {
      const z = calcFit(el);
      setRevisedZoom(z);
      if (syncScroll) setMasterZoom(z);
    }
    revisedRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    if (syncScroll) masterRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar — navy brand header */}
      <header className="bg-primary text-white px-6 flex items-center justify-between shadow-md flex-shrink-0" style={{ minHeight: 52 }}>
        <div className="flex items-center gap-4 h-[52px]">
          <button
            onClick={onBack}
            className="flex items-center gap-1 border-r border-white/20 pr-4 h-full text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <ScanLine size={18} />
            <span className="text-sm font-bold tracking-tight uppercase">ProofX</span>
            <span className="text-white/30 mx-1">|</span>
            <span className="text-xs text-white/70 font-medium">
              {pair.masterName} <span className="opacity-50">vs</span> {pair.revisedName}
            </span>
          </div>
        </div>
        <StepIndicator current={isLrfWorkflow ? 3 : 2} labels={isLrfWorkflow ? STEPS_LRF : STEPS_QUICK} />
        <div className="flex items-center gap-2">
          {onHome && (
            <button
              onClick={onHome}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded border border-white/30 text-white/80 hover:text-white hover:border-white/60 transition-colors"
              title="Go to Home"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </button>
          )}
        </div>
      </header>

      {/* Partial-error warning banner */}
      {partialError && !partialErrorDismissed && (
        <div className="flex items-start gap-3 bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="flex-1 text-xs text-amber-800 leading-relaxed">{partialError}</p>
          <button onClick={() => setPartialErrorDismissed(true)} className="shrink-0 text-amber-400 hover:text-amber-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main grid */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {mode === "bulk" && (
          <aside className="w-[200px] border-r border-border bg-surface flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              Label pairs
            </div>
            <div className="flex-1 overflow-y-auto">
              {pairs.map((p) => {
                const active = p.id === activePairId;
                const count = p.findings.length;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePairId(p.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border flex items-center justify-between text-sm transition-colors ${
                      active
                        ? "bg-surface-2 border-l-2 border-l-primary"
                        : "hover:bg-surface-2 border-l-2 border-l-transparent"
                    }`}
                  >
                    <span className="text-foreground truncate">
                      {p.masterName}
                      <span className="block text-[11px] text-muted-foreground truncate">
                        vs {p.revisedName}
                      </span>
                    </span>
                    {p.alignmentFlagged
                      ? <AlertTriangle className="ml-2 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      : <span
                          className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full text-white font-medium shrink-0"
                          style={{ backgroundColor: count === 0 ? "#1D9E75" : "#1C2E59" }}
                        >
                          {count}
                        </span>
                    }
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* Label panels */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Per-pair alignment warning */}
          {pair.alignmentFlagged && (
            <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-800">
                Alignment warning — the label body shifted independently of its header/footer on this page. Findings may be unreliable.
              </span>
            </div>
          )}
        <div className="flex-1 flex min-w-0 min-h-0">
          <LabelPanel
            title={pair.masterName}
            version={`Master · ${pair.masterVersion}`}
            variant="master"
            pair={pair}
            canvasW={canvasW}
            canvasH={canvasH}
            findings={visibleFindings}
            selectedFinding={selectedFinding}
            hoveredFindingId={hoveredFindingId}
            pulseKey={pulseKey}
            zoom={masterZoom}
            scrollRef={masterRef}
            cardRef={masterCardRef}
            fileUrl={pair.masterUrl}
            onReset={handleResetMasterZoom}
            onMouseEnter={() => setHoveredPanel("master")}
            onMouseLeave={() => setHoveredPanel(null)}
          />
          {/* Explicit 2px divider: a 1px theme border (#E0E0E0 on #F1F3F4) is
              near-invisible and sub-pixel-rounds away on scaled/HiDPI monitors. */}
          <div className="w-1 flex-shrink-0 self-stretch" style={{ backgroundColor: "#1C2E59" }} aria-hidden />
          <LabelPanel
            title={pair.revisedName}
            version={`Revised · ${pair.revisedVersion}`}
            variant="revised"
            pair={pair}
            canvasW={canvasW}
            canvasH={canvasH}
            findings={visibleFindings}
            selectedFinding={selectedFinding}
            hoveredFindingId={hoveredFindingId}
            pulseKey={pulseKey}
            zoom={revisedZoom}
            scrollRef={revisedRef}
            cardRef={revisedCardRef}
            fileUrl={pair.revisedUrl}
            onReset={handleResetRevisedZoom}
            onMouseEnter={() => setHoveredPanel("revised")}
            onMouseLeave={() => setHoveredPanel(null)}
          />
        </div>
        </div>

        {/* Findings sidebar */}
        <aside className="w-[400px] border-l border-border bg-surface flex flex-col flex-shrink-0">
          {reconciliation && (
            <div
              className={`px-4 py-2 text-xs font-semibold border-b ${
                reconciliation.overall === "PASS"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              Reconciliation: {reconciliation.overall}
              {reconciliation.globalFlags.length > 0 && (
                <span className="block font-normal mt-0.5 text-[11px] opacity-80">
                  {reconciliation.globalFlags.join(" · ")}
                </span>
              )}
            </div>
          )}
          <div className="px-4 py-3 border-b border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">Findings</div>
              <span className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{visibleFindings.length}</span>
                {activeStatus !== "all" || !activeCats.has("all")
                  ? <span className="text-muted-foreground"> / {pair.findings.length}</span>
                  : null}{" "}
                {pair.findings.length === 1 ? "difference" : "differences"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <FilterPill
                label="All"
                active={activeCats.has("all")}
                color="#1C2E59"
                onClick={() => toggleCat("all")}
              />
              {CATEGORIES.map((c) => (
                <FilterPill
                  key={c.id}
                  label={c.label}
                  active={activeCats.has(c.id)}
                  color={c.color}
                  onClick={() => toggleCat(c.id)}
                />
              ))}
            </div>
            {isLrfWorkflow && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5 border-t border-border">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">Status</span>
                {(["all", "expected", "unexpected"] as const).map((s) => {
                  const color = s === "expected" ? "#1D9E75" : s === "unexpected" ? "#D97706" : "#1C2E59";
                  const label = s === "all" ? "All" : s === "expected" ? "✓ Expected" : "⚠ Unexpected";
                  return (
                    <FilterPill
                      key={s}
                      label={label}
                      active={activeStatus === s}
                      color={color}
                      onClick={() => setActiveStatus(s)}
                    />
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {CATEGORIES.map((cat) => {
              if (!activeCats.has("all") && !activeCats.has(cat.id)) return null;
              const items = visibleFindings.filter((f) => f.category === cat.id);
              return (
                <div key={cat.id}>
                  <div className="px-5 py-2.5 bg-surface-2 border-y border-border flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-xs uppercase tracking-wide text-foreground font-medium">
                      {cat.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {items.length} {items.length === 1 ? "difference" : "differences"}
                    </span>
                  </div>
                  {items.length === 0 ? (
                    <div className="px-5 py-4 text-xs text-muted-foreground italic">
                      No differences found
                    </div>
                  ) : (
                    items.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleFindingClick(f)}
                        onMouseEnter={() => setHoveredFindingId(f.id)}
                        onMouseLeave={() => setHoveredFindingId(null)}
                        className={`w-full text-left px-5 py-3.5 border-b border-border transition-colors ${
                          selectedFinding === f.id ? "bg-surface-2" : "hover:bg-surface-2"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                            style={{ backgroundColor: cat.color }}
                          >
                            {f.id}
                          </span>
                          <span className="text-sm text-foreground flex-1 min-w-0">{f.description}</span>
                          {isLrfWorkflow && (() => {
                            const status = getStatus(f);
                            if (!status) return null;
                            const bg = status === "expected" ? "#1D9E75" : "#D97706";
                            const label = status === "expected" ? "Expected" : "Unexpected";
                            return (
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                                style={{ backgroundColor: bg }}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground leading-relaxed pl-1">
                          <div>
                            <span className="text-foreground/70">Master had:</span> {f.before}
                          </div>
                          <div>
                            <span className="text-foreground/70">Revised has:</span> {f.after}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* TODO: Re-enable export modal when full options are needed
      {showExport && (
        <ExportModal
          pairs={pairs}
          activePair={pair}
          mode={mode}
          isLrfWorkflow={isLrfWorkflow}
          lrfData={lrfData}
          masterCardRef={masterCardRef}
          revisedCardRef={revisedCardRef}
          onClose={() => setShowExport(false)}
        />
      )}
      */}

      {/* Bottom bar */}
      <footer className="px-6 py-2.5 border-t border-border bg-surface flex items-center justify-between text-xs text-muted-foreground flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {mode === "bulk"
            ? `Pair ${activePairIndex + 1} of ${pairs.length}`
            : "Analysis complete"}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <span>Sync scroll &amp; zoom</span>
            <button
              onClick={() => {
                setSyncScroll((s) => {
                  if (!s) setRevisedZoom(masterZoom); // align on enable
                  return !s;
                });
              }}
              className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${
                syncScroll ? "bg-accent" : "bg-surface-2 border border-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white border border-border transition-transform ${
                  syncScroll ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const mMin = minZoom(masterRef.current); const rMin = minZoom(revisedRef.current); setMasterZoom((z) => Math.max(mMin, z - 10)); setRevisedZoom((z) => Math.max(rMin, z - 10)); }}
              className="h-6 w-6 rounded border border-border hover:bg-surface-2"
            >
              −
            </button>
            {syncScroll ? (
              <span className="w-10 text-center text-foreground">{masterZoom}%</span>
            ) : (
              <span className="flex items-center gap-1 text-foreground text-[11px]">
                <span style={{ color: "#E02424" }}>{masterZoom}%</span>
                <span className="text-muted-foreground">/</span>
                <span style={{ color: "#1A56DB" }}>{revisedZoom}%</span>
              </span>
            )}
            <button
              onClick={() => { setMasterZoom((z) => Math.min(200, z + 10)); setRevisedZoom((z) => Math.min(200, z + 10)); }}
              className="h-6 w-6 rounded border border-border hover:bg-surface-2"
            >
              +
            </button>
          </div>
          <button
            disabled={isExporting}
            onClick={async () => {
              setIsExporting(true);
              try {
                const exportPairs = mode === "single" ? [pair] : pairs;
                const analystName = lrfData?.metadata.requestedBy ?? "";
                const reference = lrfData?.metadata.crNumber ?? "";
                const timestamp = new Date().toLocaleString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                });
                await exportPDF(exportPairs, pair, analystName, reference, timestamp, masterCardRef, revisedCardRef, lrfData, isLrfWorkflow);
              } catch (err) {
                console.error("Export PDF failed:", err);
                alert("Failed to export PDF report. Error details: " + (err instanceof Error ? err.message : String(err)));
              } finally {
                setIsExporting(false);
              }
            }}
            className="flex items-center gap-2 px-7 py-2.5 text-[13px] font-bold uppercase tracking-widest rounded-lg shadow-sm bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isExporting ? "Generating PDF…" : "Export Report"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function FilterPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-xs rounded-full border transition-colors"
      style={{
        backgroundColor: active ? color : "transparent",
        color: active ? "#FFFFFF" : "#5F6368",
        borderColor: active ? color : "#E0E0E0",
      }}
    >
      {label}
    </button>
  );
}

function LabelPanel({
  title,
  version,
  variant,
  pair,
  canvasW,
  canvasH,
  findings,
  selectedFinding,
  hoveredFindingId,
  pulseKey,
  zoom,
  scrollRef,
  cardRef,
  fileUrl,
  onReset,
  onMouseEnter,
  onMouseLeave,
}: {
  title: string;
  version: string;
  variant: "master" | "revised";
  pair: LabelPair;
  canvasW: number;
  canvasH: number;
  findings: Finding[];
  selectedFinding: string | null;
  hoveredFindingId: string | null;
  pulseKey: number;
  zoom: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  cardRef: React.RefObject<HTMLDivElement | null>;
  fileUrl?: string;
  onReset: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const scale = zoom / 100;
  const dotColor = variant === "master" ? "#E02424" : "#1A56DB";
  const headerBg = variant === "master" ? "#FEF2F2" : "#EFF6FF";
  const versionLabel = variant === "master" ? "CURRENT VERSION LABEL" : "NEW VERSION LABEL";

  // Intercept Ctrl+scroll at the scroll-container level so Chrome's compositor
  // sees preventDefault() before attempting a page-level zoom.
  // Normal scroll falls through to native overflow-auto scrolling.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    scroller.addEventListener("wheel", handler, { passive: false });
    return () => scroller.removeEventListener("wheel", handler);
  }, [scrollRef]);

  // Click-and-drag to pan the label (annotation overlays are pointerEvents:none,
  // so they don't intercept the drag). When sync-scroll is on, the scroll events
  // emitted here mirror to the other panel automatically.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left button only
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = scroller.scrollLeft;
      startTop = scroller.scrollTop;
      scroller.style.cursor = "grabbing";
      e.preventDefault(); // suppress native image-ghost drag / text selection
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      scroller.scrollLeft = startLeft - (e.clientX - startX);
      scroller.scrollTop = startTop - (e.clientY - startY);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      scroller.style.cursor = "";
    };
    scroller.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      scroller.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scrollRef]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div
        className="h-11 px-4 flex items-center justify-between flex-shrink-0"
        style={{
          backgroundColor: headerBg,
          borderBottom: `2px solid ${dotColor}`,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm font-bold uppercase tracking-wide flex-shrink-0" style={{ color: dotColor }}>
            {versionLabel}
          </span>
          <span className="text-xs text-muted-foreground truncate">· {title}</span>
        </div>
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          <button
            onClick={onReset}
            title="Reset zoom"
            className="h-6 w-6 flex items-center justify-center rounded border transition-colors"
            style={{ borderColor: dotColor, color: dotColor, backgroundColor: "transparent" }}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded border"
            style={{ color: dotColor, borderColor: dotColor }}
          >
            {pair.findings.length} ANNOTATION{pair.findings.length !== 1 ? "S" : ""}
          </span>
        </div>
      </div>
      <div ref={scrollRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="flex-1 min-h-0 overflow-auto bg-surface-2 p-6 no-scrollbar cursor-grab select-none">
        <div
          ref={cardRef}
          className="relative mx-auto bg-white rounded-lg shadow-sm overflow-hidden"
          style={{ width: canvasW * scale, height: canvasH * scale }}
        >
          {/* Content — directly sized so iframes/images respond to zoom */}
          {fileUrl ? (
            // Backend results are always rasterised PNG data URLs (align_then_compare writes
            // PNG regardless of PDF/image input) — only fall back to filename-sniffing for a
            // raw blob: URL of the original upload, which carries no type info of its own.
            !fileUrl.startsWith("data:image/") && (
              fileUrl.toLowerCase().endsWith(".pdf") ||
              pair[variant === "master" ? "masterName" : "revisedName"]?.toLowerCase().endsWith(".pdf")
            ) ? (
              <iframe
                src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                style={{ width: canvasW * scale, height: canvasH * scale, border: "none", outline: "none", display: "block", pointerEvents: "none", userSelect: "none" }}
                title={title}
              />
            ) : (
              <img
                src={fileUrl}
                alt={title}
                style={{ width: canvasW * scale, height: canvasH * scale, objectFit: "contain", display: "block" }}
              />
            )
          ) : (
            <div
              style={{
                width: canvasW,
                height: canvasH,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <LabelImage variant={variant} pairId={pair.id} />
            </div>
          )}

          {/* Annotation overlays — coordinates multiplied by scale.
              Hovering a finding in the sidebar spotlights it: the rest of the
              label is dimmed out (a dark mask with a cutout at the hovered
              box) and every other box is hidden rather than competing for attention. */}
          {hoveredFindingId ? (
            (() => {
              const hovered = findings.find((f) => f.id === hoveredFindingId);
              if (!hovered) return null;
              const bb = variant === "master" ? hovered.master : hovered.revised;
              const color = CAT_COLOR[hovered.category];
              return (
                <div
                  style={{
                    position: "absolute",
                    left: bb.x * scale,
                    top: bb.y * scale,
                    width: bb.w * scale,
                    height: bb.h * scale,
                    border: `2px solid ${color}`,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }}
                />
              );
            })()
          ) : (
            findings.map((f) => {
              const bb = variant === "master" ? f.master : f.revised;
              const sel = selectedFinding === f.id;
              const color = CAT_COLOR[f.category];
              return (
                <div
                  key={`${f.id}-${pulseKey}-${sel ? "s" : "u"}`}
                  className={sel ? "bbox-pulse" : ""}
                  style={{
                    position: "absolute",
                    left: bb.x * scale,
                    top: bb.y * scale,
                    width: bb.w * scale,
                    height: bb.h * scale,
                    border: `2px solid ${color}`,
                    backgroundColor: `${color}14`,
                    boxSizing: "border-box",
                    pointerEvents: "none",
                  }}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
