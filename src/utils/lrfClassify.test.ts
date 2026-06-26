/**
 * classifyFinding + valueIn tests.
 *
 * Tests the three matching tiers:
 *   1. Exact substring
 *   2. Space-normalised (collapses whitespace; handles CamelCase vs. spaced)
 *   3. Word-level overlap ≥ 75% (handles missing commas/spaces from OCR)
 *
 * Also tests:
 *   - Modify / Add / Remove logic
 *   - Graphics keyword fallback (no explicit values)
 *   - No-LRF guard (returns null)
 *   - Category guard (attribute's categoryId must match finding.category)
 */

import { describe, it, expect } from "vitest";
import { classifyFinding } from "./lrfClassify";
import type { Finding } from "@/types/label";
import type { LRFData } from "@/types/lrf";

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

const BBOX = { x: 0, y: 0, w: 100, h: 20 };

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "T1",
    category: "text",
    description: "",
    before: "(not present)",
    after:  "(not present)",
    master:  BBOX,
    revised: BBOX,
    ...overrides,
  };
}

function makeLrf(changes: Record<string, {
  changeType: string;
  oldValue: string;
  newValue: string;
}>): LRFData {
  return {
    metadata: {
      crNumber: "CR-001",
      partNumber: "P-001",
      labelVersion: "Rev A",
      productName: "Test Product",
      requestedBy: "Tester",
      date: "2026-06-26",
    },
    customAttributes: {},
    changes: Object.fromEntries(
      Object.entries(changes).map(([id, c]) => [
        id,
        { changeType: c.changeType, oldValue: c.oldValue, newValue: c.newValue },
      ])
    ) as LRFData["changes"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// null / no-LRF guard
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — no LRF", () => {
  it("returns null when lrfData is null", () => {
    expect(classifyFinding(makeFinding(), null)).toBeNull();
  });

  it("returns null when lrfData is undefined", () => {
    expect(classifyFinding(makeFinding(), undefined)).toBeNull();
  });

  it("returns null when all changes have empty changeType", () => {
    const lrf = makeLrf({ manufacturer_addr: { changeType: "", oldValue: "a", newValue: "b" } });
    expect(classifyFinding(makeFinding(), lrf)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Modify: both sides must match
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — Modify", () => {
  // manufacturer_addr → categoryId: "text"
  const lrf = makeLrf({
    manufacturer_addr: {
      changeType: "Modify",
      oldValue: "Old Address Str 1",
      newValue: "New Address Ave 99",
    },
  });

  it("exact match — both sides present → expected", () => {
    const f = makeFinding({
      category: "text",
      before: "Old Address Str 1",
      after:  "New Address Ave 99",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("only new side present → unexpected", () => {
    const f = makeFinding({
      category: "text",
      before: "(not present)",
      after:  "New Address Ave 99",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });

  it("only old side present → unexpected", () => {
    const f = makeFinding({
      category: "text",
      before: "Old Address Str 1",
      after:  "(not present)",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });

  it("neither side matches → unexpected", () => {
    const f = makeFinding({
      category: "text",
      before: "Something else",
      after:  "Completely different",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Add: only new value supplied
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — Add", () => {
  const lrf = makeLrf({
    manufacturer_addr: { changeType: "Add", oldValue: "", newValue: "Brand New Street Five" },
  });

  it("new value in after → expected", () => {
    const f = makeFinding({
      category: "text",
      before: "(not present)",
      after:  "Brand New Street Five",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("new value absent from after → unexpected", () => {
    const f = makeFinding({
      category: "text",
      before: "(not present)",
      after:  "Something Entirely Different",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Remove: only old value supplied
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — Remove", () => {
  const lrf = makeLrf({
    manufacturer_addr: { changeType: "Remove", oldValue: "Removed Line Corp", newValue: "" },
  });

  it("old value in before → expected", () => {
    const f = makeFinding({
      category: "text",
      before: "Removed Line Corp",
      after:  "(not present)",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("old value absent from before → unexpected", () => {
    const f = makeFinding({
      category: "text",
      before: "Totally Different Corp",
      after:  "(not present)",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// valueIn — tier 1: exact substring
// ─────────────────────────────────────────────────────────────────────────────

describe("valueIn — tier 1 (exact substring)", () => {
  it("full string equals → matches", () => {
    const lrf = makeLrf({ manufacturer_addr: { changeType: "Modify", oldValue: "Exact", newValue: "Match" } });
    const f = makeFinding({ category: "text", before: "Exact", after: "Match" });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("value is substring of longer text → matches", () => {
    const lrf = makeLrf({ manufacturer_addr: { changeType: "Modify", oldValue: "Corp", newValue: "Inc" } });
    const f = makeFinding({ category: "text", before: "ACME Corp Ltd", after: "ACME Inc Ltd" });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// valueIn — tier 2: space-normalised
// ─────────────────────────────────────────────────────────────────────────────

describe("valueIn — tier 2 (space-normalised)", () => {
  it("OCR concatenated words vs spaced LRF value → matches", () => {
    const lrf = makeLrf({
      manufacturer_addr: {
        changeType: "Modify",
        oldValue: "Medos International SARL",
        newValue: "New Corp",
      },
    });
    const f = makeFinding({
      category: "text",
      before: "MedosInternationalSARL",
      after:  "NewCorp",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("extra spaces in OCR output → still matches", () => {
    const lrf = makeLrf({
      manufacturer_addr: {
        changeType: "Modify",
        oldValue: "West Chester PA 19380",
        newValue: "East London EC1A",
      },
    });
    const f = makeFinding({
      category: "text",
      before: "West  Chester  PA  19380",
      after:  "East  London  EC1A",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// valueIn — tier 3: word-level overlap ≥ 75%
// ─────────────────────────────────────────────────────────────────────────────

describe("valueIn — tier 3 (word-level overlap)", () => {
  it("vertical OCR loses spaces/commas — ≥75% significant words present → matches", () => {
    const lrf = makeLrf({
      manufacturer_addr: {
        changeType: "Modify",
        oldValue: "1302 Wrights Lane East West Chester Pennsylvania USA",
        newValue:  "New Street City",
      },
    });
    // Vertical OCR: commas dropped, some words merged — but 7/8 significant words are present
    const f = makeFinding({
      category: "text",
      before: "1302WrightsLane East WestChester Pennsylvania USA",
      after:  "New Street City",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("fewer than 75% of words match → unexpected", () => {
    const lrf = makeLrf({
      manufacturer_addr: {
        changeType: "Modify",
        oldValue: "Alpha Beta Gamma Delta Epsilon",
        newValue:  "New Value Here",
      },
    });
    // Only "Alpha" out of 5 words matches (20%), below 75% threshold
    const f = makeFinding({
      category: "text",
      before: "Alpha Omega Psi Chi Lambda",
      after:  "New Value Here",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });

  it("short tokens under 3 chars — tier 3 not applicable → falls through to unexpected", () => {
    const lrf = makeLrf({
      manufacturer_addr: { changeType: "Modify", oldValue: "AB", newValue: "CD" },
    });
    // "AB" and "CD" are 2 chars each — filtered out of word-level tier (requires ≥3 chars)
    const f = makeFinding({
      category: "text",
      before: "XY ZZ",
      after:  "PQ RS",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL protocol stripping
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — URL protocol stripping", () => {
  // eifu_url → categoryId: "text"
  const lrf = makeLrf({
    eifu_url: {
      changeType: "Modify",
      oldValue: "https://www.old-ifu.com",
      newValue:  "https://www.new-ifu.com",
    },
  });

  it("OCR text without https:// still matches LRF value with https://", () => {
    const f = makeFinding({
      category: "text",
      before: "www.old-ifu.com",
      after:  "www.new-ifu.com",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Category guard
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — category guard", () => {
  it("graphics finding against a text-category attribute → unexpected", () => {
    const lrf = makeLrf({
      manufacturer_addr: {
        changeType: "Modify",
        oldValue: "Old Manufacturer Street",
        newValue:  "New Manufacturer Avenue",
      },
    });
    // manufacturer_addr → categoryId "text"; finding is "graphics" → no match
    const f = makeFinding({
      category: "graphics",
      before: "Old Manufacturer Street",
      after:  "New Manufacturer Avenue",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });

  it("text finding against a graphics attribute → unexpected", () => {
    const lrf = makeLrf({
      logo_change: { changeType: "Modify", oldValue: "Old Logo", newValue: "New Logo" },
    });
    // logo_change → categoryId "graphics"; finding is "text" → no match
    const f = makeFinding({
      category: "text",
      before: "Old Logo",
      after:  "New Logo",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Graphics keyword fallback (no explicit values, category must be graphics)
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — graphics keyword fallback", () => {
  it("graphic finding with 'logo' keyword in description → expected", () => {
    const lrf = makeLrf({
      logo_change: { changeType: "Modify", oldValue: "", newValue: "" },
    });
    // logo_change → categoryId "graphics", label "Logo change"
    // keyword extracted: "logo", "change" — both ≥4 chars: "logo", "change"
    const f = makeFinding({
      category: "graphics",
      description: "graphic content changed: logo replaced",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("graphic finding with no matching keyword → unexpected", () => {
    const lrf = makeLrf({
      logo_change: { changeType: "Modify", oldValue: "", newValue: "" },
    });
    const f = makeFinding({
      category: "graphics",
      description: "symbol repositioned",  // no "logo" or "change" keyword
    });
    // "logo" (4 chars), "change" (6 chars) are keywords; "symbol" and "repositioned"
    // don't contain them → unexpected
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });

  it("text finding with no explicit values → unexpected (no keyword fallback for text)", () => {
    const lrf = makeLrf({
      manufacturer_addr: { changeType: "Modify", oldValue: "", newValue: "" },
    });
    const f = makeFinding({
      category: "text",
      description: "text content changed",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate address scenario — two findings for same LRF attribute
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — duplicate address on label", () => {
  const lrf = makeLrf({
    manufacturer_addr: {
      changeType: "Modify",
      oldValue: "Medos International SARL 2400 Le Locle Switzerland",
      newValue:  "1302 Wrights Lane East West Chester Pennsylvania USA",
    },
  });

  it("horizontal, clean OCR address → expected", () => {
    const f = makeFinding({
      category: "text",
      before: "Medos International SARL 2400 Le Locle Switzerland",
      after:  "1302 Wrights Lane East West Chester Pennsylvania USA",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("vertical, garbled OCR with ≥75% word overlap → expected", () => {
    const f = makeFinding({
      category: "text",
      before: "MedosInternational 2400 LeLocle Switzerland",  // spaces lost, all major words present
      after:  "1302WrightsLane WestChester Pennsylvania USA",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });

  it("unrelated change in same text category → unexpected", () => {
    const f = makeFinding({
      category: "text",
      before: "DePuy Synthes Products Inc 325 Paramount Drive",
      after:  "DePuy Synthes Products Inc 500 New Drive",
    });
    expect(classifyFinding(f, lrf)).toBe("unexpected");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EC Rep — token ending with ) — regression for \b word-boundary bug
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyFinding — EC Rep address with parenthetical suffix", () => {
  it("authorized_rep name ending with ) is classified expected", () => {
    // ecrep_name → categoryId "text", backend field "authorized_rep"
    // The old \b regex bug: token ending with ')' → \b always fails.
    // classifyFinding uses the backend engine result via applyReconciliation,
    // but the frontend's own valueIn must also tolerate such tokens.
    const lrf = makeLrf({
      ecrep_name: {
        changeType: "Modify",
        oldValue: "DePuy Ireland UC (Craniomaxillofacial)",
        newValue:  "DePuy Synthes GmbH",
      },
    });
    const f = makeFinding({
      category: "text",
      before: "DePuy Ireland UC (Craniomaxillofacial)",
      after:  "DePuy Synthes GmbH",
    });
    expect(classifyFinding(f, lrf)).toBe("expected");
  });
});
