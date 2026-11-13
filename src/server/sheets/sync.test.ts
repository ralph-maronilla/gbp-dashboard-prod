import { beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_CSV_COLUMNS } from "@/lib/export/review-columns";
import type { ReviewRow } from "@/lib/schemas/extract";

// The database and Google are replaced: these tests check what the sync decides, not the network.
const db = vi.hoisted(() => ({
  dirty: null as Date | null,
  running: 0,
  settings: {} as Record<string, unknown>,
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  getPrisma: () => ({
    $queryRaw: db.$queryRaw,
    $executeRaw: db.$executeRaw,
    sync_runs: { count: async () => db.running },
    app_settings: {
      findUnique: async () => ({ sheet_tabs: null }),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(db.settings, data),
    },
    locations: { findMany: async () => [] },
    reviews: { findMany: async () => [] },
  }),
}));
vi.mock("@/server/sync/engine", () => ({ closeStaleRuns: vi.fn(async () => undefined) }));
const auth = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock("./google-auth", () => auth);

import type { SheetsClient, TabValues } from "./client";
import { batchBlocks, sheetRow, syncSheetIfDirty, tabBlocks, writeMirror } from "./sync";
import { EMPTY_TABS_STATE, type SheetTabsState } from "./tabs";

const review = (n: number, locationId: string, over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: `r${n}`,
  reference: String(1000 + n),
  datetime: "11/12/2026 9:54",
  created_at: "2026-11-12T01:54:00.000Z",
  branch: "SJDM",
  first_name: "Susan",
  middle_name: "N/A",
  reviewer_url: "https://maps.google.com/contrib/1",
  last_name: "Sumaribos",
  location: "Altaraza Town Center",
  location_id: locationId,
  location_type: "Outpatient Center",
  client: "Healthway",
  region: "Region III",
  rating: 5,
  comment: "Great staff",
  reply: "Thank you!",
  reply_date: "11/12/2026 10:30",
  ...over,
});

const HEADER = REVIEW_CSV_COLUMNS.map((c) => c.header);

function fakeClient(existing: { id: number; title: string; index: number }[] = []) {
  const calls = { batchUpdate: [] as object[][], writeValues: [] as TabValues[][], order: [] as string[] };
  const client: SheetsClient = {
    tabs: async () => existing,
    batchUpdate: async (requests) => {
      calls.order.push("batchUpdate");
      calls.batchUpdate.push(requests);
    },
    writeValues: async (data) => {
      calls.order.push("writeValues");
      calls.writeValues.push(data);
    },
  };
  return { client, calls };
}

describe("sheetRow", () => {
  it("holds the 18 export columns in order, as the CSV does", () => {
    expect(sheetRow(review(1, "a"))).toEqual([
      1001, "11/12/2026 9:54", "SJDM", "Susan", "N/A", "Sumaribos", "N/A", "Altaraza Town Center", "N/A", 5, "Great staff",
      "https://maps.google.com/contrib/1", "Outpatient Center", "Healthway", "Region III", "Yes", "Thank you!", "11/12/2026 10:30",
    ]);
  });

  it("leaves empty cells for a rating without comment or reply", () => {
    const row = sheetRow(review(2, "a", { comment: null, reply: null, reply_date: null, reviewer_url: null, location_type: null, region: null }));
    expect(row.slice(10)).toEqual(["", "", "", "Healthway", "", "No", "", ""]);
  });
});

describe("tabBlocks", () => {
  it("starts with the header at A1 and cuts long tabs into blocks", () => {
    const rows = [[1], [2], [3], [4], [5]];
    expect(tabBlocks("Alpha", rows, 3)).toEqual([
      { range: "'Alpha'!A1", values: [HEADER, [1], [2]] },
      { range: "'Alpha'!A4", values: [[3], [4], [5]] },
    ]);
  });

  it("writes the header and one blank row for a tab without reviews", () => {
    const [block] = tabBlocks("Empty", []);
    expect(block!.values).toEqual([HEADER, HEADER.map(() => "")]);
  });
});

describe("batchBlocks", () => {
  it("fills requests up to the row limit without splitting a block", () => {
    const block = (n: number): TabValues => ({ range: `'T'!A${n}`, values: Array.from({ length: n }, () => [n]) });
    expect(batchBlocks([block(2), block(2), block(3), block(1)], 4).map((b) => b.map((x) => x.values.length))).toEqual([[2, 2], [3, 1]]);
  });
});

