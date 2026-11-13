import { describe, expect, it } from "vitest";
import { ALL_TAB_TITLE, EMPTY_TABS_STATE, cellRange, parseTabsState, planTabs, tabTitle } from "./tabs";

const ids = (...list: number[]) => {
  let i = 0;
  return () => list[i++]!;
};
const titles = (requests: object[], kind: string) => requests.filter((r) => kind in r).map((r) => (r as Record<string, { properties?: { title?: string }; sheetId?: number }>)[kind]);

describe("tabTitle", () => {
  it("keeps an ordinary name", () => {
    expect(tabTitle("Healthway Abreeza", new Set())).toBe("Healthway Abreeza");
  });

  it("replaces characters that break cell references and trims", () => {
    expect(tabTitle("  Market! Market! [BGC] / Taguig: 2F*?  ", new Set())).toBe("Market! Market! BGC Taguig 2F");
    expect(tabTitle("'Quoted'", new Set())).toBe("Quoted");
  });

  it("falls back for a name with nothing usable", () => {
    expect(tabTitle("[]", new Set())).toBe("Location");
  });

  it("numbers a name that is taken, whatever its case", () => {
    const taken = new Set(["makati"]);
    expect(tabTitle("Makati", taken)).toBe("Makati (2)");
    expect(tabTitle("MAKATI", taken)).toBe("MAKATI (3)");
  });

  it("keeps to 100 characters, suffix included", () => {
    const long = "A".repeat(150);
    const taken = new Set<string>();
    expect(tabTitle(long, taken)).toHaveLength(100);
    const second = tabTitle(long, taken);
    expect(second).toHaveLength(100);
    expect(second.endsWith(" (2)")).toBe(true);
  });
});

describe("cellRange", () => {
  it("quotes the tab name and doubles apostrophes", () => {
    expect(cellRange("St. Luke's", 5001)).toBe("'St. Luke''s'!A5001");
  });
});

describe("parseTabsState", () => {
  it("reads a stored state and ignores anything malformed", () => {
    expect(parseTabsState({ all: 7, locations: { a: 1, b: "x", c: 2.5 } })).toEqual({ all: 7, locations: { a: 1 } });
    expect(parseTabsState(null)).toEqual(EMPTY_TABS_STATE);
    expect(parseTabsState("nope")).toEqual(EMPTY_TABS_STATE);
  });
});

