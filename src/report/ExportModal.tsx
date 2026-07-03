import { useState } from "react";
import { X, FileText, FileSpreadsheet, Download, ScanLine, CheckCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { CATEGORIES } from "@/constants";
import type { LabelPair } from "@/types/label";
import type { LRFData } from "@/types/lrf";
import { classifyFinding } from "@/utils/lrfClassify";
import { LRF_ATTRIBUTE_LOOKUP } from "@/data/lrfAttributes";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type FindingStatus = "all" | "expected" | "unexpected";

interface Props {
  pairs: LabelPair[];
  activePair: LabelPair;
  mode: "single" | "bulk";
  isLrfWorkflow?: boolean;
  lrfData?: LRFData | null;
  masterCardRef: React.RefObject<HTMLDivElement | null>;
  revisedCardRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

// ─── Excel export ────────────────────────────────────────────────────────────
// TODO: Re-enable when Excel export is needed again
/*
function exportExcel(
  exportPairs: LabelPair[],
  analystName: string,
  reference: string,
  timestamp: string,
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Summary
  const summaryRows: (string | number)[][] = [
    ["ProofX Label Comparison Report"],
    [],
    ["Generated", timestamp],
    ["Requested By", analystName],
    ["Change Control Reference", reference || "—"],
    [],
    ["Label Pairs", "", "", "", ""],
    ["Pair", "Master Label", "Revised Label", "Master Version", "Revised Version", "Findings"],
    ...exportPairs.map((p, i) => [
      i + 1,
      p.masterName,
      p.revisedName,
      p.masterVersion,
      p.revisedVersion,
      p.findings.length,
    ]),
    [],
    ["Findings by Category", "", "", "", ""],
    ["Category", "Count"],
    ...CATEGORIES.map((c) => [
      c.label,
      exportPairs.reduce((n, p) => n + p.findings.filter((f) => f.category === c.id).length, 0),
    ]),
    [],
    ["Total Findings", exportPairs.reduce((n, p) => n + p.findings.length, 0)],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 32 }, { wch: 32 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // Sheet 2 — All Findings
  const findingRows: (string | number)[][] = [
    [
      "Finding ID",
      "Category",
      "Label Pair",
      "Master Label",
      "Revised Label",
      "Description",
      "Master Had",
      "Revised Has",
      "Master BBox (x,y,w,h)",
      "Revised BBox (x,y,w,h)",
    ],
  ];
  for (const pair of exportPairs) {
    for (const f of pair.findings) {
      findingRows.push([
        f.id,
        CATEGORIES.find((c) => c.id === f.category)?.label ?? f.category,
        pair.name,
        pair.masterName,
        pair.revisedName,
        f.description,
        f.before,
        f.after,
        `${f.master.x}, ${f.master.y}, ${f.master.w}, ${f.master.h}`,
        `${f.revised.x}, ${f.revised.y}, ${f.revised.w}, ${f.revised.h}`,
      ]);
    }
  }
  const wsFindings = XLSX.utils.aoa_to_sheet(findingRows);
  wsFindings["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 28 }, { wch: 28 },
    { wch: 40 }, { wch: 30 }, { wch: 30 }, { wch: 22 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsFindings, "Findings");

  XLSX.writeFile(wb, `ProofX_Report_${Date.now()}.xlsx`);
}
*/

// ─── Load a blob/object URL image → base64 data URL ─────────────────────────

async function loadImageFromUrl(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      try {
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), width: img.naturalWidth, height: img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ─── Render first page of an uploaded PDF to a JPEG data URL ─────────────────

async function renderPdfPageToDataUrl(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const loadingTask = pdfjsLib.getDocument({ url });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width: viewport.width, height: viewport.height };
  } catch {
    return null;
  }
}

// ─── Label card capture ───────────────────────────────────────────────────────
// html2canvas can't render SVGs that are inside a CSS transform: scale() wrapper.
// Fix: use the onclone hook to replace the SVG with an <img data-url> before
// html2canvas processes the element. html2canvas waits for all img src loads
// before rendering, so the SVG content is fully visible in the output.

async function captureCardToDataUrl(cardEl: HTMLDivElement): Promise<string> {
  const cardW = cardEl.offsetWidth;
  const cardH = cardEl.offsetHeight;

  const canvas = await html2canvas(cardEl, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    onclone: (_doc, clonedEl) => {
      // Strip the hover "spotlight" overlay if the user clicked Export while
      // hovering a finding. It dims the whole card via a giant box-shadow
      // (`0 0 0 9999px rgba(0,0,0,…)`); capturing it would bake the dark mask
      // into the exported label image.
      clonedEl.querySelectorAll<HTMLElement>("div").forEach((el) => {
        if (el.style.boxShadow.includes("9999px")) el.remove();
      });

      const svgEl = clonedEl.querySelector<SVGSVGElement>("svg");
      if (!svgEl) return; // uploaded file — nothing to fix

      // Clone SVG with explicit px dimensions so it renders at card size
      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      svgClone.setAttribute("width", String(cardW));
      svgClone.setAttribute("height", String(cardH));

      let svgStr = new XMLSerializer().serializeToString(svgClone);
      // Ensure standalone SVG has namespace declaration
      if (!svgStr.includes("xmlns=")) {
        svgStr = svgStr.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg"`);
      }

      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;

      // Replace the transform-scale wrapper with a normal positioned img
      const wrapper = svgEl.parentElement as HTMLElement;
      wrapper.style.cssText = `position:absolute;inset:0;width:${cardW}px;height:${cardH}px;transform:none;`;
      const img = document.createElement("img");
      img.src = dataUrl;
      img.style.cssText = `width:${cardW}px;height:${cardH}px;display:block;`;
      wrapper.innerHTML = "";
      wrapper.appendChild(img);
    },
  });

  return canvas.toDataURL("image/jpeg", 0.92);
}

