import { useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Upload, FileText, X, ScanLine,
  CheckCircle2, Hash, Package, Layers, User, Calendar, Tag,
} from "lucide-react";
import StepIndicator, { STEPS_LRF, STEPS_QUICK } from "@/components/StepIndicator";
import { LRF_ATTRIBUTE_LOOKUP } from "@/data/lrfAttributes";
import type { LRFData } from "@/types/lrf";

interface UploadedFile {
  name: string;
  size: number;
  url: string;
  file: File;
}

export interface UploadedFileNames {
  masterNames: string[];
  revisedNames: string[];
  masterUrls: string[];
  revisedUrls: string[];
  masterFiles: File[];
  revisedFiles: File[];
}

interface Props {
  lrfData?: LRFData | null;
  runError?: string | null;
  onBack?: () => void;
  onRun: (mode: "single" | "bulk", pairCount: number, files: UploadedFileNames) => void;
}

const CAT_COLORS: Record<string, string> = {
  text:     "bg-blue-50 text-blue-700 border-blue-200",
  graphics: "bg-amber-50 text-amber-700 border-amber-200",
  barcode:  "bg-green-50 text-green-700 border-green-200",
};
const CHANGE_COLORS: Record<string, string> = {
  Add:    "bg-green-50 text-green-700 border-green-200",
  Remove: "bg-red-50 text-red-700 border-red-200",
  Modify: "bg-blue-50 text-blue-700 border-blue-200",
};

