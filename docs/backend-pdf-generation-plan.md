# Backend PDF Generation Plan — ProofX Bulk Export

## Overview

Move bulk report PDF generation from the browser (jsPDF) to the backend server.
The frontend only triggers the build, polls for status, and downloads the file.

The driver for this change is scale: at 50+ label pairs, sending 100+ images as
base64 to the browser and rendering them synchronously with jsPDF freezes the UI
and produces payloads that can exceed 100 MB. Generating the PDF server-side avoids
both problems entirely.

---

## New Flow (End-to-End)

  Step 1  User clicks Export Report
          └─> POST /api/bulk-export/{job_id}
              Body: analyst name, CR number, LRF changes, change images (multipart)
              Returns: { export_id, status: "building" }

  Step 2  Frontend polls every 2 seconds
          └─> GET /api/bulk-export/{job_id}/status
              Returns: { status: "building" | "ready" | "failed" }

  Step 3  Status is "ready"
          └─> GET /api/bulk-export/{job_id}/download
              Returns: PDF file stream (application/pdf, Content-Disposition: attachment)

---

## Backend Changes

### 1. Three New Endpoints

  POST /api/bulk-export/{job_id}
  - Accepts LRF metadata (analyst name, CR number, change definitions) as JSON
  - Accepts change images (logo, EC REP reference images) as multipart file uploads
  - Queues a background PDF build task
  - Persists LRF metadata alongside the job in the database
  - Generates and stores the reportId (removes reliance on browser localStorage)
  - Returns: { export_id, status: "building" }

  GET /api/bulk-export/{job_id}/status
  - Returns current build status: "building", "ready", or "failed"
  - Same polling pattern already used for /api/bulk-status/{job_id}

  GET /api/bulk-export/{job_id}/download
  - Streams the completed PDF to the browser
  - Returns HTTP 202 if the build is not yet ready
  - Sets Content-Disposition: attachment; filename="ProofX_{reportId}.pdf"

### 2. PDF Build Task (Background Worker)

  The worker runs these steps in order:

  a. Load all pair results from the database
     - Findings (id, type, bbox, before/after values, confidence)
     - Pair names (base_name, revised_name)
     - Alignment status (flagged or OK)

  b. Fetch stored images for every pair
     - Base image and revised image (already stored from the bulk comparison run)
     - No need to re-render or re-fetch from the client

  c. Classify findings using stored LRF metadata
     - Replicate the classifyFinding logic currently in src/utils/lrfClassify.ts
     - Compute expected count, unexpected count, and Pass/Fail status per pair

  d. Generate the PDF using ReportLab (Python)
     - Reproduce the same layout as the current jsPDF template:
         Page 1    Cover — branded header, metadata grid, LRF change summary cards
         Page 2    Summary table (with clickable Proofing IDs)
         Page 3+   Per-pair pages — master image, revised image, status badge
         Extra     Findings table pages (non-LRF workflow only)
     - All coordinate logic maps 1:1 from mm (jsPDF) to points (ReportLab)

  e. Store the finished PDF
     - Temporary file storage or object storage (e.g. S3 / local disk)
     - Linked to the export record in the database

  f. Mark the export record as "ready" in the database

### 3. Data Gap — LRF Metadata

  LRF metadata currently never reaches the backend. It lives only in browser state.

  Required fields to add to the POST /api/bulk-export body:

    analyst_name      string
    cr_number         string
    lrf_changes[]
      attrId          string       (e.g. "branding_logo", "ec_rep_text")
      changeType      string       (Add / Modify / Remove)
      oldValue        string
      newValue        string
      oldFile         file upload  (image attributes only)
      newFile         file upload  (image attributes only)

---

## Frontend Changes

### ExportModal.tsx

  Remove entirely:
    - jsPDF and jspdf-autotable (PDF rendering)
    - html2canvas (DOM capture)
    - pdfjs-dist (PDF-to-image rendering)
    - exportPDF() function
    - loadImageFromUrl(), renderPdfPageToDataUrl(), captureCardToDataUrl()
    - generateReportId()
    - classifyFinding() calls

  Keep:
    - ReportPayload type definitions (serve as the API contract documentation)

### ResultsPage.tsx

  The Export Report button handler changes from:

    [Current]
    await exportPDF(pairs, activePair, analystName, ..., masterCardRef, revisedCardRef, lrfData)

  To:

    [New]
    1. POST /api/bulk-export/{jobId}  — send LRF metadata + change images
    2. Poll GET /api/bulk-export/{jobId}/status every 2s
       - Show "Generating PDF..." state while building
    3. On "ready" — trigger file download via GET /api/bulk-export/{jobId}/download
    4. On "failed" — show error message

  The jobId is already available in ResultsPage state from the bulk analysis flow.

---

## What the Backend Already Has vs. What Is Missing

  Data                              Already Stored    Needs Adding
  --------------------------------  ----------------  ---------------------------
  Findings per pair                 Yes               —
  Master + revised images           Yes               —
  Pair names, alignment status      Yes               —
  Finding classification results    Partial *         Extend to bulk mode
  LRF metadata                      No                Send with export trigger
  LRF change images (logo etc.)     No                Send as multipart upload
  Report ID                         No                Generate server-side

  * Finding classification exists for single-mode runs via reconciliation.
    It needs to be replicated for bulk mode using the stored LRF metadata.

---

## Package Removals from Frontend

  Once the backend endpoint is live, these packages can be removed from
  package.json and the bundle:

    jspdf
    jspdf-autotable
    html2canvas
    pdfjs-dist

  This reduces the frontend bundle size significantly.

---

## Implementation Order

  1. Extend POST /api/bulk-compare to accept and persist LRF metadata
     (prerequisite — without this, the backend cannot generate the cover page)

  2. Build the ReportLab PDF template matching the current jsPDF layout

  3. Build the background PDF build task (worker/celery task or equivalent)

  4. Add the three new endpoints (POST trigger, GET status, GET download)

  5. Update ResultsPage.tsx to use the new trigger-poll-download flow

  6. Remove jsPDF and related packages from the frontend

---

## Key Principle

  The frontend is responsible for:   triggering, polling, downloading
  The backend is responsible for:    data assembly, classification, rendering, storage
