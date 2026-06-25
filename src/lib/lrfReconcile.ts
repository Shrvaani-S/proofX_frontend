// Bridges this app's LRF form (src/data/lrfAttributes.ts — ~80 attributes,
// explicit Old value / New value fields, Add/Remove/Modify) onto the backend
// reconciliation engine's strict contract (reconciliation_layer/engine.py:
// FIELD_MATCH_TYPE only recognises field="address"|"authorized_rep"|"eifu_link"|"logo",
// each needing an actual old->new text pair it can search for in the OCR'd findings).
//
// Only attributes with a clear, low-ambiguity correspondence to one of those
// fields, AND both an old and a new value (i.e. changeType "Modify" — the
// engine's token match needs literal text on both sides; "Add"/"Remove" only
// supply one side and would otherwise trivially match), are sent to
// /api/reconcile. Everything else (symbols, barcode specifics, logo image
// swaps, Add/Remove changes) is NOT faked into the backend engine — it stays
// on the existing client-side classifyFinding heuristic in utils/lrfClassify.ts.
// Logo is a known gap: the engine supports it (two reference images), but
// this app's LRF form only keeps the new logo's filename, not the image
// blob, so there is nothing real to send yet.

import type { LRFData } from "@/types/lrf";
import type { ReconcileLRF, ReconcileReport, ReconcileRequirement } from "@/lib/api";

const ATTRIBUTE_TO_BACKEND_FIELD: Record<string, "address" | "authorized_rep" | "eifu_link"> = {
  manufacturer_addr: "address",
  distributor_addr: "address",
  ecrep_addr: "address",
  ecrep_name: "authorized_rep",
  eifu_url: "eifu_link",
};

/** Returns null when no LRF attribute maps to a backend-verifiable field — caller should skip reconciliation. */
export function buildReconcileLRF(lrfData: LRFData, lrfId: string): ReconcileLRF | null {
  const requirements: ReconcileRequirement[] = [];

  for (const [attrId, change] of Object.entries(lrfData.changes)) {
    if (!change.changeType) continue;
    const field = ATTRIBUTE_TO_BACKEND_FIELD[attrId];
    if (!field) continue;
    const old = change.oldValue.trim();
    const next = change.newValue.trim();
    if (!old || !next) continue;
    requirements.push({
      id: `R${requirements.length + 1}`,
      field,
      old,
      new: next,
    });
  }

  return requirements.length > 0 ? { lrf_id: lrfId, requirements } : null;
}

export interface ReconciliationOverrides {
  byFrontendId: Record<string, "expected" | "unexpected">;
  overall: ReconcileReport["overall"];
  globalFlags: string[];
}

/** idMap: backend numeric Finding.id -> frontend Finding.id (e.g. "T3"), from backendMapping.mapFindings. */
export function applyReconciliation(
  report: ReconcileReport,
  idMap: Record<number, string>,
): ReconciliationOverrides {
  const byFrontendId: Record<string, "expected" | "unexpected"> = {};

  for (const req of report.requirements) {
    const status = req.verdict === "DONE_CORRECT" ? "expected" : "unexpected";
    for (const backendId of req.evidence_finding_ids) {
      const frontendId = idMap[backendId];
      if (frontendId) byFrontendId[frontendId] = status;
    }
  }
  for (const item of report.unexpected) {
    for (const backendId of item.finding_ids) {
      const frontendId = idMap[backendId];
      if (frontendId) byFrontendId[frontendId] = "unexpected";
    }
  }

  return { byFrontendId, overall: report.overall, globalFlags: report.global_flags };
}

/** Findings the backend reconciliation didn't cover at all (e.g. it returned null/wasn't run). */
export function hasMappableLrf(lrfData: LRFData | null | undefined): boolean {
  if (!lrfData) return false;
  return Object.keys(lrfData.changes).some((id) => id in ATTRIBUTE_TO_BACKEND_FIELD);
}