export function UploadPage({ lrfData, runError, onBack, onRun }: Props) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [master, setMaster] = useState<UploadedFile | null>(null);
  const [revised, setRevised] = useState<UploadedFile | null>(null);
  const [bulkMasters, setBulkMasters] = useState<UploadedFile[]>([]);
  const [bulkRevised, setBulkRevised] = useState<UploadedFile[]>([]);

  const pairCount = bulkMasters.length; // counts match, so either length works
  const bulkReady =
    bulkMasters.length > 0 &&
    bulkRevised.length > 0 &&
    bulkMasters.length === bulkRevised.length;
  const ready =
    mode === "single" ? !!master && !!revised : bulkReady;

  const handleRun = () => {
    if (!ready) return;
    if (mode === "single") {
      onRun("single", 1, {
        masterNames: [master!.name],
        revisedNames: [revised!.name],
        masterUrls:  [master!.url],
        revisedUrls: [revised!.url],
        masterFiles: [master!.file],
        revisedFiles: [revised!.file],
      });
    } else {
      onRun("bulk", pairCount, {
        masterNames: bulkMasters.slice(0, pairCount).map((f) => f.name),
        revisedNames: bulkRevised.slice(0, pairCount).map((f) => f.name),
        masterUrls:  bulkMasters.slice(0, pairCount).map((f) => f.url),
        revisedUrls: bulkRevised.slice(0, pairCount).map((f) => f.url),
        masterFiles: bulkMasters.slice(0, pairCount).map((f) => f.file),
        revisedFiles: bulkRevised.slice(0, pairCount).map((f) => f.file),
      });
    }
  };

  // ── Shared nav header ──────────────────────────────────────────────────────
  const header = (
    <header
      className="sticky top-0 z-40 bg-primary text-white px-6 flex items-center justify-between shadow-md flex-shrink-0"
      style={{ minHeight: 52 }}
    >
      <div className="flex items-center gap-4 h-[52px]">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 border-r border-white/20 pr-4 h-full text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Back</span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <ScanLine size={18} />
          <span className="text-sm font-bold tracking-tight uppercase">ProofX</span>
          {lrfData && (
            <>
              <span className="text-white/30 mx-1">|</span>
              <span className="text-xs text-white/70 font-medium">Review &amp; Upload</span>
            </>
          )}
        </div>
      </div>
      <StepIndicator current={lrfData ? 2 : 1} labels={lrfData ? STEPS_LRF : STEPS_QUICK} />
    </header>
  );

  // ── LRF workflow: two-column layout ──────────────────────────────────────
  if (lrfData) {
    const meta = lrfData.metadata;
    const labelParts = (meta.labelVersion || "").includes("→")
      ? meta.labelVersion.split("→").map((s) => s.trim())
      : [meta.labelVersion, ""];

    const parsedChanges = Object.entries(lrfData.changes)
      .filter(([, cd]) => cd.changeType !== "")
      .map(([id, cd]) => {
        const info = LRF_ATTRIBUTE_LOOKUP[id];
        return {
          label: info?.label ?? id,
          categoryId: info?.categoryId ?? "text",
          changeType: cd.changeType,
          oldValue: cd.oldValue,
          newValue: cd.newValue,
        };
      });

    const revisedCount  = revised ? 1 : 0;
    const masterCount   = master  ? 1 : 0;

    return (
      <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
        {header}

        <div className="flex-1 w-full mx-auto max-w-5xl px-6 py-8 space-y-6 pb-28">
          {runError && (
            <div className="px-4 py-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
              <span className="font-semibold">Comparison failed:</span> {runError}
            </div>
          )}
          {/* Page title */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground uppercase tracking-wide">
                Review &amp; Upload Labels
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Verify the LRF details below, then upload the master and revised labels to run the comparison.
              </p>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 border border-border bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-surface-2 transition-colors shadow-sm rounded"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Edit LRF
              </button>
            )}
          </div>

          <div className="grid grid-cols-5 gap-6">
            {/* Left: LRF summary */}
            <div className="col-span-3 space-y-4">
              {/* Metadata card */}
              <div className="bg-white border border-border shadow-sm rounded">
                <div className="px-5 py-3 bg-surface-2 border-b border-border flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Document Metadata
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <div className="px-5 divide-y divide-gray-50">
                  {meta.crNumber && (
                    <MetaRow icon={Hash} label="CR Number" value={meta.crNumber} />
                  )}
                  {meta.partNumber && (
                    <MetaRow icon={Package} label="Part Number (SKU)" value={meta.partNumber} />
                  )}
                  {/* Label revision — two-box display */}
                  {meta.labelVersion && (
                    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
                      <div className="w-7 h-7 rounded bg-surface-2 border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                          Label Revision
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-3 py-1 border border-border bg-surface-2 text-sm font-semibold text-foreground min-w-[72px] justify-center rounded">
                            {labelParts[0] || "—"}
                          </span>
                          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                          <span className="inline-flex items-center px-3 py-1 border border-primary/40 bg-primary/5 text-sm font-semibold text-primary min-w-[72px] justify-center rounded">
                            {labelParts[1] || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  {meta.productName && (
                    <MetaRow icon={Tag} label="Product Name" value={meta.productName} />
                  )}
                  {meta.requestedBy && (
                    <MetaRow icon={User} label="Requested By" value={meta.requestedBy} />
                  )}
                  {meta.date && (
                    <MetaRow icon={Calendar} label="Date" value={meta.date} />
                  )}
                </div>
              </div>

              {/* Required changes table */}
              <div className="bg-white border border-border shadow-sm rounded">
                <div className="px-5 py-3 bg-surface-2 border-b border-border flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Required Changes
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary">
                    {parsedChanges.length} item{parsedChanges.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {parsedChanges.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground italic">
                    No attribute changes defined.
                  </div>
                ) : (
                  <div className="overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          {["Attribute", "Category", "Change Type", "Old Value", "New Value"].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-surface-2/50"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedChanges.map((c, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-gray-50 hover:bg-surface-2/50 transition-colors"
                          >
                            <td className="px-4 py-2.5 font-semibold text-foreground">
                              {c.label}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded ${
                                  CAT_COLORS[c.categoryId] ?? "bg-gray-50 text-gray-600 border-gray-200"
                                }`}
                              >
                                {c.categoryId}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded ${
                                  CHANGE_COLORS[c.changeType] ?? "bg-gray-50 text-gray-600 border-gray-200"
                                }`}
                              >
                                {c.changeType}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono max-w-[120px]">
                              <span className="block truncate" title={c.oldValue}>
                                {c.oldValue || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono max-w-[120px]">
                              <span className="block truncate" title={c.newValue}>
                                {c.newValue || "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Upload */}
            <div className="col-span-2 space-y-4">
              <div className="bg-white border border-border shadow-sm rounded">
                <div className="px-5 py-3.5 border-b border-border">
                  <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Upload Labels
                  </span>
                </div>
                <div className="px-5 py-5 space-y-5">
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    Upload both the master (current version) and revised (new version) labels.
                  </p>

                  {/* Mode toggle */}
                  <div className="inline-flex bg-surface-2 border border-border rounded-full p-0.5">
                    {(["single", "bulk"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-4 py-1 text-xs rounded-full transition-colors ${
                          mode === m
                            ? "bg-white text-foreground border border-border shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m === "single" ? "Single pair" : "Bulk upload"}
                      </button>
                    ))}
                  </div>

                  {mode === "single" ? (
                    <div className="space-y-4">
                      <DropZone label="Master label (current version)" file={master} onFile={setMaster} onClear={() => setMaster(null)} variant="master" compact />
                      <DropZone label="Revised label (new version)"   file={revised} onFile={setRevised} onClear={() => setRevised(null)} variant="revised" compact />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <MultiDropZone label="Master labels" files={bulkMasters} onFiles={setBulkMasters} variant="master" compact />
                      <MultiDropZone label="Revised labels" files={bulkRevised} onFiles={setBulkRevised} variant="revised" compact />
                    </div>
                  )}

                  {mode === "bulk" && bulkMasters.length > 0 && bulkRevised.length > 0 && !bulkReady && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-3 py-2 rounded">
                      <span className="shrink-0">⚠</span>
                      {bulkMasters.length} master{bulkMasters.length !== 1 ? "s" : ""} vs {bulkRevised.length} revised — counts must match
                    </div>
                  )}
                  {ready && (
                    <div className="flex items-center gap-2 text-xs text-green-700 font-semibold bg-green-50 border border-green-200 px-3 py-2 rounded">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      {mode === "single"
                        ? "Both labels ready — LRF validation will run"
                        : `${pairCount} pair${pairCount !== 1 ? "s" : ""} ready`}
                    </div>
                  )}
                </div>
              </div>

              {/* What happens next */}
              <div className="bg-blue-50 border border-blue-200 px-4 py-3 rounded">
                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-1">
                  What happens next?
                </div>
                <ul className="text-xs text-blue-700 space-y-1 leading-relaxed">
                  <li>• Labels are compared for text, graphics, and barcode differences.</li>
                  <li>• Each finding is classified as Expected or Unexpected against the {parsedChanges.length} required change{parsedChanges.length !== 1 ? "s" : ""}.</li>
                  <li>• You can then export a full audit-ready PDF report.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.06)] px-8 py-3 flex items-center justify-between z-10 shrink-0">
          <div className="font-mono text-xs text-muted-foreground">
            {meta.crNumber && <span>Ref: {meta.crNumber}</span>}
          </div>
          <div className="flex items-center gap-4">
            {!ready && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                {mode === "bulk" && bulkMasters.length > 0 && bulkRevised.length > 0
                  ? `${bulkMasters.length} master${bulkMasters.length !== 1 ? "s" : ""} vs ${bulkRevised.length} revised — upload equal numbers to proceed`
                  : "Upload both labels to enable submission"}
              </span>
            )}
            <button
              onClick={handleRun}
              disabled={!ready}
              className="flex items-center gap-2 px-7 py-2.5 text-[13px] font-bold uppercase tracking-widest transition-all rounded-lg shadow-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Run Comparison
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Quick compare: original centered layout ────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {header}

      <main className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-5xl">
          {runError && (
            <div className="mb-6 px-4 py-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
              <span className="font-semibold">Comparison failed:</span> {runError}
            </div>
          )}
          <div className="text-center mb-10">
            <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
              Compare medical labels
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload a master and revised label to identify text, graphics, and barcode differences.
            </p>
          </div>

          {/* Pill toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-surface-2 border border-border rounded-full p-1">
              {(["single", "bulk"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-5 py-1.5 text-sm rounded-full transition-colors ${
                    mode === m
                      ? "bg-surface text-foreground border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "single" ? "Single pair" : "Bulk upload"}
                </button>
              ))}
            </div>
          </div>

          {mode === "single" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <DropZone label="Master label" file={master} onFile={setMaster} onClear={() => setMaster(null)} variant="master" />
              <DropZone label="Revised label" file={revised} onFile={setRevised} onClear={() => setRevised(null)} variant="revised" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <MultiDropZone label="Master labels" files={bulkMasters} onFiles={setBulkMasters} variant="master" />
              <MultiDropZone label="Revised labels" files={bulkRevised} onFiles={setBulkRevised} variant="revised" />
            </div>
          )}

          {mode === "bulk" && bulkMasters.length > 0 && bulkRevised.length > 0 && !bulkReady && (
            <div className="mt-4 text-center text-xs text-amber-700 font-medium">
              ⚠ {bulkMasters.length} master{bulkMasters.length !== 1 ? "s" : ""} vs {bulkRevised.length} revised — upload equal numbers to enable comparison
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <button
              disabled={!ready}
              onClick={handleRun}
              className="px-6 py-2.5 rounded-md bg-accent text-accent-foreground text-sm font-medium transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Run comparison
            </button>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        Deterministic · No ML · Audit-ready
      </footer>
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function MetaRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="w-7 h-7 rounded bg-surface-2 border border-border flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</div>
        <div className="text-sm font-semibold text-foreground break-words">
          {value || <span className="text-muted-foreground font-normal italic">Not specified</span>}
        </div>
      </div>
    </div>
  );
}

function DropZone({
  label, file, onFile, onClear, variant = "master", compact = false,
}: {
  label: string;
  file: UploadedFile | null;
  onFile: (f: UploadedFile) => void;
  onClear: () => void;
  variant?: "master" | "revised";
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    onFile({ name: f.name, size: f.size, url: URL.createObjectURL(f), file: f });
  };

  const accentColor = variant === "master" ? "#DC2626" : "#2563EB";

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: accentColor }}>{label}</div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`bg-surface border border-dashed rounded-md flex flex-col items-center justify-center cursor-pointer transition-colors ${compact ? "h-24" : "h-36"}`}
        style={{ borderColor: hover ? accentColor : undefined, borderLeft: `3px solid ${accentColor}` }}
      >
        <Upload className="h-5 w-5 mb-2 text-muted-foreground" />
        <div className="text-sm text-foreground">Add file</div>
        <div className="text-xs text-muted-foreground mt-0.5">PDF or PNG</div>
        <input ref={inputRef} type="file" accept=".pdf,.png,application/pdf,image/png" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {file && (
        <div className="mt-2 flex items-center gap-3 px-3 py-2.5 border border-border rounded-md bg-surface">
          <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: `${accentColor}15` }}>
            <FileText className="h-4 w-4" style={{ color: accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
          </div>
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="Remove">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function MultiDropZone({
  label, files, onFiles, variant, compact = false,
}: {
  label: string;
  files: UploadedFile[];
  onFiles: (f: UploadedFile[]) => void;
  variant: "master" | "revised";
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const accentColor = variant === "master" ? "#DC2626" : "#2563EB";

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).map((f) => ({ name: f.name, size: f.size, url: URL.createObjectURL(f), file: f }));
    onFiles([...files, ...arr]);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: accentColor }}>{label}</div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`bg-surface border border-dashed rounded-md flex flex-col items-center justify-center cursor-pointer transition-colors ${compact ? "h-24" : "h-36"}`}
        style={{ borderColor: hover ? accentColor : undefined, borderLeft: `3px solid ${accentColor}` }}
      >
        <Upload className="h-5 w-5 mb-2 text-muted-foreground" />
        <div className="text-sm text-foreground">Add more files</div>
        <div className="text-xs text-muted-foreground mt-0.5">PDF or PNG</div>
        <input ref={inputRef} type="file" multiple accept=".pdf,.png,application/pdf,image/png" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 max-h-[160px] overflow-y-auto">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 border border-border rounded-md bg-surface">
              <div className="flex-shrink-0 w-7 h-7 rounded flex items-center justify-center" style={{ backgroundColor: `${accentColor}15` }}>
                <FileText className="h-3.5 w-3.5" style={{ color: accentColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-foreground truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</div>
              </div>
              <button onClick={() => onFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="Remove">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
