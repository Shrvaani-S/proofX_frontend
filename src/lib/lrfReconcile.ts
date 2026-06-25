// Bridges this app's LRF form (src/data/lrfAttributes.ts — ~80 attributes,
// explicit Old value / New value fields, Add/Remove/Modify) onto the backend
// reconciliation engine's strict contract (reconciliation_layer/engine.py:
// FIELD_MATCH_TYPE only recognises field="address"|"authorized_rep"|"eifu_link"|"logo").
//
// Two distinct kinds of requirement get sent to /api/reconcile:
//   - TEXT fields (address/authorized_rep/eifu_link): need literal old->new text on
//     both sides (the engine's token match needs both; "Add"/"Remove" only supply one
//     side and would otherwise trivially match) — i.e. effectively changeType "Modify".
//   - GRAPHIC field (logo): needs two actual reference IMAGES (old + new), uploaded
//     alongside the LRF JSON as multipart files, referenced by `ref_image:<name>`
//     tokens — see router/reconcile.py's `ref_images` param. LRFAttributeRow.tsx now
//     keeps the real `File` objects (`oldFile`/`newFile`), not just filenames, so this
//     is a genuine image-vs-image comparison, not a faked text match.
// Everything else (symbols, barcode specifics, every other free-text attribute without
// both an old and new value) is NOT faked into the backend engine — it stays on the
// existing client-side classifyFinding heuristic in utils/lrfClassify.ts.

import type { LRFData } from "@/types/lrf";
import type { ReconcileLRF, ReconcileReport, ReconcileRequirement, RefImageUpload } from "@/lib/api";

const ATTRIBUTE_TO_BACKEND_FIELD: Record<string, "address" | "authorized_rep" | "eifu_link"> = {
  manufacturer_addr: "address",
  distributor_addr: "address",
  ecrep_addr: "address",
  ecrep_name: "authorized_rep",
  eifu_url: "eifu_link",
};

const IMAGE_ATTRIBUTE_TO_BACKEND_FIELD: Record<string, "logo"> = {
  logo_change: "logo",
};

export interface ReconcileLRFBuild {
  lrf: ReconcileLRF | null;
  /** Files to upload as `ref_images` alongside the /api/reconcile call. */
  refImages: RefImageUpload[];
}

/** lrf is null when no LRF attribute maps to a backend-verifiable field — caller should skip reconciliation. */
export function buildReconcileLRF(lrfData: LRFData, lrfId: string): ReconcileLRFBuild {
  const requirements: ReconcileRequirement[] = [];
  const refImages: RefImageUpload[] = [];

  for (const [attrId, change] of Object.entries(lrfData.changes)) {
    if (!change.changeType) continue;

    const imageField = IMAGE_ATTRIBUTE_TO_BACKEND_FIELD[attrId];
    if (imageField) {
      // Needs both references to do a real before/after comparison — an "Add" with
      // only a new image has nothing to compare it against.
      if (change.changeType !== "Modify" || !change.oldFile || !change.newFile) continue;
      const oldName = `${attrId}_old_${change.oldFile.name}`;
      const newName = `${attrId}_new_${change.newFile.name}`;
      refImages.push({ name: oldName, file: change.oldFile }, { name: newName, file: change.newFile });
      requirements.push({
        id: `R${requirements.length + 1}`,
        field: imageField,
        old: `ref_image:${oldName}`,
        new: `ref_image:${newName}`,
      });
      continue;
    }

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

  return { lrf: requirements.length > 0 ? { lrf_id: lrfId, requirements } : null, refImages };
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
  return Object.keys(lrfData.changes).some(
    (id) => id in ATTRIBUTE_TO_BACKEND_FIELD || id in IMAGE_ATTRIBUTE_TO_BACKEND_FIELD,
  );
}