describe("planTabs", () => {
  const locations = [
    { id: "loc-b", name: "Beta Clinic" },
    { id: "loc-a", name: "Alpha Clinic" },
  ];
  const rows = new Map([["all", 5], ["loc-a", 3], ["loc-b", 2]]);

  it("creates All reviews and a tab per location on a new spreadsheet, in order, leaving other tabs alone", () => {
    const plan = planTabs({ locations, rows, columns: 18, existing: [{ id: 0, title: "Sheet1" }], state: EMPTY_TABS_STATE, newId: ids(11, 12, 13) });
    expect(plan.tabs).toEqual([
      { key: "all", id: 11, title: ALL_TAB_TITLE },
      { key: "loc-a", id: 12, title: "Alpha Clinic" },
      { key: "loc-b", id: 13, title: "Beta Clinic" },
    ]);
    expect(plan.state).toEqual({ all: 11, locations: { "loc-a": 12, "loc-b": 13 } });
    expect(titles(plan.requests, "addSheet").map((a) => a!.properties!.title)).toEqual([ALL_TAB_TITLE, "Alpha Clinic", "Beta Clinic"]);
    expect(titles(plan.requests, "deleteSheet")).toEqual([]);
    // Nothing refers to the user's own tab.
    expect(JSON.stringify(plan.requests)).not.toContain('"sheetId":0');
  });

  it("sizes each tab to its data plus the header, freezes the header and orders the tabs", () => {
    const plan = planTabs({ locations, rows, columns: 18, existing: [], state: EMPTY_TABS_STATE, newId: ids(11, 12, 13) });
    const sizing = plan.requests.filter((r) => "updateSheetProperties" in r && (r as { updateSheetProperties: { fields: string } }).updateSheetProperties.fields.startsWith("index"));
    expect(sizing).toEqual([
      { updateSheetProperties: { properties: { sheetId: 11, index: 0, gridProperties: { rowCount: 6, columnCount: 18, frozenRowCount: 1 } }, fields: "index,gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount" } },
      { updateSheetProperties: { properties: { sheetId: 12, index: 1, gridProperties: { rowCount: 4, columnCount: 18, frozenRowCount: 1 } }, fields: "index,gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount" } },
      { updateSheetProperties: { properties: { sheetId: 13, index: 2, gridProperties: { rowCount: 3, columnCount: 18, frozenRowCount: 1 } }, fields: "index,gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount" } },
    ]);
  });

  it("gives a location without reviews a tab with room for one row under the header", () => {
    const plan = planTabs({ locations: [{ id: "new", name: "New Clinic" }], rows: new Map([["all", 0]]), columns: 18, existing: [], state: EMPTY_TABS_STATE, newId: ids(1, 2) });
    expect(JSON.stringify(plan.requests).match(/"rowCount":2/g)).toHaveLength(2);
  });

  it("keeps existing tabs, renaming the tab of a renamed location instead of adding one", () => {
    const state = { all: 11, locations: { "loc-a": 12, "loc-b": 13 } };
    const existing = [
      { id: 11, title: ALL_TAB_TITLE },
      { id: 12, title: "Alpha Clinic" },
      { id: 13, title: "Old Beta" },
    ];
    const plan = planTabs({ locations, rows, columns: 18, existing, state, newId: ids() });
    expect(plan.state).toEqual(state);
    expect(titles(plan.requests, "addSheet")).toEqual([]);
    const renames = plan.requests.filter((r) => "updateSheetProperties" in r && (r as { updateSheetProperties: { fields: string } }).updateSheetProperties.fields === "title");
    // Through a temporary name, so two tabs could swap names.
    expect(renames).toEqual([
      { updateSheetProperties: { properties: { sheetId: 13, title: "__moving_13" }, fields: "title" } },
      { updateSheetProperties: { properties: { sheetId: 13, title: "Beta Clinic" }, fields: "title" } },
    ]);
  });

  it("deletes the tab of a location that is gone, before anything else", () => {
    const state = { all: 11, locations: { "loc-a": 12, gone: 99 } };
    const existing = [
      { id: 11, title: ALL_TAB_TITLE },
      { id: 12, title: "Alpha Clinic" },
      { id: 99, title: "Closed Clinic" },
    ];
    const plan = planTabs({ locations: [{ id: "loc-a", name: "Alpha Clinic" }], rows, columns: 18, existing, state, newId: ids() });
    expect(plan.requests[0]).toEqual({ deleteSheet: { sheetId: 99 } });
    expect(plan.state).toEqual({ all: 11, locations: { "loc-a": 12 } });
  });

  it("creates the tab again when it was deleted by hand", () => {
    const plan = planTabs({ locations: [{ id: "loc-a", name: "Alpha Clinic" }], rows, columns: 18, existing: [{ id: 11, title: ALL_TAB_TITLE }], state: { all: 11, locations: { "loc-a": 12 } }, newId: ids(40) });
    expect(titles(plan.requests, "addSheet").map((a) => a!.properties)).toEqual([{ sheetId: 40, title: "Alpha Clinic" }]);
    expect(plan.state.locations["loc-a"]).toBe(40);
  });

  it("does not take over a tab of the user's with the same name", () => {
    const plan = planTabs({ locations: [{ id: "loc-a", name: "Alpha Clinic" }], rows, columns: 18, existing: [{ id: 5, title: "alpha clinic" }], state: EMPTY_TABS_STATE, newId: ids(5, 21, 22) });
    // Id 5 is in use, so the next ones are taken; the name gets a number.
    expect(plan.tabs).toEqual([
      { key: "all", id: 21, title: ALL_TAB_TITLE },
      { key: "loc-a", id: 22, title: "Alpha Clinic (2)" },
    ]);
  });

  it("gives two locations whose names become the same tab name different tabs", () => {
    const plan = planTabs({ locations: [{ id: "x", name: "Clinic [A]" }, { id: "y", name: "Clinic A" }], rows, columns: 18, existing: [], state: EMPTY_TABS_STATE, newId: ids(1, 2, 3) });
    expect(plan.tabs.map((t) => t.title).sort()).toEqual(["All reviews", "Clinic A", "Clinic A (2)"]);
  });
});
