import { useState } from "react";
import { Plus } from "lucide-react";
import { LRF_CHANGE_TYPES, LRF_SYMBOL_CHANGE_TYPES, LRF_IMAGE_CHANGE_TYPES } from "@/data/lrfAttributes";
import type { LRFCategoryId } from "@/data/lrfAttributes";

interface Props {
  groupId: string;
  categoryId: LRFCategoryId;
  onAdd: (name: string, changeType: string, oldValue: string, newValue: string) => void;
}

export default function LRFAddParameter({ groupId, categoryId, onAdd }: Props) {
  const [isOpen,     setIsOpen]     = useState(false);
  const [name,       setName]       = useState("");
  const [changeType, setChangeType] = useState("");
  const [oldValue,   setOldValue]   = useState("");
  const [newValue,   setNewValue]   = useState("");

  const isSymbolGroup  = groupId.startsWith("sym_");
  const isImageGroup   = groupId.startsWith("img_");
  const changeTypes    = isSymbolGroup
    ? LRF_SYMBOL_CHANGE_TYPES
    : isImageGroup
    ? LRF_IMAGE_CHANGE_TYPES
    : LRF_CHANGE_TYPES;

  const showOld = !isSymbolGroup && (changeType === "Remove" || changeType === "Modify");
  const showNew = !isSymbolGroup && (changeType === "Add" || changeType === "Modify");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), changeType, oldValue, newValue);
    setName(""); setChangeType(""); setOldValue(""); setNewValue(""); setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 text-sm text-primary/70 hover:text-primary transition-colors"
      >
        <Plus size={14} />
        Add parameter
      </button>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(180px,1.1fr)_140px_1fr_1fr_40px] gap-3 items-center px-4 py-2.5 bg-primary/4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Parameter name"
        autoFocus
        className="h-9 rounded-md border border-border bg-white px-3 text-sm italic text-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
      />
      <select
        value={changeType}
        onChange={(e) => setChangeType(e.target.value)}
        className="h-9 rounded-md border border-border bg-white px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
      >
        <option value="">— select —</option>
        {changeTypes.map((ct) => (
          <option key={ct} value={ct}>{ct}</option>
        ))}
      </select>
      {showOld ? (
        <input
          type="text"
          value={oldValue}
          onChange={(e) => setOldValue(e.target.value)}
          placeholder="Old value"
          className="h-9 rounded-md border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      ) : <div />}
      {showNew ? (
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="New value"
          className="h-9 rounded-md border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      ) : <div />}
      <div className="flex gap-1">
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white hover:opacity-90 disabled:opacity-40 transition-colors text-xs font-semibold"
          title="Add"
        >
          +
        </button>
      </div>
    </div>
  );
}
