import { useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import type { LRFAttributeDef, LRFCategoryId } from "@/data/lrfAttributes";
import LRFAttributeRow from "./LRFAttributeRow";
import LRFAddParameter from "./LRFAddParameter";

interface ChangeData { changeType: string; oldValue: string; newValue: string; }

interface Props {
  groupId: string;
  name: string;
  attributes: LRFAttributeDef[];
  changes: Record<string, ChangeData>;
  customAttributes: LRFAttributeDef[];
  categoryId: LRFCategoryId;
  onChangeType: (attrId: string, v: string) => void;
  onOldValue:   (attrId: string, v: string) => void;
  onNewValue:   (attrId: string, v: string) => void;
  onClear:      (attrId: string, isCustom: boolean) => void;
  onAddCustom:  (groupId: string, name: string, changeType: string, oldValue: string, newValue: string) => void;
}

export default function LRFAttributeGroup({
  groupId, name, attributes, changes, customAttributes, categoryId,
  onChangeType, onOldValue, onNewValue, onClear, onAddCustom,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const allAttrs = [...attributes, ...customAttributes];
  const definedCount = allAttrs.filter((a) => changes[a.id]?.changeType).length;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors border-b border-gray-100"
      >
        <div className="flex items-center gap-3">
          <FolderOpen size={16} className="text-accent stroke-[1.5]" />
          <span className="text-[14px] font-semibold text-foreground">{name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-muted-foreground">{allAttrs.length} items</span>
          {definedCount > 0 && (
            <span className="text-[13px] font-bold text-foreground">{definedCount} defined</span>
          )}
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform duration-200 ml-1 ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/50">
          {attributes.map((attr) => (
            <LRFAttributeRow
              key={attr.id}
              id={attr.id}
              label={attr.label}
              placeholder={attr.placeholder}
              changeType={changes[attr.id]?.changeType || ""}
              oldValue={changes[attr.id]?.oldValue || ""}
              newValue={changes[attr.id]?.newValue || ""}
              groupId={groupId}
              categoryId={categoryId}
              onChangeType={(v) => onChangeType(attr.id, v)}
              onOldValue={(v) => onOldValue(attr.id, v)}
              onNewValue={(v) => onNewValue(attr.id, v)}
              onClear={() => onClear(attr.id, false)}
            />
          ))}
          {customAttributes.map((attr) => (
            <LRFAttributeRow
              key={attr.id}
              id={attr.id}
              label={attr.label}
              placeholder={attr.placeholder}
              changeType={changes[attr.id]?.changeType || ""}
              oldValue={changes[attr.id]?.oldValue || ""}
              newValue={changes[attr.id]?.newValue || ""}
              isCustom
              groupId={groupId}
              categoryId={categoryId}
              onChangeType={(v) => onChangeType(attr.id, v)}
              onOldValue={(v) => onOldValue(attr.id, v)}
              onNewValue={(v) => onNewValue(attr.id, v)}
              onClear={() => onClear(attr.id, true)}
            />
          ))}
          <LRFAddParameter
            groupId={groupId}
            categoryId={categoryId}
            onAdd={(name, ct, ov, nv) => onAddCustom(groupId, name, ct, ov, nv)}
          />
        </div>
      )}
    </div>
  );
}
