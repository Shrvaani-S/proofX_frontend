/**
 * Unit tests for buildLabelPairFromReport (src/lib/backendMapping.ts).
 *
 * Runs in the vitest node environment — pure data transforms, no DOM/fetch.
 */

import { describe, it, expect } from "vitest";
import { buildLabelPairFromReport, mapFindings } from "./backendMapping";
import type { HistoryReport } from "./api";

function makeReport(overrides: Partial<HistoryReport> = {}): HistoryReport {
  return {
    run_id: "run-1",
    base_name: "master.pdf",
    revised_name: "revised.pdf",
    findings_report: {
      pair_id: "p1",
      dimensions: [800, 600],
      dpi: 300,
      summary: { total: 1, by_type: { text: 1 }, low_confidence_count: 0 },
      findings: [
        {
          id: 1, type: "text", bbox: [10, 20, 30, 40], summary: "text changed",
          base_value: "OLD", revised_value: "NEW", delta_e_max: 12, ocr_confidence: 0.9,
          low_confidence: false,
        },
      ],
    },
    base_image_png_base64: "AAAA",
    revised_image_png_base64: "BBBB",
    reconcile_report: null,
    ...overrides,
  };
}

describe("buildLabelPairFromReport", () => {
  it("maps findings and dimensions from the report", () => {
    const report = makeReport();
    const { pair, idMap } = buildLabelPairFromReport("run-1", "master.pdf", "revised.pdf", report);

    expect(pair.width).toBe(800);
    expect(pair.height).toBe(600);
    expect(pair.findings).toHaveLength(1);
    expect(pair.findings[0].category).toBe("text");
    expect(pair.findings[0].before).toBe("OLD");
    expect(pair.findings[0].after).toBe("NEW");
    expect(idMap[1]).toBe(pair.findings[0].id);
  });

  it("builds data URIs from the base64 images", () => {
    const report = makeReport();
    const { pair } = buildLabelPairFromReport("run-1", "master.pdf", "revised.pdf", report);

    expect(pair.masterUrl).toBe("data:image/png;base64,AAAA");
    expect(pair.revisedUrl).toBe("data:image/png;base64,BBBB");
  });

  it("swaps a .pdf extension to .png so exportPDF's isPdf() check doesn't misfire", () => {
    // masterUrl/revisedUrl are always rendered PNGs (post-alignment output),
    // never the raw upload — a .pdf-named pair with no DOM card ref to fall
    // back on would otherwise silently lose its images in ExportModal.tsx.
    const report = makeReport();
    const { pair } = buildLabelPairFromReport("run-1", "master.pdf", "revised.pdf", report);

    expect(pair.masterName).toBe("master.png");
    expect(pair.revisedName).toBe("revised.png");
    expect(pair.masterName.toLowerCase().endsWith(".pdf")).toBe(false);
  });

  it("leaves non-pdf names unchanged", () => {
    const report = makeReport();
    const { pair } = buildLabelPairFromReport("run-1", "master.png", "revised.jpg", report);

    expect(pair.masterName).toBe("master.png");
    expect(pair.revisedName).toBe("revised.jpg");
  });
});

describe("mapFindings", () => {
  it("assigns sequential per-category frontend ids", () => {
    const { findings, idMap } = mapFindings([
      { id: 5, type: "text", bbox: [0, 0, 1, 1], summary: "a", base_value: null, revised_value: null, delta_e_max: 1, ocr_confidence: null, low_confidence: false },
      { id: 9, type: "graphic", bbox: [0, 0, 1, 1], summary: "b", base_value: null, revised_value: null, delta_e_max: 1, ocr_confidence: null, low_confidence: false },
    ]);
    expect(findings[0].id).toBe("T1");
    expect(findings[1].id).toBe("G1");
    expect(idMap[5]).toBe("T1");
    expect(idMap[9]).toBe("G1");
  });
});
