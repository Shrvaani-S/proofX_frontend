import type { Category } from "@/types/label";

export const LABEL_W = 600;
export const LABEL_H = 800;

export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: "text", label: "Text", color: "#378ADD" },
  { id: "graphics", label: "Graphics", color: "#DC2626" },
  { id: "barcode", label: "Barcode", color: "#BA7517" },
];

export const CAT_COLOR: Record<Category, string> = {
  text: "#378ADD",
  graphics: "#DC2626",
  barcode: "#BA7517",
};

export const CAT_PREFIX: Record<Category, string> = {
  text: "T",
  graphics: "G",
  barcode: "B",
};
