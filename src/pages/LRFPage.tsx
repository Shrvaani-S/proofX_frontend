import { useState, useCallback, useEffect, useRef } from "react";
import { ScanLine, Save, ArrowLeft, ArrowRight, Lock } from "lucide-react";
import StepIndicator, { STEPS_LRF } from "@/components/StepIndicator";
import LRFCategoryTabs from "@/components/LRFCategoryTabs";
import LRFAttributeGroup from "@/components/LRFAttributeGroup";
import LRFSummaryBar from "@/components/LRFSummaryBar";
import {
  LRF_CATEGORIES,
  LRF_CATEGORY_ORDER,
  type LRFCategoryId,
  type LRFAttributeDef,
} from "@/data/lrfAttributes";
import type { LRFData, LRFChangeData } from "@/types/lrf";

const DRAFT_KEY = "proofx_lrf_draft";

interface Props {
  onNext:       (data: LRFData) => void;
  onSkip:       () => void;
  onBack?:      () => void;
  initialData?: LRFData | null;
  nextLabel?:   string;
}

export function LRFPage({ onNext, onSkip, onBack, initialData, nextLabel }: Props) {
  const [crNumber,      setCrNumber]      = useState(initialData?.metadata.crNumber ?? "");
  const [partNumber,    setPartNumber]    = useState(initialData?.metadata.partNumber ?? "");
  const [productName,   setProductName]   = useState(initialData?.metadata.productName ?? "");
  const [labelVersion,  setLabelVersion]  = useState(initialData?.metadata.labelVersion ?? "");
  const [requestedBy,   setRequestedBy]   = useState(initialData?.metadata.requestedBy ?? "");
  const [date,          setDate]          = useState(
    initialData?.metadata.date ?? new Date().toISOString().split("T")[0]
  );

  // Label version split into two boxes (like LabelIQ)
  const parsedFrom = labelVersion.includes("→") ? labelVersion.split("→")[0].trim() : labelVersion;
  const parsedTo   = labelVersion.includes("→") ? labelVersion.split("→")[1]?.trim() ?? "" : "";
  const [labelFrom, setLabelFrom] = useState(parsedFrom);
  const [labelTo,   setLabelTo]   = useState(parsedTo);

  // Sync the two boxes → combined labelVersion
  useEffect(() => {
    setLabelVersion(labelFrom || labelTo ? `${labelFrom} → ${labelTo}` : "");
  }, [labelFrom, labelTo]);

  const [activeCategory,    setActiveCategory]    = useState<LRFCategoryId | null>("text");
  const [changes,           setChanges]           = useState<Record<string, LRFChangeData>>(initialData?.changes ?? {});
  const [customAttributes,  setCustomAttributes]  = useState<Record<string, LRFAttributeDef[]>>(initialData?.customAttributes ?? {});
  const [showDraftBanner,   setShowDraftBanner]   = useState(false);

  const attributePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialData && localStorage.getItem(DRAFT_KEY)) setShowDraftBanner(true);
  }, [initialData]);

  const restoreDraft = () => {
    try {
      const draft: LRFData = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      if (draft.metadata) {
        setCrNumber(draft.metadata.crNumber ?? "");
        setPartNumber(draft.metadata.partNumber ?? "");
        setProductName(draft.metadata.productName ?? "");
        setRequestedBy(draft.metadata.requestedBy ?? "");
        setDate(draft.metadata.date ?? "");
        const from = draft.metadata.labelVersion?.split("→")[0]?.trim() ?? "";
        const to   = draft.metadata.labelVersion?.split("→")[1]?.trim() ?? "";
        setLabelFrom(from); setLabelTo(to);
      }
      if (draft.changes)          setChanges(draft.changes);
      if (draft.customAttributes) setCustomAttributes(draft.customAttributes);
    } catch {}
    setShowDraftBanner(false);
  };

  const saveDraft = () => {
    // File objects serialise to {} via JSON.stringify (File has no own enumerable
    // properties). An {} survives JSON.parse as a truthy non-Blob and later causes
    // FormData.append to throw "parameter 2 is not of type 'Blob'". Strip oldFile/
    // newFile before serialising so they are absent (not {}) on restore.
    const serializableChanges = Object.fromEntries(
      Object.entries(changes).map(([k, v]) => [k, { changeType: v.changeType, oldValue: v.oldValue, newValue: v.newValue }])
    );
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      metadata: { crNumber, partNumber, labelVersion, productName, requestedBy, date },
      changes: serializableChanges, customAttributes,
    }));
  };

  // Change counts per category
  const getCountForCategory = useCallback(
    (catId: LRFCategoryId) => {
      const cat = LRF_CATEGORIES[catId];
      let count = 0;
      for (const group of cat.groups) {
        const allAttrs = [...group.attributes, ...(customAttributes[group.id] || [])];
        for (const attr of allAttrs) {
          if (changes[attr.id]?.changeType) count++;
        }
      }
      return count;
    },
    [changes, customAttributes]
  );

  const changeCounts: Record<LRFCategoryId, number> = {
    text:     getCountForCategory("text"),
    graphics: getCountForCategory("graphics"),
    barcode:  getCountForCategory("barcode"),
  };
  const totalChanges = Object.values(changeCounts).reduce((a, b) => a + b, 0);

  const handleCategorySelect = (cat: LRFCategoryId) => {
    const next = cat === activeCategory ? null : cat;
    setActiveCategory(next);
    if (next) {
      setTimeout(() => {
        attributePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  };

  const handleChangeType = (attrId: string, value: string) => {
    setChanges((prev) => ({
      ...prev,
      [attrId]: {
        ...prev[attrId], changeType: value,
        oldValue: prev[attrId]?.oldValue || "", newValue: prev[attrId]?.newValue || "",
      },
    }));
  };

  const handleOldValue = (attrId: string, value: string) => {
    setChanges((prev) => ({
      ...prev,
      [attrId]: {
        ...prev[attrId], oldValue: value,
        newValue: prev[attrId]?.newValue || "", changeType: prev[attrId]?.changeType || "",
      },
    }));
  };

  const handleNewValue = (attrId: string, value: string) => {
    setChanges((prev) => ({
      ...prev,
      [attrId]: {
        ...prev[attrId], newValue: value,
        oldValue: prev[attrId]?.oldValue || "", changeType: prev[attrId]?.changeType || "",
      },
    }));
  };

  const handleOldFile = (attrId: string, file: File) => {
    setChanges((prev) => ({
      ...prev,
      [attrId]: {
        ...prev[attrId], oldFile: file,
        oldValue: prev[attrId]?.oldValue || "", newValue: prev[attrId]?.newValue || "",
        changeType: prev[attrId]?.changeType || "",
      },
    }));
  };

  const handleNewFile = (attrId: string, file: File) => {
    setChanges((prev) => ({
      ...prev,
      [attrId]: {
        ...prev[attrId], newFile: file,
        oldValue: prev[attrId]?.oldValue || "", newValue: prev[attrId]?.newValue || "",
        changeType: prev[attrId]?.changeType || "",
      },
    }));
  };

  const handleClear = (attrId: string, isCustom: boolean) => {
    if (isCustom) {
      setCustomAttributes((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = next[key].filter((a) => a.id !== attrId);
        }
        return next;
      });
      setChanges((prev) => { const next = { ...prev }; delete next[attrId]; return next; });
    } else {
      setChanges((prev) => ({ ...prev, [attrId]: { changeType: "", oldValue: "", newValue: "" } }));
    }
  };

  const handleAddCustom = (groupId: string, name: string, changeType: string, oldValue: string, newValue: string) => {
    const id = `custom_${groupId}_${Date.now()}`;
    setCustomAttributes((prev) => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []), { id, label: name, placeholder: "Custom parameter", isCustom: true }],
    }));
    if (changeType) {
      setChanges((prev) => ({ ...prev, [id]: { changeType, oldValue, newValue } }));
    }
  };

  const handleNext = () => {
    onNext({
      metadata: { crNumber, partNumber, labelVersion, productName, requestedBy, date },
      changes,
      customAttributes,
    });
  };

  const activeCat = activeCategory ? LRF_CATEGORIES[activeCategory] : null;

  return (
    <div className="flex flex-col bg-[#f5f5f5]" style={{ height: "100vh", overflow: "hidden" }}>
      {/* Navbar */}
      <nav
        className="bg-primary text-white px-6 py-0 flex items-center justify-between shadow-md shrink-0 z-40"
        style={{ minHeight: 52 }}
      >
        <div className="flex items-center gap-4 h-[52px]">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 border-r border-white/20 pr-4 h-full text-white/80 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">Home</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <ScanLine size={18} />
            <span className="text-sm font-bold tracking-tight uppercase">ProofX</span>
            <span className="text-white/30 mx-1">|</span>
            <span className="text-xs text-white/70 font-medium">Label Requirement Form</span>
          </div>
        </div>
        <div className="hidden md:block">
          <StepIndicator current={1} labels={STEPS_LRF} />
        </div>
      </nav>

      {/* Draft banner */}
      {showDraftBanner && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2.5 flex items-center justify-between shrink-0">
          <span className="text-sm text-blue-800 font-medium">
            A saved draft was found. Would you like to restore it?
          </span>
          <div className="flex gap-2">
            <button onClick={restoreDraft} className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity">
              Restore Draft
            </button>
            <button onClick={() => setShowDraftBanner(false)} className="rounded border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 space-y-5">

          {/* Metadata Card */}
          <div className="bg-white border border-gray-200 shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50">
              <div>
                <h1 className="text-base font-bold text-gray-900 uppercase tracking-wider">
                  Label Requirement Form
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Define required changes to be validated against comparator output
                </p>
              </div>
              {totalChanges > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary uppercase tracking-wider">
                  {totalChanges} change{totalChanges !== 1 ? "s" : ""} defined
                </span>
              )}
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Document Metadata</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>

              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                {/* CR Number */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">CR</label>
                  <input
                    value={crNumber} onChange={(e) => setCrNumber(e.target.value)}
                    placeholder="e.g. CR-2026-0041"
                    className="h-9 w-full border border-gray-300 hover:border-gray-400 px-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                {/* SKU */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">SKU</label>
                  <input
                    value={partNumber} onChange={(e) => setPartNumber(e.target.value)}
                    placeholder="e.g. 2440-00-511"
                    className="h-9 w-full border border-gray-300 hover:border-gray-400 px-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                {/* Product name */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Product name</label>
                  <input
                    value={productName} onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. QUICKSET STD Tissue Protector"
                    className="h-9 w-full border border-gray-300 hover:border-gray-400 px-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Date</label>
                  <input
                    type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="h-9 w-full border border-gray-300 hover:border-gray-400 px-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                {/* Label Revision */}
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Label Revision
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      value={labelFrom} onChange={(e) => setLabelFrom(e.target.value)}
                      placeholder="Current rev. e.g. Rev B"
                      className="h-9 flex-1 border border-gray-300 hover:border-gray-400 px-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/25"
                    />
                    <div className="flex items-center justify-center w-10 h-9 bg-gray-50 border border-gray-200 shrink-0">
                      <ArrowRight className="h-4 w-4 text-primary" />
                    </div>
                    <input
                      value={labelTo} onChange={(e) => setLabelTo(e.target.value)}
                      placeholder="New rev. e.g. Rev C"
                      className="h-9 flex-1 border border-gray-300 hover:border-gray-400 px-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/25"
                    />
                  </div>
                </div>

                {/* Requested By */}
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                    Requested By
                  </label>
                  <input
                    value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)}
                    placeholder="Name or department"
                    className="h-9 w-full border border-gray-300 hover:border-gray-400 px-3 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Category Selection — sticky tabs */}
          <div className="bg-white border border-gray-200 shadow-sm overflow-hidden sticky top-0 z-30">
            <LRFCategoryTabs
              activeCategory={activeCategory}
              changeCounts={changeCounts}
              onSelect={handleCategorySelect}
            />
            {activeCat && activeCategory && (
              <div className="bg-gray-50 flex items-center justify-between px-5 py-2.5 border-t border-gray-200">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  {activeCat.label} Attributes
                </span>
                <span className="text-xs text-gray-400">
                  Select an attribute to define its expected change
                </span>
              </div>
            )}
          </div>

          {/* Attribute Groups */}
          {activeCat && activeCategory && (
            <div
              ref={attributePanelRef}
              className={`bg-white border border-gray-200 shadow-sm -mt-5 ${
                activeCategory === "text" ? "" : "max-h-[450px] overflow-y-auto"
              }`}
            >
              <div className="border-t-2 border-primary">
                {activeCat.groups.map((group) => (
                  <LRFAttributeGroup
                    key={group.id}
                    groupId={group.id}
                    name={group.name}
                    attributes={group.attributes}
                    changes={changes}
                    customAttributes={customAttributes[group.id] || []}
                    categoryId={activeCategory}
                    onChangeType={handleChangeType}
                    onOldValue={handleOldValue}
                    onNewValue={handleNewValue}
                    onOldFile={handleOldFile}
                    onNewFile={handleNewFile}
                    onClear={handleClear}
                    onAddCustom={handleAddCustom}
                  />
                ))}
              </div>
            </div>
          )}

          <LRFSummaryBar counts={changeCounts} />
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[#e2e8f0] bg-white px-8 py-2.5 flex items-center justify-between gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Skip for now
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={saveDraft}
            className="flex items-center gap-2 border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wider rounded-lg shadow-sm"
          >
            <Save size={14} />
            Save Draft
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-primary px-8 py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity uppercase tracking-wider rounded-lg shadow-md"
          >
            {nextLabel || "Next: Upload Labels"}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
