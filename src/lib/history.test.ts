/**
 * Unit tests for getHistory and exportHistoryCSV (src/lib/api.ts).
 *
 * Runs in the vitest node environment — no DOM, no real HTTP.
 * fetch is replaced with a vi.fn() stub per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── helpers ────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}): void {
  const headersMap = new Map(Object.entries(headers));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: () => Promise.resolve(body),
      blob: () => Promise.resolve(new Blob([JSON.stringify(body)])),
      headers: {
        get: (key: string) => headersMap.get(key.toLowerCase()) ?? null,
      },
    }),
  );
}

function mockFetchError(message: string): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(message)));
}

// Token stub — getToken() reads from sessionStorage, which doesn't exist in node.
// We set the module-level TOKEN_KEY directly by stubbing sessionStorage.
const FAKE_TOKEN = "test-jwt-token";

beforeEach(() => {
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => (key === "proofx_token" ? FAKE_TOKEN : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getHistory ──────────────────────────────────────────────────────────────

describe("getHistory", () => {
  it("fetches /api/history and returns runs + count", async () => {
    const payload = {
      runs: [
        {
          run_id: "abc123",
          created_at: "2026-06-30T10:00:00",
          base_name: "master.pdf",
          revised_name: "revised.pdf",
          mode: "single",
          pair_count: 1,
          findings_count: 5,
          workflow: null,
          status: "pass",
        },
      ],
      count: 1,
    };
    mockFetch(200, payload);

    const { getHistory } = await import("./api");
    const result = await getHistory();

    expect(result.count).toBe(1);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].run_id).toBe("abc123");
    expect(result.runs[0].status).toBe("pass");
  });

  it("includes Authorization header with stored token", async () => {
    mockFetch(200, { runs: [], count: 0 });
    const { getHistory } = await import("./api");
    await getHistory();

    const fetchMock = vi.mocked(globalThis.fetch);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("passes skip and limit as query params", async () => {
    mockFetch(200, { runs: [], count: 0 });
    const { getHistory } = await import("./api");
    await getHistory({ skip: 10, limit: 25 });

    const fetchMock = vi.mocked(globalThis.fetch);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("skip=10");
    expect(url).toContain("limit=25");
  });

  it("omits skip/limit params when not provided", async () => {
    mockFetch(200, { runs: [], count: 0 });
    const { getHistory } = await import("./api");
    await getHistory();

    const fetchMock = vi.mocked(globalThis.fetch);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain("skip=");
    expect(url).not.toContain("limit=");
  });

  it("returns empty runs and count 0 when history is empty", async () => {
    mockFetch(200, { runs: [], count: 0 });
    const { getHistory } = await import("./api");
    const result = await getHistory();
    expect(result.runs).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it("throws on 401 Unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ detail: "Not authenticated" }),
      }),
    );
    const { getHistory } = await import("./api");
    await expect(getHistory()).rejects.toThrow("Not authenticated");
  });

  it("throws on 500 server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({ detail: "DB error" }),
      }),
    );
    const { getHistory } = await import("./api");
    await expect(getHistory()).rejects.toThrow("DB error");
  });

  it("throws on network failure", async () => {
    mockFetchError("network down");
    const { getHistory } = await import("./api");
    await expect(getHistory()).rejects.toThrow("network down");
  });

  it("returns multiple runs correctly", async () => {
    const makeRun = (i: number) => ({
      run_id: `r${i}`,
      created_at: `2026-06-${String(i).padStart(2, "0")}T09:00:00`,
      base_name: `base${i}.pdf`,
      revised_name: `rev${i}.pdf`,
      mode: i % 2 === 0 ? "bulk" : "single",
      pair_count: i,
      findings_count: i * 3,
      workflow: i % 3 === 0 ? "LRF" : null,
      status: "pass",
    });
    const runs = [1, 2, 3, 4, 5].map(makeRun);
    mockFetch(200, { runs, count: runs.length });

    const { getHistory } = await import("./api");
    const result = await getHistory({ limit: 50 });

    expect(result.runs).toHaveLength(5);
    expect(result.runs[1].mode).toBe("bulk");   // i=2 → even → bulk
    expect(result.runs[2].workflow).toBe("LRF"); // i=3 → 3%3=0 → LRF
  });

  it("handles bulk run with null findings_count on fail status", async () => {
    mockFetch(200, {
      runs: [
        {
          run_id: "f1",
          created_at: "2026-06-30T08:00:00",
          base_name: "3 files",
          revised_name: "3 files",
          mode: "bulk",
          pair_count: 3,
          findings_count: null,
          workflow: null,
          status: "fail",
        },
      ],
      count: 1,
    });
    const { getHistory } = await import("./api");
    const result = await getHistory();
    expect(result.runs[0].findings_count).toBeNull();
    expect(result.runs[0].status).toBe("fail");
  });
});

// ─── exportHistoryCSV ────────────────────────────────────────────────────────

describe("exportHistoryCSV", () => {
  it("throws on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: () => Promise.resolve({ detail: "Forbidden" }),
      }),
    );
    const { exportHistoryCSV } = await import("./api");
    await expect(exportHistoryCSV()).rejects.toThrow("Forbidden");
  });

  it("includes Authorization header", async () => {
    // Stub the DOM APIs needed by exportHistoryCSV
    const clickMock = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue({
        href: "",
        download: "",
        click: clickMock,
      }),
    });

    mockFetch(
      200,
      "date_time,master\n2026-06-30,base.pdf\n",
      { "content-disposition": 'attachment; filename="ProofX_History_20260630.csv"' },
    );

    const { exportHistoryCSV } = await import("./api");
    await exportHistoryCSV();

    const fetchMock = vi.mocked(globalThis.fetch);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
    expect(clickMock).toHaveBeenCalled();
  });

  it("throws on network failure", async () => {
    mockFetchError("offline");
    const { exportHistoryCSV } = await import("./api");
    await expect(exportHistoryCSV()).rejects.toThrow("offline");
  });
});

// ─── workflowDisplayName ─────────────────────────────────────────────────────

describe("workflowDisplayName", () => {
  it("maps null (pre-rename rows) to Visual Comparison", async () => {
    const { workflowDisplayName } = await import("./api");
    expect(workflowDisplayName(null)).toBe("Visual Comparison");
  });

  it("maps legacy 'LRF' to Proof Reading", async () => {
    const { workflowDisplayName } = await import("./api");
    expect(workflowDisplayName("LRF")).toBe("Proof Reading");
  });

  it("passes through current values unchanged", async () => {
    const { workflowDisplayName } = await import("./api");
    expect(workflowDisplayName("Visual Comparison")).toBe("Visual Comparison");
    expect(workflowDisplayName("Proof Reading")).toBe("Proof Reading");
  });
});
