/**
 * Full LRF flow tests — frontend side.
 *
 * Covers:
 *   buildReconcileLRF  — maps LRF form data to backend requirements
 *   applyReconciliation — maps backend report verdicts to frontend finding ids
 *   Integration         — buildReconcileLRF → applyReconciliation end-to-end
 */

import { describe, it, expect } from "vitest";
import { buildReconcileLRF, applyReconciliation } from "./lrfReconcile";
import type { LRFData } from "@/types/lrf";
import type { ReconcileReport } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function makeReport(overrides: Partial<ReconcileReport> = {}): ReconcileReport {
  return {
    lrf_id: "LRF-T",
    pair_id: "p1",
    overall: "PASS",
    global_flags: [],
    requirements: [],
    unexpected: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildReconcileLRF
// ─────────────────────────────────────────────────────────────────────────────

describe("buildReconcileLRF", () => {
  describe("attribute → backend field mapping", () => {
    it("maps manufacturer_addr to field 'address'", () => {
      const lrf = makeLrf({ manufacturer_addr: { changeType: "Modify", oldValue: "Old St", newValue: "New Ave" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result?.requirements[0].field).toBe("address");
    });

    it("maps ecrep_addr to field 'address'", () => {
      const lrf = makeLrf({ ecrep_addr: { changeType: "Modify", oldValue: "Old", newValue: "New" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result?.requirements[0].field).toBe("address");
    });

    it("maps ecrep_name to field 'authorized_rep'", () => {
      const lrf = makeLrf({ ecrep_name: { changeType: "Modify", oldValue: "OldRep", newValue: "NewRep" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result?.requirements[0].field).toBe("authorized_rep");
    });

    it("maps eifu_url to field 'eifu_link'", () => {
      const lrf = makeLrf({ eifu_url: { changeType: "Modify", oldValue: "www.old.com", newValue: "www.new.com" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result?.requirements[0].field).toBe("eifu_link");
    });

    it("uses attrId as field name for unmapped attributes", () => {
      const lrf = makeLrf({ revision_code: { changeType: "Modify", oldValue: "REV A", newValue: "REV B" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result?.requirements[0].field).toBe("revision_code");
    });
  });

  describe("URL protocol stripping", () => {
    it("strips https:// from old and new values", () => {
      const lrf = makeLrf({ eifu_url: { changeType: "Modify", oldValue: "https://www.old.com", newValue: "https://www.new.com" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      const req = result!.requirements[0];
      expect(req.old).toBe("www.old.com");
      expect(req.new).toBe("www.new.com");
    });

    it("strips http:// from values", () => {
      const lrf = makeLrf({ eifu_url: { changeType: "Modify", oldValue: "http://www.old.com", newValue: "http://www.new.com" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      const req = result!.requirements[0];
      expect(req.old).toBe("www.old.com");
      expect(req.new).toBe("www.new.com");
    });

    it("does not strip non-protocol text", () => {
      const lrf = makeLrf({ eifu_url: { changeType: "Modify", oldValue: "www.old.com", newValue: "www.new.com" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result!.requirements[0].old).toBe("www.old.com");
    });
  });

  describe("filtering", () => {
    it("skips attributes with empty changeType", () => {
      const lrf = makeLrf({ manufacturer_addr: { changeType: "", oldValue: "Old", newValue: "New" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result).toBeNull();
    });

    it("skips text attributes missing old value", () => {
      const lrf = makeLrf({ manufacturer_addr: { changeType: "Modify", oldValue: "", newValue: "New" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result).toBeNull();
    });

    it("skips text attributes missing new value", () => {
      const lrf = makeLrf({ manufacturer_addr: { changeType: "Modify", oldValue: "Old", newValue: "" } });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result).toBeNull();
    });

    it("includes attribute only when both old and new are present", () => {
      const lrf = makeLrf({
        manufacturer_addr: { changeType: "Modify", oldValue: "Old St", newValue: "New Ave" },
        ecrep_name: { changeType: "Modify", oldValue: "", newValue: "NewRep" },  // missing old → skipped
      });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result?.requirements).toHaveLength(1);
      expect(result?.requirements[0].field).toBe("address");
    });

    it("returns null when all attributes are filtered out", () => {
      const lrf = makeLrf({
        manufacturer_addr: { changeType: "", oldValue: "Old", newValue: "New" },
      });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result).toBeNull();
    });
  });

  describe("multiple attributes", () => {
    it("emits one requirement per valid attribute", () => {
      const lrf = makeLrf({
        manufacturer_addr: { changeType: "Modify", oldValue: "Old Addr", newValue: "New Addr" },
        ecrep_name:        { changeType: "Modify", oldValue: "OldRep",   newValue: "NewRep" },
        eifu_url:          { changeType: "Modify", oldValue: "www.old.com", newValue: "www.new.com" },
      });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      expect(result?.requirements).toHaveLength(3);
    });

    it("assigns sequential R1, R2, R3 ids", () => {
      const lrf = makeLrf({
        manufacturer_addr: { changeType: "Modify", oldValue: "A", newValue: "B" },
        ecrep_name:        { changeType: "Modify", oldValue: "C", newValue: "D" },
      });
      const { lrf: result } = buildReconcileLRF(lrf, "CR-001");
      const ids = result!.requirements.map((r) => r.id);
      expect(ids).toEqual(["R1", "R2"]);
    });

    it("uses the lrfId as lrf_id", () => {
      const lrf = makeLrf({ manufacturer_addr: { changeType: "Modify", oldValue: "Old", newValue: "New" } });
      const { lrf: result } = buildReconcileLRF(lrf, "MY-CR-999");
      expect(result?.lrf_id).toBe("MY-CR-999");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyReconciliation
// ─────────────────────────────────────────────────────────────────────────────

describe("applyReconciliation", () => {
  const idMap: Record<number, string> = { 1: "T1", 2: "T2", 3: "G1", 4: "T3" };

  describe("DONE_CORRECT verdict", () => {
    it("marks claimed finding as expected", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "DONE_CORRECT", evidence_finding_ids: [1], reason: "" }],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T1"]).toBe("expected");
    });

    it("marks multiple claimed findings as expected", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "DONE_CORRECT", evidence_finding_ids: [1, 2], reason: "" }],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T1"]).toBe("expected");
      expect(byFrontendId["T2"]).toBe("expected");
    });
  });

  describe("NEEDS_REVIEW verdict", () => {
    it("marks NEEDS_REVIEW finding as expected (match found, low OCR confidence)", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "NEEDS_REVIEW", evidence_finding_ids: [1], reason: "low confidence" }],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T1"]).toBe("expected");
    });

    it("NEEDS_REVIEW finding is NOT in unexpected slot", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "NEEDS_REVIEW", evidence_finding_ids: [1], reason: "" }],
        unexpected: [],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T1"]).toBe("expected");
    });
  });

  describe("DONE_INCORRECT verdict", () => {
    it("marks DONE_INCORRECT finding as unexpected", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "DONE_INCORRECT", evidence_finding_ids: [1], reason: "wrong value" }],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T1"]).toBe("unexpected");
    });
  });

  describe("NOT_DONE verdict", () => {
    it("does not set any finding for NOT_DONE (no evidence_finding_ids)", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "NOT_DONE", evidence_finding_ids: [], reason: "" }],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T1"]).toBeUndefined();
    });
  });

  describe("unexpected bucket — no forced override", () => {
    it("findings in unexpected bucket are NOT written into byFrontendId", () => {
      // Key regression: before the fix, unexpected-bucket findings were forced to
      // "unexpected" in byFrontendId, which prevented classifyFinding from running.
      // After the fix they stay undefined → classifyFinding fallback can still match them.
      const report = makeReport({
        requirements: [],
        unexpected: [{ change: "old -> new", finding_ids: [1], acknowledged: false }],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T1"]).toBeUndefined();
    });

    it("garbled-OCR findings in unexpected bucket remain undefined (classifyFinding decides)", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "DONE_CORRECT", evidence_finding_ids: [2], reason: "" }],
        unexpected: [{ change: "-12-31 R 8 13 -> -12-31 R 13", finding_ids: [1], acknowledged: false }],
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(byFrontendId["T2"]).toBe("expected");   // claimed finding
      expect(byFrontendId["T1"]).toBeUndefined();    // garbled — classifyFinding decides
    });
  });

  describe("overall and globalFlags pass-through", () => {
    it("passes overall PASS", () => {
      const report = makeReport({ overall: "PASS" });
      expect(applyReconciliation(report, idMap).overall).toBe("PASS");
    });

    it("passes overall BLOCKED", () => {
      const report = makeReport({ overall: "BLOCKED" });
      expect(applyReconciliation(report, idMap).overall).toBe("BLOCKED");
    });

    it("passes global_flags through", () => {
      const report = makeReport({ global_flags: ["low_confidence_resolution"] });
      expect(applyReconciliation(report, idMap).globalFlags).toEqual(["low_confidence_resolution"]);
    });
  });

  describe("idMap: unmapped backend ids are ignored", () => {
    it("backend id not in idMap is silently skipped", () => {
      const report = makeReport({
        requirements: [{ id: "R1", field: "address", match_type: "token",
          verdict: "DONE_CORRECT", evidence_finding_ids: [99], reason: "" }], // 99 not in idMap
      });
      const { byFrontendId } = applyReconciliation(report, idMap);
      expect(Object.keys(byFrontendId)).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: buildReconcileLRF → applyReconciliation
// ─────────────────────────────────────────────────────────────────────────────

describe("LRF flow integration", () => {
  it("address change — end to end expected", () => {
    const lrf = makeLrf({
      manufacturer_addr: { changeType: "Modify",
        oldValue: "Medos International SARL 2400LeLocle Switzerland",
        newValue: "1302 Wrights Lane East West Chester PA19380 USA" },
    });
    const { lrf: built } = buildReconcileLRF(lrf, "CR-001");
    expect(built).not.toBeNull();

    // Simulate backend returning DONE_CORRECT for finding 1 (= "T1")
    const report = makeReport({
      requirements: [{ id: "R1", field: "address", match_type: "token",
        verdict: "DONE_CORRECT", evidence_finding_ids: [1], reason: "" }],
    });
    const idMap = { 1: "T1" };
    const { byFrontendId } = applyReconciliation(report, idMap);
    expect(byFrontendId["T1"]).toBe("expected");
  });

  it("URL attribute — protocol stripped, then applied", () => {
    const lrf = makeLrf({
      eifu_url: { changeType: "Modify",
        oldValue: "https://www.e-ifu.com/old",
        newValue: "https://www.e-ifu.com/new" },
    });
    const { lrf: built } = buildReconcileLRF(lrf, "CR-001");
    expect(built!.requirements[0].old).toBe("www.e-ifu.com/old");
    expect(built!.requirements[0].new).toBe("www.e-ifu.com/new");

    // Simulate backend DONE_CORRECT
    const report = makeReport({
      requirements: [{ id: "R1", field: "eifu_link", match_type: "exact",
        verdict: "DONE_CORRECT", evidence_finding_ids: [5], reason: "" }],
    });
    const { byFrontendId } = applyReconciliation(report, { 5: "T5" });
    expect(byFrontendId["T5"]).toBe("expected");
  });

  it("NEEDS_REVIEW from low-confidence OCR — still expected, not unexpected", () => {
    const lrf = makeLrf({
      ecrep_addr: { changeType: "Modify",
        oldValue: "DePuy Ireland UC Loughbeg Ringaskiddy Co Cork Ireland",
        newValue: "1302 Wrights Lane East West Chester PA19380 USA" },
    });
    const { lrf: built } = buildReconcileLRF(lrf, "CR-001");
    expect(built!.requirements[0].field).toBe("address");

    // Backend finds a match but downgrades to NEEDS_REVIEW (upscaled image, low OCR conf)
    const report = makeReport({
      overall: "BLOCKED",
      global_flags: ["low_confidence_resolution"],
      requirements: [{ id: "R1", field: "address", match_type: "token",
        verdict: "NEEDS_REVIEW", evidence_finding_ids: [3], reason: "low confidence" }],
    });
    const { byFrontendId, overall } = applyReconciliation(report, { 3: "T3" });
    expect(byFrontendId["T3"]).toBe("expected");   // change WAS found
    expect(overall).toBe("BLOCKED");               // gate still blocks (acknowledged needed)
  });

  it("two address instances — one claimed, garbled one falls to classifyFinding", () => {
    // Backend claims T2 (horizontal, readable), T1 (vertical, garbled) goes to unexpected bucket.
    const report = makeReport({
      requirements: [{ id: "R1", field: "address", match_type: "token",
        verdict: "DONE_CORRECT", evidence_finding_ids: [2], reason: "" }],
      unexpected: [{ change: "-12-31 R 8 13 -> -12-31 R 13", finding_ids: [1], acknowledged: false }],
    });
    const idMap = { 1: "T1", 2: "T2" };
    const { byFrontendId } = applyReconciliation(report, idMap);
    expect(byFrontendId["T2"]).toBe("expected");
    // T1 is left undefined so classifyFinding can evaluate it via the ResultsPage fallback.
    expect(byFrontendId["T1"]).toBeUndefined();
  });

  it("completely unexpected change — not in LRF, not claimed", () => {
    const lrf = makeLrf({
      manufacturer_addr: { changeType: "Modify", oldValue: "Old Addr", newValue: "New Addr" },
    });
    const { lrf: built } = buildReconcileLRF(lrf, "CR-001");
    expect(built).not.toBeNull();

    // Backend: R1 matched finding 1; finding 2 is a surprise change not in LRF
    const report = makeReport({
      overall: "BLOCKED",
      requirements: [{ id: "R1", field: "address", match_type: "token",
        verdict: "DONE_CORRECT", evidence_finding_ids: [1], reason: "" }],
      unexpected: [{ change: "8 DePuy Synthes -> CecaCola", finding_ids: [2], acknowledged: false }],
    });
    const { byFrontendId } = applyReconciliation(report, { 1: "T1", 2: "G1" });
    expect(byFrontendId["T1"]).toBe("expected");
    // G1 (surprise change) is NOT in byFrontendId — classifyFinding handles it,
    // and since it doesn't match any LRF attribute it will return "unexpected".
    expect(byFrontendId["G1"]).toBeUndefined();
  });
});
