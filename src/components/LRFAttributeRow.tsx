import { useState } from "react";
import { X, Upload, ChevronRight } from "lucide-react";
import { LRF_CHANGE_TYPES, LRF_SYMBOL_CHANGE_TYPES, LRF_IMAGE_CHANGE_TYPES } from "@/data/lrfAttributes";
import type { LRFCategoryId } from "@/data/lrfAttributes";

interface Props {
  id: string;
  label: string;
  placeholder: string;
  changeType: string;
  oldValue: string;
  newValue: string;
  isCustom?: boolean;
  groupId: string;
  categoryId: LRFCategoryId;
  onChangeType: (v: string) => void;
  onOldValue: (v: string) => void;
  onNewValue: (v: string) => void;
  onOldFile?: (f: File) => void;
  onNewFile?: (f: File) => void;
  onClear: () => void;
}

export default function LRFAttributeRow({
  label, placeholder, changeType, oldValue, newValue,
  isCustom, groupId, categoryId: _categoryId,
  onChangeType, onOldValue, onNewValue, onOldFile, onNewFile, onClear,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isSymbolGroup    = groupId.startsWith("sym_");
  const isImageGroup     = groupId.startsWith("img_");
  const isBarcodeGroup   = groupId.startsWith("bc_") || groupId.startsWith("dm_");
  const isBackgroundGroup = groupId === "img_background";
  const isDeleted        = changeType === "Remove";

  const changeTypes = isSymbolGroup
    ? LRF_SYMBOL_CHANGE_TYPES
    : isImageGroup
    ? LRF_IMAGE_CHANGE_TYPES
    : LRF_CHANGE_TYPES;

  // Symbols/barcodes carry no free-text value (the change type itself says it all);
  // image groups other than background swap a whole asset (upload), not text.
  const noTextFields = isSymbolGroup || isBarcodeGroup || (isImageGroup && !isBackgroundGroup);

  // Background is a descriptive "where", not a literal old->new text pair.
  const showOld = !noTextFields && !isBackgroundGroup && (changeType === "Remove" || changeType === "Modify");
  const showNew = !noTextFields && !isBackgroundGroup && (changeType === "Add" || changeType === "Modify");
  const showRegion = !noTextFields && isBackgroundGroup && changeType !== "";

  // Graphic diff needs BOTH the old and new image to actually compare against each
  // other (backend's logo match_type does a relative shape+colour comparison of the
  // two references) — a single "new" upload alone can't drive a real before/after
  // graphic diff, only "this is what it should look like now".
  const showNewUpload =
    !isDeleted && !isBackgroundGroup &&
    isImageGroup && (changeType === "Add" || changeType === "Modify");
  const showOldUpload =
    !isBackgroundGroup && isImageGroup && changeType === "Modify";

  const hasDefined = changeType !== "";

  return (
    <div className="bg-white border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 pl-8 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ChevronRight
            size={14}
            className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
          />
          <span className={`text-[13px] ${isCustom ? "italic text-primary" : "text-[#555555]"}`}>
            {label}
            {isCustom && <span className="text-primary"> *</span>}
          </span>
        </div>
        {hasDefined && (
          <span className="text-[12px] font-bold text-foreground pr-2">{changeType}</span>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 pt-1 ml-8 mr-4 space-y-3 border-l-2 border-primary/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Change type</label>
              <select
                value={changeType}
                onChange={(e) => onChangeType(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="">— select —</option>
                {changeTypes.map((ct) => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>

            {showOld && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Old value</label>
                <input
                  type="text"
                  value={oldValue}
                  onChange={(e) => onOldValue(e.target.value)}
                  placeholder="Current value on the master label"
                  className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            )}

            {showNew && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">New value</label>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => onNewValue(e.target.value)}
                  placeholder={placeholder}
                  className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            )}

            {showRegion && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Area / region</label>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => onNewValue(e.target.value)}
                  placeholder={placeholder}
                  className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>
            )}

            {showOldUpload && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Old image</label>
                <label className="flex items-center gap-2 h-9 rounded-md border border-dashed border-border bg-white px-3 text-sm text-muted-foreground cursor-pointer hover:border-primary hover:text-foreground transition-colors">
                  <Upload size={14} />
                  <span className="truncate">{oldValue || "Upload current image"}</span>
                  <input
                    type="file"
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { onOldValue(file.name); onOldFile?.(file); }
                    }}
                  />
                </label>
              </div>
            )}

            {showNewUpload && (
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">New image</label>
                <label className="flex items-center gap-2 h-9 rounded-md border border-dashed border-border bg-white px-3 text-sm text-muted-foreground cursor-pointer hover:border-primary hover:text-foreground transition-colors">
                  <Upload size={14} />
                  <span className="truncate">{newValue || "Upload new image"}</span>
                  <input
                    type="file"
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { onNewValue(file.name); onNewFile?.(file); }
                    }}
                  />
                </label>
              </div>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-destructive transition-colors"
              title="Clear"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