// ─── Report ID — daily-resetting counter ─────────────────────────────────────

function generateReportId(): string {
  const now     = new Date();
  const yyyy    = now.getFullYear();
  const dateStr = `${yyyy}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  let count = 1;
  try {
    const raw = localStorage.getItem("proofx_export_count");
    if (raw) {
      const { date, n } = JSON.parse(raw) as { date: string; n: number };
      count = date === dateStr ? n + 1 : 1;
    }
    localStorage.setItem("proofx_export_count", JSON.stringify({ date: dateStr, n: count }));
  } catch { /* ignore — localStorage unavailable (e.g. private browsing) */ }

  return `${yyyy}${String(count).padStart(4, "0")}`;
}

function buildExportFilename(reportId: string, isLrfWorkflow?: boolean): string {
  return isLrfWorkflow ? `ProofX_${reportId}.pdf` : `ProofX_Report_${reportId}.pdf`;
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function exportPDF(
  exportPairs: LabelPair[],
  activePair: LabelPair,
  analystName: string,
  reference: string,
  timestamp: string,
  masterCardRef?: React.RefObject<HTMLDivElement | null>,
  revisedCardRef?: React.RefObject<HTMLDivElement | null>,
  lrfData?: LRFData | null,
  isLrfWorkflow?: boolean,
) {
  const doc       = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const navy      = [28, 46, 89]    as [number, number, number];
  const orange    = [240, 121, 34]  as [number, number, number];
  const lightGray = [245, 246, 248] as [number, number, number];
  const green     = [29, 158, 117]  as [number, number, number];
  const red       = [220, 38, 38]   as [number, number, number];
  const W         = 210;
  const H         = 297;
  const ML        = 14;
  const usableW   = W - ML * 2;

  // ── Report IDs ───────────────────────────────────────────────────────────
  const reportId    = generateReportId();
  const proofingIds = exportPairs.map((_, i) => `${reportId}_${i + 1}`);
  const showStatus  = !!(isLrfWorkflow && lrfData);

  // Pre-compute LRF verdicts per pair
  const pairStatuses   = exportPairs.map((pair) => {
    if (!showStatus) return null;
    return pair.findings.some((f) => classifyFinding(f, lrfData!) === "unexpected") ? "FAIL" : "PASS";
  });
  const pairExpected   = exportPairs.map((pair) =>
    showStatus ? pair.findings.filter((f) => classifyFinding(f, lrfData!) === "expected").length : 0,
  );
  const pairUnexpected = exportPairs.map((pair) =>
    showStatus ? pair.findings.filter((f) => classifyFinding(f, lrfData!) === "unexpected").length : 0,
  );

  // ── Shared branded header layout constants ───────────────────────────────
  const CARD_TOP  = 3;                          // top white margin before the navy card (mm)
  const NAVY_H    = 33;                         // navy block height (mm) — matches grid height
  const GRID_TOP  = CARD_TOP + NAVY_H;          // grid sits directly below navy — no gap
  const GRID_H    = 30;                         // metadata grid height
  const AFTER_HDR = GRID_TOP + GRID_H + 10;    // first y for content (≈78mm)

  // Column widths — last column wide enough that "TOTAL DOCUMENTS" fits on one line
  // so the label wraps to 2 lines ("TOTAL DOCUMENTS" / "REVIEWED"), not 3
  const mcW = [38, 58, 51, usableW - 38 - 58 - 51] as const; // 38|58|51|35

  // Draws the branded header block on whichever page is currently active.
  // Returns the y position where content should start below the grid.
  const drawBrandedHeader = () => {
    // Navy block — card within page margins (not full-bleed)
    doc.setFillColor(...navy);
    doc.rect(ML, CARD_TOP, usableW, NAVY_H, "F");

    // PROOFX wordmark
    doc.setTextColor(160, 185, 215);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("PROOFX", ML + 5, CARD_TOP + 7);

    // Title — single line, tight below PROOFX
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Label Proofing Report", ML + 5, CARD_TOP + 17);

    // Subtitle — immediately below title
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 185, 215);
    doc.text("AUDIT-READY  \u00b7  CHANGE CONTROL RECORD", ML + 5, CARD_TOP + 26);

    // 4-column metadata grid — outer border
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.4);
    doc.rect(ML, GRID_TOP, usableW, GRID_H);

    // Column dividers
    doc.setLineWidth(0.3);
    let divX = ML;
    for (let c = 0; c < 3; c++) {
      divX += mcW[c];
      doc.line(divX, GRID_TOP, divX, GRID_TOP + GRID_H);
    }

    // Column content — all values in dark navy, labels in neutral gray
    const metaCols: { label: string; value: string }[] = [
      { label: "REPORT ID",                value: reportId                },
      { label: "GENERATED",                value: timestamp               },
      { label: "USER",                     value: analystName || "\u2014" },
      { label: "TOTAL DOCUMENTS REVIEWED", value: `${exportPairs.length} pair${exportPairs.length !== 1 ? "s" : ""}` },
    ];

    let cx = ML;
    for (let c = 0; c < 4; c++) {
      const { label, value } = metaCols[c];
      const cellX = cx + 5;
      const maxW  = mcW[c] - 10;

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 120, 155);
      doc.text(label, cellX, GRID_TOP + 9, { maxWidth: maxW });

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...navy);
      doc.text(value, cellX, GRID_TOP + 23, { maxWidth: maxW });

      cx += mcW[c];
    }

    return AFTER_HDR;
  };

  // ── PAGE 1: COVER ────────────────────────────────────────────────────────
  let y = drawBrandedHeader();

  // LRF: Change Summary on cover
  if (showStatus) {
    const definedChanges = Object.entries(lrfData!.changes).filter(([, cd]) => cd.changeType !== "");
    if (definedChanges.length > 0) {
      y += 6;
      doc.setFillColor(...navy);
      doc.rect(ML, y - 5, usableW, 9, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("CHANGE SUMMARY \u2014 EXPECTED CHANGES", ML + 3, y + 0.5);
      y += 11;

      for (const [attrId, cd] of definedChanges) {
        if (y > H - 18) break;
        const label   = LRF_ATTRIBUTE_LOOKUP[attrId]?.label ?? attrId;
        const fromVal = cd.oldValue || "\u2014";
        const toVal   = cd.newValue || "\u2014";

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(28, 46, 89);
        doc.text(label, ML, y, { maxWidth: 65 });

        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(fromVal, ML + 70, y);

        const arrowX = ML + 70 + doc.getTextWidth(fromVal) + 4;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...orange);
        doc.text("\u2192", arrowX, y);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(20, 20, 20);
        doc.text(toVal, arrowX + 6, y, { maxWidth: W - ML - (arrowX + 6) });
        y += 8;
      }
    }
  }

  // ── PAGE 2: Summary placeholder (rendered after pair pages) ─────────────
  doc.addPage();
  const SUMMARY_PAGE = 2;

  // ── PER-PAIR PAGES (3+) ──────────────────────────────────────────────────
  const isPdf = (name: string) => name.toLowerCase().endsWith(".pdf");
  type ImgData = { dataUrl: string; width: number; height: number };
  const pairPageNumbers: number[] = [];
  const MAX_IMG_H = 88; // mm per image (full-width stacked)

  for (let pIdx = 0; pIdx < exportPairs.length; pIdx++) {
    doc.addPage();
    const pairPage = doc.getNumberOfPages();
    pairPageNumbers.push(pairPage);

    const pair       = exportPairs[pIdx];
    const proofingId = proofingIds[pIdx];
    const status     = pairStatuses[pIdx];

    // Header bar
    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 18, "F");

    const vizPrefix = "LABEL VISUAL COMPARISON";
    doc.setTextColor(190, 205, 225);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(vizPrefix, ML, 9);
    doc.setTextColor(...orange);
    doc.setFont("helvetica", "bold");
    doc.text(`  \u00b7  ${proofingId}`, ML + doc.getTextWidth(vizPrefix), 9);

    // Back link (right side, second line of header)
    const backText = "\u2190 Back to Summary Table";
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(190, 205, 225);
    doc.text(backText, W - ML, 15, { align: "right" });
    const backW = doc.getTextWidth(backText);
    doc.link(W - ML - backW, 11, backW, 5, { pageNumber: SUMMARY_PAGE });

    // Large proofing ID
    let cy = 26;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...navy);
    doc.text(proofingId, ML, cy);

    // Pass/Fail badge (LRF only)
    if (status) {
      const badgeColor = status === "PASS" ? green : red;
      const idW        = doc.getTextWidth(proofingId);
      doc.setFillColor(...badgeColor);
      doc.roundedRect(ML + idW + 5, cy - 5.5, 18, 7, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.text(status, ML + idW + 14, cy - 0.5, { align: "center" });
    }

    // Label names row
    cy += 7;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("Current:", ML, cy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(pair.masterName, ML + 20, cy, { maxWidth: usableW / 2 - 22 });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("Revised:", ML + usableW / 2, cy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text(pair.revisedName, ML + usableW / 2 + 20, cy, { maxWidth: usableW / 2 - 22 });

    // Separator
    cy += 5;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(ML, cy, W - ML, cy);
    cy += 5;

    // Resolve images
    let masterImg: ImgData | null = null;
    let revisedImg: ImgData | null = null;

    if (pair.masterUrl) {
      masterImg = isPdf(pair.masterName)
        ? await renderPdfPageToDataUrl(pair.masterUrl)
        : await loadImageFromUrl(pair.masterUrl);
    }
    if (pair.revisedUrl) {
      revisedImg = isPdf(pair.revisedName)
        ? await renderPdfPageToDataUrl(pair.revisedUrl)
        : await loadImageFromUrl(pair.revisedUrl);
    }
    if (!masterImg && pair.id === activePair.id && masterCardRef?.current) {
      const dataUrl = await captureCardToDataUrl(masterCardRef.current);
      masterImg = { dataUrl, width: masterCardRef.current.offsetWidth, height: masterCardRef.current.offsetHeight };
    }
    if (!revisedImg && pair.id === activePair.id && revisedCardRef?.current) {
      const dataUrl = await captureCardToDataUrl(revisedCardRef.current);
      revisedImg = { dataUrl, width: revisedCardRef.current.offsetWidth, height: revisedCardRef.current.offsetHeight };
    }

    // CURRENT VERSION LABEL — full width
    doc.setFillColor(254, 242, 242);
    doc.rect(ML, cy, usableW, 7, "F");
    doc.setFillColor(224, 36, 36);
    doc.circle(ML + 3.5, cy + 3.5, 1.2, "F");
    doc.setTextColor(224, 36, 36);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text("CURRENT VERSION LABEL", ML + 7, cy + 4.8);
    cy += 7;

    if (masterImg) {
      const imgH = Math.min(MAX_IMG_H, usableW * (masterImg.height / masterImg.width));
      doc.addImage(masterImg.dataUrl, "JPEG", ML, cy, usableW, imgH);
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.25);
      doc.rect(ML, cy, usableW, imgH);
      cy += imgH;
    } else {
      doc.setFillColor(248, 248, 248);
      doc.rect(ML, cy, usableW, 18, "F");
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Label image not available", ML + usableW / 2, cy + 10, { align: "center" });
      cy += 18;
    }

    cy += 4; // gap between images

    // NEW VERSION LABEL — full width
    doc.setFillColor(239, 246, 255);
    doc.rect(ML, cy, usableW, 7, "F");
    doc.setFillColor(26, 86, 219);
    doc.circle(ML + 3.5, cy + 3.5, 1.2, "F");
    doc.setTextColor(26, 86, 219);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text("NEW VERSION LABEL", ML + 7, cy + 4.8);
    cy += 7;

    if (revisedImg) {
      const imgH = Math.min(MAX_IMG_H, usableW * (revisedImg.height / revisedImg.width));
      doc.addImage(revisedImg.dataUrl, "JPEG", ML, cy, usableW, imgH);
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.25);
      doc.rect(ML, cy, usableW, imgH);
      cy += imgH;
    } else {
      doc.setFillColor(248, 248, 248);
      doc.rect(ML, cy, usableW, 18, "F");
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Label image not available", ML + usableW / 2, cy + 10, { align: "center" });
      cy += 18;
    }

    // Findings table
    if (pair.findings.length === 0) continue;

    let findingsY = cy + 8;
    if (findingsY > H - 50) { doc.addPage(); findingsY = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text("FINDINGS", ML, findingsY);
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.3);
    doc.line(ML, findingsY + 2, W - ML, findingsY + 2);
    findingsY += 6;

    autoTable(doc, {
      startY: findingsY,
      margin: { left: ML, right: ML },
      head: [showStatus
        ? ["ID", "Category", "Description", "Master Had", "Revised Has", "Status"]
        : ["ID", "Category", "Description", "Master Had", "Revised Has"]
      ],
      body: pair.findings.map((f) => {
        const row = [
          f.id,
          CATEGORIES.find((c) => c.id === f.category)?.label ?? f.category,
          f.description,
          f.before,
          f.after,
        ];
        if (showStatus) {
          const cls = classifyFinding(f, lrfData!);
          row.push(cls === "expected" ? "EXPECTED" : cls === "unexpected" ? "UNEXPECTED" : "\u2014");
        }
        return row;
      }),
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: lightGray },
      columnStyles: showStatus
        ? { 0: { cellWidth: 12 }, 1: { cellWidth: 20 }, 2: { cellWidth: 54 }, 3: { cellWidth: 38 }, 4: { cellWidth: 34 }, 5: { cellWidth: 24, halign: "center" } }
        : { 0: { cellWidth: 12 }, 1: { cellWidth: 22 }, 2: { cellWidth: 54 }, 3: { cellWidth: 47 }, 4: { cellWidth: 47 } },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 0) {
          const cat   = pair.findings[data.row.index]?.category;
          const color = CATEGORIES.find((c) => c.id === cat)?.color ?? "#000";
          data.cell.styles.textColor = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
          data.cell.styles.fontStyle = "bold";
        }
        if (showStatus && data.section === "body" && data.column.index === 5) {
          const val = typeof data.cell.raw === "string" ? data.cell.raw : "";
          if (val === "EXPECTED")   { data.cell.styles.fillColor = [29, 158, 117]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold"; }
          if (val === "UNEXPECTED") { data.cell.styles.fillColor = [217, 119, 6];  data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold"; }
        }
      },
    });
  }

  // ── PAGE 2: SUMMARY TABLE (rendered last so pair page numbers are known) ──
  doc.setPage(SUMMARY_PAGE);
  const summaryContentY = drawBrandedHeader(); // same branded header as cover

  // "SUMMARY TABLE" section label
  doc.setFillColor(...navy);
  doc.rect(ML, summaryContentY, usableW, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("SUMMARY TABLE", ML + 4, summaryContentY + 6);

  // LRF Expected/Unexpected text descriptions (mirrors reference PDF style)
  const fmtExpected   = (i: number) => pairExpected[i]   > 0 ? "Updated"       : "Not updated";
  const fmtUnexpected = (i: number) => pairUnexpected[i] > 0 ? "Available"     : "Not available";

  const summaryHead = showStatus
    ? [["PROOFING ID", "CURRENT LABEL", "REVISED LABEL", "EXPECTED\nCHANGES", "UNEXPECTED\nCHANGES", "PROOFING\nSTATUS"]]
    : [["PROOFING ID", "CURRENT LABEL", "REVISED LABEL", "FINDINGS"]];

  const summaryBody = exportPairs.map((pair, i) =>
    showStatus
      ? [proofingIds[i], pair.masterName, pair.revisedName, fmtExpected(i), fmtUnexpected(i), pairStatuses[i] ?? "\u2014"]
      : [proofingIds[i], pair.masterName, pair.revisedName, String(pair.findings.length)],
  );

  autoTable(doc, {
    startY: summaryContentY + 9,
    margin: { left: ML, right: ML },
    head: summaryHead,
    body: summaryBody,
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, minCellHeight: 12 },
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: lightGray },
    columnStyles: showStatus
      ? { 0: { cellWidth: 26 }, 1: { cellWidth: 38 }, 2: { cellWidth: 38 }, 3: { cellWidth: 30, halign: "center" }, 4: { cellWidth: 30, halign: "center" }, 5: { cellWidth: 20, halign: "center" } }
      : { 0: { cellWidth: 34 }, 1: { cellWidth: 65 }, 2: { cellWidth: 65 }, 3: { cellWidth: 18, halign: "center" } },
    didParseCell(data) {
      // Proofing ID — styled as a blue link
      if (data.section === "body" && data.column.index === 0) {
        data.cell.styles.textColor = [26, 86, 219];
        data.cell.styles.fontStyle = "bold";
      }
      if (showStatus && data.section === "body" && data.column.index === 5) {
        const val = typeof data.cell.raw === "string" ? data.cell.raw : "";
        if (val === "PASS") { data.cell.styles.fillColor = [29, 158, 117]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold"; }
        if (val === "FAIL") { data.cell.styles.fillColor = [220, 38, 38];  data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold"; }
      }
    },
    didDrawCell(data) {
      // Internal PDF link: Proofing ID → its pair page
      if (data.section === "body" && data.column.index === 0) {
        const targetPage = pairPageNumbers[data.row.index];
        if (targetPage) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { pageNumber: targetPage });
      }
    },
  });

  const summaryEndY = (doc as any).lastAutoTable?.finalY ?? 80;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(130, 130, 130);
  doc.text(
    "Each Proofing ID is a clickable link \u2014 click to navigate to the respective label comparison page.",
    ML,
    summaryEndY + 7,
    { maxWidth: usableW },
  );

  // ── FOOTER on every page ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy);
    doc.rect(0, H - 10, W, 10, "F");
    doc.setTextColor(190, 205, 225);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`ProofX  \u00b7  Confidential  \u00b7  ${analystName || "\u2014"}`, ML, H - 4);
    doc.text(`Page ${i} of ${totalPages}`, W - ML, H - 4, { align: "right" });
  }

  doc.save(buildExportFilename(reportId, isLrfWorkflow));
}

// ─── Component (dormant — rename back to `export function ExportModal` to re-enable) ──────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _ExportModal({ pairs, activePair, mode, isLrfWorkflow, lrfData, masterCardRef, revisedCardRef, onClose }: Props) {
  const [analystName, setAnalystName] = useState(lrfData?.metadata.requestedBy ?? "");
  const [analystTouched, setAnalystTouched] = useState(false);
  const [reference, setReference] = useState("");
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const [findingStatus, setFindingStatus] = useState<FindingStatus>("all");
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analystInvalid = analystTouched && !analystName.trim();

  const basePairs = mode === "single" ? [activePair] : pairs;

  // Apply status filter to findings when in LRF workflow
  const exportPairs = isLrfWorkflow && findingStatus !== "all"
    ? basePairs.map((p) => ({
        ...p,
        findings: p.findings.filter((f) => classifyFinding(f, lrfData) === findingStatus),
      }))
    : basePairs;

  const totalFindings = exportPairs.reduce((sum, p) => sum + p.findings.length, 0);

  const timestamp = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleExport = async () => {
    setError(null);
    setExporting(true);
    try {
      if (format === "excel") {
        // exportExcel(exportPairs, analystName, reference, timestamp); // TODO: re-enable excel
      } else {
        await exportPDF(exportPairs, activePair, analystName, reference, timestamp, masterCardRef, revisedCardRef, lrfData, isLrfWorkflow);
      }
      setDone(true);
    } catch (err) {
      console.error("Export failed:", err);
      setError(err instanceof Error ? err.message : "Export failed — check console for details.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] flex items-center justify-center">
      <div className="bg-white shadow-2xl w-[540px] flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="bg-primary px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-white" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">ProofX</span>
            <span className="text-white/30 mx-1">|</span>
            <span className="text-sm font-semibold text-white">Export Comparison Report</span>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Session Metadata */}
          <section>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Session Metadata
            </div>
            <div className="bg-surface border border-border p-4 space-y-2.5 text-sm">
              {exportPairs.map((p, i) => (
                <div key={p.id} className="flex gap-3">
                  <span className="text-muted-foreground w-16 flex-shrink-0 text-xs pt-0.5">
                    {exportPairs.length > 1 ? `Pair ${i + 1}` : "Labels"}
                  </span>
                  <span className="text-foreground font-medium truncate">
                    {p.masterName}{" "}
                    <span className="text-muted-foreground font-normal">vs</span>{" "}
                    {p.revisedName}
                  </span>
                </div>
              ))}
              <div className="flex gap-3">
                <span className="text-muted-foreground w-16 flex-shrink-0 text-xs pt-0.5">Generated</span>
                <span className="text-foreground font-mono text-xs">{timestamp}</span>
              </div>
            </div>
          </section>

          {/* Analyst fields */}
          <section className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Requested By <span className="text-accent">*</span>
              </label>
              <input
                type="text"
                value={analystName}
                onChange={(e) => setAnalystName(e.target.value)}
                onBlur={() => setAnalystTouched(true)}
                placeholder="Enter analyst name"
                className={`w-full h-9 px-3 text-sm border bg-background focus:outline-none focus:ring-2 transition-colors ${
                  analystInvalid
                    ? "border-red-400 focus:ring-red-200 focus:border-red-400"
                    : "border-border focus:ring-primary/30 focus:border-primary"
                }`}
              />
              {analystInvalid && (
                <p className="text-xs text-red-500 mt-1 font-medium">Requested By is required</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Change Control Reference
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. CCR-2026-0042"
                className="w-full h-9 px-3 text-sm border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
          </section>

          {/* Findings summary */}
          <section>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Report Contents
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-1 border-2 border-primary bg-primary text-white p-3 text-center">
                <div className="text-2xl font-bold leading-none">{totalFindings}</div>
                <div className="text-[10px] uppercase tracking-wide text-white/70 mt-1">Total</div>
              </div>
              {CATEGORIES.map((cat) => {
                const count = exportPairs.reduce(
                  (sum, p) => sum + p.findings.filter((f) => f.category === cat.id).length,
                  0,
                );
                return (
                  <div
                    key={cat.id}
                    className="border p-3 text-center"
                    style={{ borderColor: `${cat.color}50`, backgroundColor: `${cat.color}08` }}
                  >
                    <div className="text-xl font-bold leading-none" style={{ color: cat.color }}>
                      {count}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                      {cat.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Finding Status filter — LRF workflow only */}
          {isLrfWorkflow && (
            <section>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Include Findings
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "all",        label: "All findings",      sub: "Expected + Unexpected", color: "#1C2E59" },
                  { value: "expected",   label: "Expected only",     sub: "Matches LRF changes",   color: "#1D9E75" },
                  { value: "unexpected", label: "Unexpected only",   sub: "Not in LRF",            color: "#D97706" },
                ] as { value: FindingStatus; label: string; sub: string; color: string }[]).map(({ value, label, sub, color }) => {
                  const active = findingStatus === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setFindingStatus(value)}
                      className="flex flex-col items-start p-3 border-2 text-left transition-all"
                      style={{
                        borderColor: active ? color : "#E5E7EB",
                        backgroundColor: active ? `${color}10` : "transparent",
                      }}
                    >
                      <span className="text-xs font-bold" style={{ color: active ? color : "#374151" }}>{label}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Format selector */}
          <section>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Export Format
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat("pdf")}
                className={`flex items-center gap-3 p-4 border-2 text-left transition-all ${
                  format === "pdf" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <FileText className={`h-8 w-8 flex-shrink-0 ${format === "pdf" ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <div className={`text-sm font-semibold ${format === "pdf" ? "text-primary" : "text-foreground"}`}>
                    PDF Report
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Cover page · findings table · audit trail
                  </div>
                </div>
              </button>
              <button
                onClick={() => setFormat("excel")}
                className={`flex items-center gap-3 p-4 border-2 text-left transition-all ${
                  format === "excel" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <FileSpreadsheet className={`h-8 w-8 flex-shrink-0 ${format === "excel" ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <div className={`text-sm font-semibold ${format === "excel" ? "text-primary" : "text-foreground"}`}>
                    Excel Spreadsheet
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Summary + findings · pivot-ready audit log
                  </div>
                </div>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed border-l-2 border-border pl-3">
              Includes session metadata, analyst sign-off, timestamps, bounding box coordinates,
              and per-finding change descriptions — ready for change control record.
            </p>
          </section>
        </div>

        {/* Footer */}
        {error && (
          <div className="mx-6 mb-0 mt-0 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}
        <div className="px-6 py-4 border-t border-border bg-surface flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>

          {done ? (
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#1D9E75" }}>
              <CheckCircle className="h-4 w-4" />
              File downloaded — check your downloads
            </div>
          ) : (
            <button
              onClick={() => { if (!analystName.trim()) { setAnalystTouched(true); return; } handleExport(); }}
              disabled={exporting || !analystName.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Export {format === "pdf" ? "PDF" : "Excel"} Report
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
