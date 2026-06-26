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
      const ctx = canvas.getContext("2d")!;
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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const navy = [28, 46, 89] as [number, number, number];
  const orange = [240, 121, 34] as [number, number, number];
  const lightGray = [245, 246, 248] as [number, number, number];
  const W = 210;

  // ── Page 1: Header + Metadata ─────────────────────────────────────────────

  // Header bar
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("PROOFX", 14, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Label Comparison Report", 14, 16);
  doc.setTextColor(...orange);
  doc.setFontSize(8);
  doc.text("AUDIT-READY  ·  CHANGE CONTROL RECORD", W - 14, 13, { align: "right" });

  // Metadata block
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SESSION METADATA", 14, 32);
  doc.setDrawColor(28, 46, 89);
  doc.setLineWidth(0.4);
  doc.line(14, 34, W - 14, 34);

  const metaItems: [string, string][] = [
    ["Generated", timestamp],
    ["Requested By", analystName],
    ["Change Control Ref", reference || "—"],
    ["Label Pairs", String(exportPairs.length)],
    ["Total Findings", String(exportPairs.reduce((n, p) => n + p.findings.length, 0))],
  ];
  let y = 40;
  for (const [label, value] of metaItems) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(value, 70, y);
    y += 6;
  }

  // Label pairs list
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text("LABEL PAIRS", 14, y);
  doc.line(14, y + 2, W - 14, y + 2);
  y += 8;

  for (const pair of exportPairs) {
    doc.setFillColor(...lightGray);
    doc.rect(14, y - 4, W - 28, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(28, 46, 89);
    doc.text(pair.masterName, 16, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("vs", 16 + doc.getTextWidth(pair.masterName) + 2, y);
    doc.setTextColor(30, 30, 30);
    doc.text(pair.revisedName, 16 + doc.getTextWidth(pair.masterName) + 8, y);
    doc.setTextColor(100, 100, 100);
    doc.text(`${pair.findings.length} finding${pair.findings.length !== 1 ? "s" : ""}`, W - 16, y, { align: "right" });
    y += 10;
  }

  // ── LRF Required Changes (LRF workflow only) ─────────────────────────────
  if (isLrfWorkflow && lrfData) {
    const definedChanges = Object.entries(lrfData.changes).filter(
      ([, cd]) => cd.changeType !== "",
    );
    if (definedChanges.length > 0) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text("LRF REQUIRED CHANGES", 14, y);
      doc.setDrawColor(28, 46, 89);
      doc.setLineWidth(0.4);
      doc.line(14, y + 2, W - 14, y + 2);
      y += 8;

      // Table header
      doc.setFillColor(28, 46, 89);
      doc.rect(14, y - 4, W - 28, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("ATTRIBUTE", 16, y);
      doc.text("CHANGE TYPE", 90, y);
      doc.text("OLD -> NEW VALUE", 135, y);
      y += 5;

      for (let i = 0; i < definedChanges.length; i++) {
        const [attrId, cd] = definedChanges[i];
        const info = LRF_ATTRIBUTE_LOOKUP[attrId];
        const label = info?.label ?? attrId;
        if (i % 2 === 0) {
          doc.setFillColor(...lightGray);
          doc.rect(14, y - 4, W - 28, 7, "F");
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);
        doc.text(label, 16, y, { maxWidth: 70 });
        doc.setTextColor(100, 100, 100);
        doc.text(cd.changeType, 90, y);
        doc.setTextColor(30, 30, 30);
        const valueText = cd.oldValue && cd.newValue
          ? `${cd.oldValue} -> ${cd.newValue}`
          : cd.newValue || cd.oldValue || "—";
        doc.text(valueText, 135, y, { maxWidth: W - 135 - 16 });
        y += 7;
      }
    }
  }

  // ── Per-pair: visual comparison + findings ───────────────────────────────

  const isPdf = (name: string) => name.toLowerCase().endsWith(".pdf");
  type ImgData = { dataUrl: string; width: number; height: number };

  const usableW = W - 28;
  const panelW = (usableW - 6) / 2;
  const labelHeaderH = 8;
  const vizStartY = 22;

  for (let pIdx = 0; pIdx < exportPairs.length; pIdx++) {
    const pair = exportPairs[pIdx];

    // ── Visual comparison page for this pair ────────────────────────────
    doc.addPage();

    doc.setFillColor(...navy);
    doc.rect(0, 0, W, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const vizTitle = exportPairs.length > 1
      ? `LABEL VISUAL COMPARISON — ${pair.masterName} vs ${pair.revisedName}`
      : "LABEL VISUAL COMPARISON";
    doc.text(vizTitle, 14, 11, { maxWidth: W - 28 });

    // Resolve images — URL first, DOM capture fallback for active pair only
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

    let contentEndY = vizStartY;

    if (masterImg && revisedImg) {
      try {
        const maxImgH = 185;
        const panelImgH = Math.min(maxImgH, panelW * (masterImg.height / masterImg.width));

        // Master panel
        const mX = 14;
        doc.setFillColor(254, 242, 242);
        doc.rect(mX, vizStartY, panelW, labelHeaderH, "F");
        doc.setDrawColor(224, 36, 36);
        doc.setLineWidth(0.4);
        doc.line(mX, vizStartY + labelHeaderH, mX + panelW, vizStartY + labelHeaderH);
        doc.setFillColor(224, 36, 36);
        doc.circle(mX + 3, vizStartY + labelHeaderH / 2, 1.2, "F");
        doc.setTextColor(224, 36, 36);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text("CURRENT VERSION LABEL", mX + 6, vizStartY + 5.2);
        doc.addImage(masterImg.dataUrl, "JPEG", mX, vizStartY + labelHeaderH, panelW, panelImgH);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(mX, vizStartY + labelHeaderH, panelW, panelImgH);

        // Revised panel
        const rX = 14 + panelW + 6;
        doc.setFillColor(239, 246, 255);
        doc.rect(rX, vizStartY, panelW, labelHeaderH, "F");
        doc.setDrawColor(26, 86, 219);
        doc.setLineWidth(0.4);
        doc.line(rX, vizStartY + labelHeaderH, rX + panelW, vizStartY + labelHeaderH);
        doc.setFillColor(26, 86, 219);
        doc.circle(rX + 3, vizStartY + labelHeaderH / 2, 1.2, "F");
        doc.setTextColor(26, 86, 219);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text("NEW VERSION LABEL", rX + 6, vizStartY + 5.2);
        doc.addImage(revisedImg.dataUrl, "JPEG", rX, vizStartY + labelHeaderH, panelW, panelImgH);
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(rX, vizStartY + labelHeaderH, panelW, panelImgH);

        contentEndY = vizStartY + labelHeaderH + panelImgH + 4;
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        const legendText = pair.masterUrl
          ? "Label images as uploaded. See findings table for detailed change annotations."
          : "Annotations shown at the zoom level active during export.";
        doc.text(legendText, 14, contentEndY + 3, { maxWidth: usableW });
        contentEndY += 8;
      } catch {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.text("Label visual capture unavailable for this export.", 14, vizStartY + 10);
        contentEndY = vizStartY + 16;
      }
    } else {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("No label images were available at the time of export.", 14, vizStartY + 10);
      contentEndY = vizStartY + 16;
    }

    // ── Findings for this pair ───────────────────────────────────────────
    if (pair.findings.length === 0) continue;

    // Start findings on same page if enough room, otherwise new page
    let findingsY = contentEndY + 8;
    if (findingsY > 210) {
      doc.addPage();
      findingsY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`FINDINGS — ${pair.masterName} vs ${pair.revisedName}`, 14, findingsY);
    doc.setDrawColor(28, 46, 89);
    doc.setLineWidth(0.4);
    doc.line(14, findingsY + 2, W - 14, findingsY + 2);
    findingsY += 6;

    const showStatus = !!(isLrfWorkflow && lrfData);
    const statusCol = 5; // index of STATUS column when present

    autoTable(doc, {
      startY: findingsY,
      margin: { left: 14, right: 14 },
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
          const cls = classifyFinding(f, lrfData);
          row.push(cls === "expected" ? "EXPECTED" : cls === "unexpected" ? "UNEXPECTED" : "—");
        }
        return row;
      }),
      headStyles: {
        fillColor: navy,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: lightGray },
      columnStyles: showStatus
        ? {
            0: { cellWidth: 12 },
            1: { cellWidth: 20 },
            2: { cellWidth: 44 },
            3: { cellWidth: 34 },
            4: { cellWidth: 34 },
            5: { cellWidth: 28, halign: "center" },
          }
        : {
            0: { cellWidth: 12 },
            1: { cellWidth: 22 },
            2: { cellWidth: 52 },
            3: { cellWidth: 40 },
            4: { cellWidth: 40 },
          },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 0) {
          const cat = pair.findings[data.row.index]?.category;
          const color = CATEGORIES.find((c) => c.id === cat)?.color ?? "#000";
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          data.cell.styles.textColor = [r, g, b];
          data.cell.styles.fontStyle = "bold";
        }
        // Status badge colouring
        if (showStatus && data.section === "body" && data.column.index === statusCol) {
          const val = data.cell.raw as string;
          if (val === "EXPECTED") {
            data.cell.styles.fillColor = [29, 158, 117];   // green
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          } else if (val === "UNEXPECTED") {
            data.cell.styles.fillColor = [217, 119, 6];    // amber
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  }

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy);
    doc.rect(0, 287, W, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`ProofX · Confidential · ${analystName}`, 14, 293);
    doc.text(`Page ${i} of ${totalPages}`, W - 14, 293, { align: "right" });
  }

  doc.save(buildExportFilename(isLrfWorkflow));
}

// ─── Export filename — daily-resetting counter ────────────────────────────────

function buildExportFilename(isLrfWorkflow?: boolean): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;

  // Read stored counter; reset if date has changed
  let count = 1;
  try {
    const raw = localStorage.getItem("proofx_export_count");
    if (raw) {
      const { date, n } = JSON.parse(raw) as { date: string; n: number };
      count = date === dateStr ? n + 1 : 1;
    }
  } catch { /* ignore */ }
  localStorage.setItem("proofx_export_count", JSON.stringify({ date: dateStr, n: count }));

  const seq = String(count).padStart(4, "0");
  return isLrfWorkflow
    ? `ProofX_${dateStr}_${seq}.pdf`
    : `ProofX_Report_${dateStr}_${seq}.pdf`;
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
