import { useState } from "react";
import { X, FileText, FileSpreadsheet, Download, ScanLine, CheckCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { CATEGORIES } from "@/constants";
import type { LabelPair, Finding } from "@/types/label";
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
  const lightGray = [248, 249, 250] as [number, number, number];
  const green     = [29, 158, 117]  as [number, number, number];
  const red       = [220, 38, 38]   as [number, number, number];
  const W         = 210;
  const H         = 297;
  const ML        = 12;
  const usableW   = W - ML * 2;

  // ── Report IDs ───────────────────────────────────────────────────────────
  const reportId = generateReportId();
  // proofingIds are computed after pair pages so IDs match actual PDF page numbers
  const showStatus  = !!(isLrfWorkflow && lrfData);

  // Pre-compute LRF verdicts per pair
  const pairStatuses   = exportPairs.map((pair) => {
    if (!showStatus) return null;
    return pair.findings.some((f) => classifyFinding(f, lrfData!) === "unexpected") ? "Fail" : "Pass";
  });
  const pairExpected   = exportPairs.map((pair) =>
    showStatus ? pair.findings.filter((f) => classifyFinding(f, lrfData!) === "expected").length : 0,
  );
  const pairUnexpected = exportPairs.map((pair) =>
    showStatus ? pair.findings.filter((f) => classifyFinding(f, lrfData!) === "unexpected").length : 0,
  );

  // ── Shared branded header layout constants ───────────────────────────────
  const CARD_TOP  = 12;                         // top white margin before the navy card (mm)
  const NAVY_H    = 27.5;                       // navy block height (mm) — matches grid height
  const GRID_TOP  = CARD_TOP + NAVY_H;          // grid sits directly below navy — no gap
  const GRID_H    = 23.0;                       // metadata grid height
  const AFTER_HDR = 66.6;                       // first y for content (≈66.6mm/188.8pt)

  // Column widths — 4 equal columns on the cover page metadata grid
  const mcW = [usableW / 4, usableW / 4, usableW / 4, usableW / 4] as const;

  // Draws the branded header block on whichever page is currently active.
  // Returns the y position where content should start below the grid.
  const drawBrandedHeader = () => {
    // Outer container border — encompasses navy card + grid
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.4);
    doc.rect(ML, CARD_TOP, usableW, NAVY_H + GRID_H);

    // Navy fill
    doc.setFillColor(...navy);
    doc.rect(ML, CARD_TOP, usableW, NAVY_H, "F");

    // PROOFX wordmark
    doc.setTextColor(160, 185, 215);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("P R O O F X", ML + 5.8, CARD_TOP + 8.9);

    // Title — single line
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(21);
    doc.setFont("helvetica", "bold");
    doc.text("Label Proofing Report", ML + 5.8, CARD_TOP + 16.5);

    // Subtitle — immediately below title
    doc.setFontSize(7.8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 185, 215);
    doc.text("AUDIT-READY  \u00b7  CHANGE CONTROL RECORD", ML + 5.8, CARD_TOP + 23.5);

    // Column dividers
    doc.setLineWidth(0.3);
    doc.setDrawColor(210, 215, 225);
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
      const maxW  = mcW[c] - 8;

      doc.setFontSize(6.6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 120, 155);
      const labelLines: string[] = doc.splitTextToSize(label, maxW);
      doc.text(labelLines, cellX, GRID_TOP + 7.5);

      const valueY = GRID_TOP + (labelLines.length > 1 ? 18.3 : 15.7);
      doc.setFontSize(8.8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...navy);
      doc.text(value, cellX, valueY, { maxWidth: maxW });

      cx += mcW[c];
    }

    // Redraw outer container border on top so it sits over grid content
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.4);
    doc.rect(ML, CARD_TOP, usableW, NAVY_H + GRID_H);

    return AFTER_HDR;
  };

  // ── PAGE 1: COVER ────────────────────────────────────────────────────────
  let y = drawBrandedHeader();

  // LRF: Change Summary on cover — numbered cards with FROM / TO panels
  if (showStatus) {
    const fileToDataUrl = (file: File): Promise<string> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
    };

    const getImageDimensions = (dataUrl: string): Promise<{ w: number; h: number }> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 1, h: 1 });
        img.src = dataUrl;
      });
    };

    const mapLrfAttrToLabel = (attrId: string): string => {
      const normalized = attrId.toLowerCase().trim();
      if (normalized === "branding_logo" || normalized === "logo_change") return "Branding logo change";
      if (normalized === "ec_rep_text" || normalized === "ec_rep" || normalized === "sym_authorized_rep" || normalized === "ecrep_name" || normalized === "ecrep_addr") return "EC REP to EU REP change";
      if (normalized === "patent_url") return "Patent URL change";
      if (normalized === "manufacturer_address" || normalized === "manufacturer_addr") return "Address change";
      const lookup = LRF_ATTRIBUTE_LOOKUP[attrId]?.label;
      if (lookup) return lookup;
      return attrId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    const definedChanges = Object.entries(lrfData!.changes).filter(([, cd]) => cd.changeType !== "");
    if (definedChanges.length > 0) {
      y += 8;

      // Section title — thin left accent bar + bold navy text
      doc.setFillColor(...navy);
      doc.rect(ML, y, 1.8, 6.5, "F");
      doc.setTextColor(...navy);
      doc.setFontSize(9.8);
      doc.setFont("helvetica", "bold");
      doc.text(
        `CHANGE SUMMARY \u2014 EXPECTED CHANGES (${definedChanges.length})`,
        ML + 4,
        y + 5.3,
      );
      y += 13.5;

      const hdrH   = 8;
      const panelW  = (usableW - 20) / 2;   // width of each FROM / TO panel
      const fromX   = ML + 3;
      const toX     = ML + usableW / 2 + 6;

      let changeNum = 1;
      for (const [attrId, cd] of definedChanges) {
        const fromVal = (cd.oldValue ?? "").trim();
        const toVal   = (cd.newValue ?? "").trim();

        const isBranding = attrId === "branding_logo" || attrId === "logo_change";
        const isEcRep = attrId === "ec_rep_text" || attrId === "ec_rep" || attrId === "sym_authorized_rep" || attrId === "ecrep_name" || attrId === "ecrep_addr";
        
        let contentH = 18;
        if (isBranding) {
          contentH = 21;
        } else if (isEcRep) {
          contentH = 19;
        } else {
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          const fromLines = fromVal ? doc.splitTextToSize(fromVal, panelW - 8) : [];
          const toLines   = toVal   ? doc.splitTextToSize(toVal,   panelW - 8) : [];
          const maxLines  = Math.max(fromLines.length, toLines.length, 1);
          contentH = Math.max(15, maxLines * 4.2 + 8);
        }
        
        const cardPad = 3;
        const cardH   = hdrH + contentH + cardPad;

        if (y + cardH > H - 18) { doc.addPage(); y = 20; }

        // Draw card outer rounded border
        doc.setDrawColor(218, 224, 233);
        doc.setLineWidth(0.3);
        doc.roundedRect(ML, y, usableW, cardH, 2, 2);

        // Draw card header background (rounded top corners, squared bottom)
        doc.setFillColor(243, 246, 250);
        doc.roundedRect(ML, y, usableW, hdrH, 2, 2, "F");
        doc.rect(ML, y + hdrH - 2, usableW, 2, "F"); // square the bottom

        // Draw header border dividing line
        doc.setDrawColor(218, 224, 233);
        doc.setLineWidth(0.25);
        doc.line(ML, y + hdrH, ML + usableW, y + hdrH);

        // Numbered circle
        doc.setFillColor(...navy);
        doc.circle(ML + 5.5, y + hdrH / 2, 2.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text(String(changeNum), ML + 5.5, y + hdrH / 2 + 0.9, { align: "center" });

        // Change label next to circle
        doc.setTextColor(...navy);
        doc.setFontSize(8.2);
        doc.setFont("helvetica", "bold");
        doc.text(mapLrfAttrToLabel(attrId), ML + 11, y + hdrH / 2 + 1.0);

        const contentTop = y + hdrH + 2;
        const panelH     = contentH - 2;

        // FROM panel border
        doc.setDrawColor(225, 229, 237);
        doc.setLineWidth(0.25);
        doc.roundedRect(fromX, contentTop, panelW, panelH, 1, 1);

        // FROM badge – light pink/red background, thin border, dark red text
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(248, 113, 113);
        doc.setLineWidth(0.2);
        doc.rect(fromX, contentTop, 12.5, 4.5, "FD");
        doc.setTextColor(220, 38, 38);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.text("FROM", fromX + 1.8, contentTop + 3.2);

        // TO panel border
        doc.setDrawColor(225, 229, 237);
        doc.setLineWidth(0.25);
        doc.roundedRect(toX, contentTop, panelW, panelH, 1, 1);

        // TO badge – light blue background, thin border, dark blue text
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(147, 197, 253);
        doc.setLineWidth(0.2);
        doc.rect(toX, contentTop, 10.5, 4.5, "FD");
        doc.setTextColor(26, 86, 219);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.text("TO", toX + 2.2, contentTop + 3.2);

        // Draw vector arrow in the middle
        const arrowX = ML + usableW / 2;
        const arrowY = contentTop + panelH / 2;
        doc.setLineWidth(0.35);
        doc.setDrawColor(120, 130, 150);
        doc.line(arrowX - 2.5, arrowY, arrowX + 2.5, arrowY);
        doc.line(arrowX + 1.2, arrowY - 1.5, arrowX + 2.5, arrowY);
        doc.line(arrowX + 1.2, arrowY + 1.5, arrowX + 2.5, arrowY);

        // Content rendering (images vs text)
        if (isBranding || isEcRep) {
          let imgFrom = "";
          let imgTo   = "";

          if (cd.oldFile) {
            imgFrom = await fileToDataUrl(cd.oldFile);
          }
          if (cd.newFile) {
            imgTo = await fileToDataUrl(cd.newFile);
          }

          if (!imgFrom) {
            imgFrom = "";
          }
          if (!imgTo) {
            imgTo = "";
          }

          let aspectFrom = isBranding ? (779 / 196) : (640 / 224);
          let aspectTo   = isBranding ? (387 / 102) : (640 / 224);

          if (cd.oldFile && imgFrom) {
            const dims = await getImageDimensions(imgFrom);
            aspectFrom = dims.w / dims.h;
          }
          if (cd.newFile && imgTo) {
            const dims = await getImageDimensions(imgTo);
            aspectTo = dims.w / dims.h;
          }

          const areaX = fromX + 3;
          const areaY = contentTop + 6;
          const areaW = panelW - 6;
          const areaH = panelH - 8;

          // Center From Image
          let drawW = areaW;
          let drawH = drawW / aspectFrom;
          if (drawH > areaH) {
            drawH = areaH;
            drawW = drawH * aspectFrom;
          }
          let dx = areaX + (areaW - drawW) / 2;
          let dy = areaY + (areaH - drawH) / 2;
          doc.addImage(imgFrom, "PNG", dx, dy, drawW, drawH);

          // Center To Image
          const areaToX = toX + 3;
          let drawWTo = areaW;
          let drawHTo = drawWTo / aspectTo;
          if (drawHTo > areaH) {
            drawHTo = areaH;
            drawWTo = drawHTo * aspectTo;
          }
          let dxTo = areaToX + (areaW - drawWTo) / 2;
          let dyTo = areaY + (areaH - drawHTo) / 2;
          doc.addImage(imgTo, "PNG", dxTo, dyTo, drawWTo, drawHTo);
        } else {
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 60);

          const fromLines = fromVal ? doc.splitTextToSize(fromVal, panelW - 8) : [];
          const toLines   = toVal   ? doc.splitTextToSize(toVal,   panelW - 8) : [];

          const textYFrom = contentTop + 7 + (panelH - 7 - fromLines.length * 4.2) / 2;
          const textYTo   = contentTop + 7 + (panelH - 7 - toLines.length * 4.2) / 2;

          if (fromLines.length > 0) {
            doc.text(fromLines, fromX + 4, textYFrom, { align: "left" });
          }
          if (toLines.length > 0) {
            doc.text(toLines, toX + 4, textYTo, { align: "left" });
          }
        }

        y += cardH + 4;
        changeNum++;
      }
    }
  }

  // ── PAGE 2: Summary placeholder ─────────────────────────────────────────
  const SUMMARY_PAGE = 2;
  doc.addPage();

  // ── PER-PAIR PAGES (3+) ──────────────────────────────────────────────────
  const isPdf = (name: string) => name.toLowerCase().endsWith(".pdf");
  type ImgData = { dataUrl: string; width: number; height: number };
  const pairPageNumbers: number[] = [];

  for (let pIdx = 0; pIdx < exportPairs.length; pIdx++) {
    doc.addPage();
    const pairPage = doc.getNumberOfPages();
    pairPageNumbers.push(pairPage);

    const pair       = exportPairs[pIdx];
    const proofingId = `${reportId}_${pairPage}`;
    const status     = pairStatuses[pIdx];

    // Navy Header Bar
    doc.setFillColor(...navy);
    doc.rect(ML, 13.0, usableW, 12.5, "F");

    // Left text
    doc.setTextColor(160, 185, 215);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("LABEL VISUAL COMPARISON  \u00b7  PROOFING ID", ML + 4, 13.0 + 5.5);

    // Large proofing ID
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(proofingId, ML + 4, 13.0 + 11.0);

    // Status Badge (LRF only)
    if (showStatus && status) {
      const badgeX = 103.1;
      const badgeY = 16.7;
      const badgeW = 18.4;
      const badgeH = 5.3;
      const badgeBg = (status === "Pass" ? [158, 217, 159] : [242, 191, 163]) as [number, number, number];
      const badgeTx = (status === "Pass" ? [27, 94, 32] : [183, 28, 28]) as [number, number, number];
      
      doc.setFillColor(...badgeBg);
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, "F");
      
      doc.setTextColor(...badgeTx);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text(status, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1.25, { align: "center" });
    }

    // Back to Summary Table Button
    const backW = 44;
    const backX = 194 - backW; // 150: perfectly symmetric 4mm inset from right margin
    const backY = 17.2;
    const backH = 5.5;
    
    doc.setFillColor(238, 241, 246);
    doc.roundedRect(backX, backY, backW, backH, 1.5, 1.5, "F");
    
    doc.setTextColor(...navy);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("\u2190 Back to Summary Table", backX + backW / 2, backY + backH / 2 + 1.15, { align: "center" });
    
    doc.link(backX, backY, backW, backH, { pageNumber: SUMMARY_PAGE });

    // CURRENT / REVISED names row (just below the navy header)
    const cyBaseline = 31.4;
    const labelW = usableW / 2;

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(95, 99, 104);
    doc.text("CURRENT", ML, cyBaseline);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(pair.masterName, ML + 15, cyBaseline, { maxWidth: labelW - 17 });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(95, 99, 104);
    doc.text("REVISED", ML + labelW, cyBaseline);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(pair.revisedName, ML + labelW + 15, cyBaseline, { maxWidth: labelW - 17 });

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

    const sectionHdrH = 6.4;
    const SECT_R = 2;
    const H_box = 103.2;

    // ─── PANE 1: CURRENT VERSION ──────────────────────────────────────────
    const masterSectionY = 34.6;
    
    doc.setFillColor(253, 235, 235);
    doc.roundedRect(ML, masterSectionY, usableW, sectionHdrH, SECT_R, SECT_R, "F");
    doc.setFillColor(253, 235, 235);
    doc.rect(ML, masterSectionY + sectionHdrH - SECT_R, usableW, SECT_R, "F");
    
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.25);
    doc.line(ML, masterSectionY + sectionHdrH, ML + usableW, masterSectionY + sectionHdrH);
    
    doc.setFillColor(...red);
    doc.circle(ML + 4.5, masterSectionY + sectionHdrH / 2, 1, "F");
    
    doc.setTextColor(...red);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(`CURRENT VERSION LABEL  \u00b7  ${pair.masterName}`, ML + 8.5, masterSectionY + sectionHdrH / 2 + 1.25, { maxWidth: usableW - 12 });

    const masterImgYStart = masterSectionY + sectionHdrH;
    if (masterImg) {
      const imgAspect = masterImg.width / masterImg.height;
      const boxAspect = usableW / H_box;
      let imgW = usableW;
      let imgH = H_box;
      if (imgAspect > boxAspect) {
        imgW = usableW;
        imgH = usableW / imgAspect;
      } else {
        imgH = H_box;
        imgW = H_box * imgAspect;
      }
      const imgX = ML + (usableW - imgW) / 2;
      const imgY = masterImgYStart + (H_box - imgH) / 2;
      doc.addImage(masterImg.dataUrl, "JPEG", imgX, imgY, imgW, imgH);
    } else {
      doc.setFillColor(248, 248, 248);
      doc.rect(ML, masterImgYStart, usableW, H_box, "F");
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Label image not available", ML + usableW / 2, masterImgYStart + H_box / 2, { align: "center" });
    }
    
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, masterSectionY, usableW, sectionHdrH + H_box, SECT_R, SECT_R);


    // ─── PANE 2: REVISED VERSION ──────────────────────────────────────────
    const revisedSectionY = 147.4;
    
    doc.setFillColor(234, 241, 251);
    doc.roundedRect(ML, revisedSectionY, usableW, sectionHdrH, SECT_R, SECT_R, "F");
    doc.setFillColor(234, 241, 251);
    doc.rect(ML, revisedSectionY + sectionHdrH - SECT_R, usableW, SECT_R, "F");
    
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.25);
    doc.line(ML, revisedSectionY + sectionHdrH, ML + usableW, revisedSectionY + sectionHdrH);
    
    doc.setFillColor(...navy);
    doc.circle(ML + 4.5, revisedSectionY + sectionHdrH / 2, 1, "F");
    
    doc.setTextColor(...navy);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(`NEW VERSION LABEL  \u00b7  ${pair.revisedName}`, ML + 8.5, revisedSectionY + sectionHdrH / 2 + 1.25, { maxWidth: usableW - 12 });

    const revisedImgYStart = revisedSectionY + sectionHdrH;
    if (revisedImg) {
      const imgAspect = revisedImg.width / revisedImg.height;
      const boxAspect = usableW / H_box;
      let imgW = usableW;
      let imgH = H_box;
      if (imgAspect > boxAspect) {
        imgW = usableW;
        imgH = usableW / imgAspect;
      } else {
        imgH = H_box;
        imgW = H_box * imgAspect;
      }
      const imgX = ML + (usableW - imgW) / 2;
      const imgY = revisedImgYStart + (H_box - imgH) / 2;
      doc.addImage(revisedImg.dataUrl, "JPEG", imgX, imgY, imgW, imgH);
    } else {
      doc.setFillColor(248, 248, 248);
      doc.rect(ML, revisedImgYStart, usableW, H_box, "F");
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Label image not available", ML + usableW / 2, revisedImgYStart + H_box / 2, { align: "center" });
    }
    
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, revisedSectionY, usableW, sectionHdrH + H_box, SECT_R, SECT_R);

    // If Direct Comparison (not LRF) and has findings: draw findings table on a new page
    if (!isLrfWorkflow && pair.findings.length > 0) {
      doc.addPage();
      const findingsStartY = 20;

      // Draw left accent bar + bold navy text "FINDINGS"
      doc.setFillColor(...navy);
      doc.rect(ML, findingsStartY, 1.8, 6.5, "F");
      doc.setTextColor(...navy);
      doc.setFontSize(9.8);
      doc.setFont("helvetica", "bold");
      doc.text("FINDINGS", ML + 4, findingsStartY + 5.3);

      const tableHead = [["ID", "Category", "Description", "Master Had", "Revised Has"]];
      const tableBody = pair.findings.map((finding, fIdx) => [
        `F${String(pIdx + 1).padStart(3, "0")}-${String(fIdx + 1).padStart(2, "0")}`,
        CATEGORIES.find((c) => c.id === finding.category)?.label ?? finding.category,
        finding.description,
        finding.before,
        finding.after,
      ]);

      autoTable(doc, {
        startY: findingsStartY + 12,
        margin: { left: ML, right: ML },
        head: tableHead,
        body: tableBody,
        headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 } },
        bodyStyles: { fontSize: 8, textColor: [30, 30, 30], cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 } },
        alternateRowStyles: { fillColor: lightGray },
        columnStyles: {
          0: { cellWidth: 18, cellPadding: { left: 1.5, right: 1.5, top: 3.5, bottom: 3.5 } },
          1: { cellWidth: 18, cellPadding: { left: 1.5, right: 1.5, top: 3.5, bottom: 3.5 } },
          2: { cellWidth: 60 },
          3: { cellWidth: 45 },
          4: { cellWidth: 45 }
        },
        didParseCell(data) {
          if (data.section === "body" && data.column.index === 0) {
            const f = pair.findings[data.row.index];
            if (f) {
              const cat = f.category;
              const color = CATEGORIES.find((c) => c.id === cat)?.color ?? "#000";
              data.cell.styles.textColor = [
                parseInt(color.slice(1, 3), 16),
                parseInt(color.slice(3, 5), 16),
                parseInt(color.slice(5, 7), 16)
              ];
              data.cell.styles.fontStyle = "bold";
            }
          }
        }
      });
    }

    // End of per-pair page loop
  }

  // ── SUMMARY TABLE (rendered last so pair page numbers are known) ──
  doc.setPage(SUMMARY_PAGE);
  const summaryContentY = drawBrandedHeader(); // same branded header as cover

  // "SUMMARY TABLE" section label
  doc.setFillColor(...navy);
  doc.rect(ML, summaryContentY + 8, 1.8, 6.5, "F");
  doc.setTextColor(...navy);
  doc.setFontSize(9.8);
  doc.setFont("helvetica", "bold");
  doc.text("SUMMARY TABLE", ML + 4, summaryContentY + 8 + 5.3);

  const fmtExpected   = (i: number) => pairExpected[i]   > 0 ? "Updated"       : "Not updated";
  const fmtUnexpected = (i: number) => pairUnexpected[i] > 0 ? "Available"     : "Not available";

  const summaryHead = showStatus
    ? [["PROOFING ID", "CURRENT LABEL", "REVISED LABEL", "EXPECTED\nCHANGES", "UNEXPECTED\nCHANGES", "PROOFING\nSTATUS"]]
    : [["PROOFING ID", "CURRENT LABEL", "REVISED LABEL", "FINDINGS"]];

  const summaryBody = exportPairs.map((pair, i) =>
    showStatus
      ? [`${reportId}_${pairPageNumbers[i]}`, pair.masterName, pair.revisedName, fmtExpected(i), fmtUnexpected(i), pairStatuses[i] ?? "\u2014"]
      : [`${reportId}_${pairPageNumbers[i]}`, pair.masterName, pair.revisedName, String(pair.findings.length)],
  );

  autoTable(doc, {
    startY: summaryContentY + 20,
    margin: { left: ML, right: ML },
    head: summaryHead,
    body: summaryBody,
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, minCellHeight: 12 },
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: lightGray },
    columnStyles: showStatus
      ? {
          0: { cellWidth: 26 },
          1: { cellWidth: 39 },
          2: { cellWidth: 39 },
          3: { cellWidth: 31, halign: "center" },
          4: { cellWidth: 31, halign: "center" },
          5: { cellWidth: 20, halign: "center" }
        }
      : {
          0: { cellWidth: 34 },
          1: { cellWidth: 67 },
          2: { cellWidth: 67 },
          3: { cellWidth: 18, halign: "center" }
        },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 0) {
        data.cell.styles.textColor = [26, 86, 219];
        data.cell.styles.fontStyle = "bold";
      }
      if (showStatus && data.section === "body" && data.column.index === 5) {
        const val = typeof data.cell.raw === "string" ? data.cell.raw : "";
        if (val === "Pass") { data.cell.styles.fillColor = [29, 158, 117]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold"; }
        if (val === "Fail") { data.cell.styles.fillColor = [220, 38, 38];  data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = "bold"; }
      }
    },
    didDrawCell(data) {
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
    "Each Proofing Id is a clickable link \u2014 selecting one opens that label pair's comparison page.",
    ML,
    summaryEndY + 7,
    { maxWidth: usableW },
  );

  // ── FOOTER on every page ──────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setTextColor(130, 130, 130);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("ProofX  \u00b7  Confidential", ML, H - 6);
    doc.text(`Page ${i} of ${totalPages}`, W - ML, H - 6, { align: "right" });
  }

  try {
    (window as any).__LAST_PDF_BASE64__ = doc.output("datauristring");
  } catch (e) {
    console.error("Failed to extract datauristring", e);
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