describe("writeMirror", () => {
  const locations = [
    { id: "loc-b", name: "Beta Clinic" },
    { id: "loc-a", name: "Alpha Clinic" },
    { id: "loc-c", name: "Gamma Clinic" }, // no reviews yet
  ];
  const reviews = [review(1, "loc-a"), review(2, "loc-b"), review(3, "loc-a")];
  let nextId = 100;
  const newId = () => nextId++;
  beforeEach(() => (nextId = 100));

  it("writes All reviews and one tab per location: header + that location's rows", async () => {
    const { client, calls } = fakeClient([{ id: 0, title: "Sheet1", index: 0 }]);
    const result = await writeMirror({ client, locations, reviews, state: EMPTY_TABS_STATE, saveState: async () => undefined, newId });
    expect(result).toEqual({ rows: 3, tabs: 4 });
    const written = Object.fromEntries(calls.writeValues.flat().map((b) => [b.range, b.values]));
    expect(Object.keys(written)).toEqual(["'All reviews'!A1", "'Alpha Clinic'!A1", "'Beta Clinic'!A1", "'Gamma Clinic'!A1"]);
    expect(written["'All reviews'!A1"]).toEqual([HEADER, ...reviews.map(sheetRow)]);
    expect(written["'Alpha Clinic'!A1"]).toEqual([HEADER, sheetRow(reviews[0]!), sheetRow(reviews[2]!)]);
    expect(written["'Beta Clinic'!A1"]).toEqual([HEADER, sheetRow(reviews[1]!)]);
    expect(written["'Gamma Clinic'!A1"]).toEqual([HEADER, HEADER.map(() => "")]);
  });

  it("sizes the tabs before writing, so rows left from a longer copy are gone", async () => {
    const { client, calls } = fakeClient();
    await writeMirror({ client, locations, reviews, state: EMPTY_TABS_STATE, saveState: async () => undefined, newId });
    expect(calls.order[0]).toBe("batchUpdate");
    expect(calls.order.slice(1).every((c) => c === "writeValues")).toBe(true);
    const sizes = calls.batchUpdate[0]!
      .map((r) => (r as { updateSheetProperties?: { properties: { gridProperties?: { rowCount: number; columnCount: number } } } }).updateSheetProperties?.properties.gridProperties)
      .filter((g) => g !== undefined);
    expect(sizes.map((g) => [g.rowCount, g.columnCount])).toEqual([[4, 18], [3, 18], [2, 18], [2, 18]]);
  });

  it("remembers its tabs before asking Google to create them", async () => {
    const { client, calls } = fakeClient();
    let saved: SheetTabsState | null = null;
    let googleCallsWhenSaved = -1;
    await writeMirror({
      client,
      locations,
      reviews,
      state: EMPTY_TABS_STATE,
      newId,
      saveState: async (state) => {
        saved = state;
        googleCallsWhenSaved = calls.order.length;
      },
    });
    expect(googleCallsWhenSaved).toBe(0);
    expect(saved).toEqual({ all: 100, locations: { "loc-a": 101, "loc-b": 102, "loc-c": 103 } });
  });

  it("reuses the tabs it already has", async () => {
    const state = { all: 100, locations: { "loc-a": 101, "loc-b": 102, "loc-c": 103 } };
    const existing = [
      { id: 100, title: "All reviews", index: 0 },
      { id: 101, title: "Alpha Clinic", index: 1 },
      { id: 102, title: "Beta Clinic", index: 2 },
      { id: 103, title: "Gamma Clinic", index: 3 },
      { id: 7, title: "My pivot", index: 4 },
    ];
    const { client, calls } = fakeClient(existing);
    await writeMirror({ client, locations, reviews, state, saveState: async () => undefined, newId });
    const requests = JSON.stringify(calls.batchUpdate[0]);
    expect(requests).not.toContain("addSheet");
    expect(requests).not.toContain("deleteSheet");
    expect(requests).not.toContain('"sheetId":7');
  });
});

describe("syncSheetIfDirty", () => {
  beforeEach(() => {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-1";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "mirror@project.iam.gserviceaccount.com";
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "key";
    db.dirty = new Date("2026-11-13T00:00:00Z");
    db.running = 0;
    db.settings = {};
    // The claim: read the flag and clear it.
    db.$queryRaw.mockReset().mockImplementation(async () => {
      const was = db.dirty;
      db.dirty = null;
      return [{ dirty: was }];
    });
    // The restore: put the flag back.
    db.$executeRaw.mockReset().mockImplementation(async (_sql: TemplateStringsArray, value: Date) => {
      db.dirty = db.dirty ?? value;
      return 1;
    });
    auth.getAccessToken.mockReset();
  });

  it("does nothing when the sheet is not set up", async () => {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    expect(await syncSheetIfDirty()).toBeNull();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("does nothing when nothing changed", async () => {
    db.dirty = null;
    expect(await syncSheetIfDirty()).toBeNull();
    expect(auth.getAccessToken).not.toHaveBeenCalled();
  });

  it("waits while an extraction is running, keeping the sheet marked", async () => {
    db.running = 1;
    expect(await syncSheetIfDirty()).toBe("busy");
    expect(db.dirty).toEqual(new Date("2026-11-13T00:00:00Z"));
    expect(auth.getAccessToken).not.toHaveBeenCalled();
  });

  it("keeps the sheet marked and records why when Google fails", async () => {
    auth.getAccessToken.mockRejectedValue(new Error("Google refused access. Share the sheet with the service account's email as Editor, and enable the Google Sheets API."));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await syncSheetIfDirty()).toBe("failed");
    log.mockRestore();
    expect(db.dirty).toEqual(new Date("2026-11-13T00:00:00Z"));
    expect(db.settings.sheet_sync_error).toMatch(/Share the sheet with the service account/);
    expect(db.settings.sheet_synced_at).toBeUndefined();
  });

  it("writes the sheet, clears the mark and the error", async () => {
    auth.getAccessToken.mockResolvedValue("tok");
    const fetchMock = vi.fn(async (...[url]: [url: string, init?: RequestInit]) => new Response(JSON.stringify(String(url).includes("?fields=") ? { sheets: [] } : {}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await syncSheetIfDirty()).toBe("synced");
    vi.unstubAllGlobals();
    expect(db.dirty).toBeNull();
    expect(db.settings.sheet_sync_error).toBeNull();
    expect(db.settings.sheet_rows).toBe(0);
    expect(db.settings.sheet_synced_at).toBeInstanceOf(Date);
    // Tabs, then values; the values go in RAW so text is never run as a formula.
    const bodies = fetchMock.mock.calls.map(([url, init]) => [String(url).split("sheet-1")[1], init?.body ? JSON.parse(String(init.body)) : null]);
    expect(bodies.map(([path]) => path)).toEqual(["?fields=sheets.properties(sheetId,title,index)", ":batchUpdate", "/values:batchUpdate"]);
    expect(bodies[2]![1].valueInputOption).toBe("RAW");
    expect(bodies[2]![1].data[0].range).toBe("'All reviews'!A1");
  });
});
