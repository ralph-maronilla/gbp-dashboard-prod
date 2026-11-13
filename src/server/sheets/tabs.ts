/**
 * Which tabs the reviews mirror needs and how to get the spreadsheet there. Pure: no Google calls, no database.
 * The app only ever changes tabs it created (remembered in `SheetTabsState`); any other tab is left alone.
 */

export const ALL_TAB_TITLE = "All reviews";
const MAX_TITLE = 100; // Google's limit for a tab name

/** The tabs the app created: the combined tab and one per location id. Stored in app_settings.sheet_tabs. */
export interface SheetTabsState {
  all: number | null;
  locations: Record<string, number>;
}

export const EMPTY_TABS_STATE: SheetTabsState = { all: null, locations: {} };

/** Reads the stored state, ignoring anything malformed (then the tabs are simply created again). */
export function parseTabsState(raw: unknown): SheetTabsState {
  if (!raw || typeof raw !== "object") return EMPTY_TABS_STATE;
  const r = raw as { all?: unknown; locations?: unknown };
  const locations: Record<string, number> = {};
  if (r.locations && typeof r.locations === "object") {
    for (const [id, tab] of Object.entries(r.locations)) if (Number.isInteger(tab)) locations[id] = tab as number;
  }
  return { all: Number.isInteger(r.all) ? (r.all as number) : null, locations };
}

/**
 * A tab name for `name` that Google accepts and that is not in `taken` (lower-cased names; tab names are unique
 * whatever their case). Characters that break cell references are replaced; a clash gets " (2)", " (3)", …
 * The chosen name is added to `taken`.
 */
export function tabTitle(name: string, taken: Set<string>): string {
  const base = (name.replace(/[\[\]*?:/\\\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() || "Location").replace(/^'+|'+$/g, "") || "Location";
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : ` (${n})`;
    const title = base.slice(0, MAX_TITLE - suffix.length).trimEnd() + suffix;
    if (!taken.has(title.toLowerCase())) {
      taken.add(title.toLowerCase());
      return title;
    }
  }
}

/** `'Tab name'!A5`: the cell a block of rows starts at. */
export const cellRange = (title: string, row: number) => `'${title.replace(/'/g, "''")}'!A${row}`;

export interface PlannedTab {
  /** "all" or a location id. */
  key: string;
  id: number;
  title: string;
}

export interface TabPlan {
  /** The mirror's tabs in their final order: "All reviews", then the locations by name. */
  tabs: PlannedTab[];
  /** Requests for spreadsheets.batchUpdate that create, rename, delete, size and order the tabs. */
  requests: object[];
  state: SheetTabsState;
}

/**
 * Compares the tabs the spreadsheet has with the tabs the mirror needs.
 *  - A location whose remembered tab still exists keeps it (renamed when the location was renamed).
 *  - A location without a tab (new, or its tab was deleted by hand) gets a new one.
 *  - A remembered tab whose location is gone is deleted.
 *  - Every mirror tab is sized to its data (`rows` data rows + the header, `columns` wide) with the header frozen, and
 *    moved to the front in order. Tabs the app did not create keep their place after them.
 * `newId` supplies ids for new tabs (random in production).
 */
export function planTabs(opts: {
  locations: { id: string; name: string }[];
  /** Data rows per key ("all" or location id). */
  rows: Map<string, number>;
  columns: number;
  existing: { id: number; title: string }[];
  state: SheetTabsState;
  newId: () => number;
}): TabPlan {
  const existing = new Map(opts.existing.map((t) => [t.id, t.title]));
  const usedIds = new Set(existing.keys());
  const freshId = () => {
    for (;;) {
      const id = opts.newId();
      if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
      }
    }
  };

  const wanted = [{ key: "all", name: ALL_TAB_TITLE }, ...[...opts.locations].sort((a, b) => a.name.localeCompare(b.name)).map((l) => ({ key: l.id, name: l.name }))];
  const remembered = (key: string) => (key === "all" ? opts.state.all : (opts.state.locations[key] ?? null));
  const keptIds = new Set(wanted.map((w) => remembered(w.key)).filter((id): id is number => id !== null && existing.has(id)));

  // Tabs of locations that no longer exist.
  const orphanIds = [opts.state.all, ...Object.values(opts.state.locations)].filter((id): id is number => id !== null && existing.has(id) && !keptIds.has(id));

  // Names already taken by tabs that are not ours (and will stay).
  const taken = new Set([...existing].filter(([id]) => !keptIds.has(id) && !orphanIds.includes(id)).map(([, title]) => title.toLowerCase()));

  const tabs: PlannedTab[] = [];
  const adds: object[] = [];
  const renames: { id: number; title: string }[] = [];
  for (const w of wanted) {
    const title = tabTitle(w.name, taken);
    const old = remembered(w.key);
    if (old !== null && existing.has(old)) {
      if (existing.get(old) !== title) renames.push({ id: old, title });
      tabs.push({ key: w.key, id: old, title });
    } else {
      const id = freshId();
      adds.push({ addSheet: { properties: { sheetId: id, title } } });
      tabs.push({ key: w.key, id, title });
    }
  }

  const requests: object[] = [
    // Deletes first, so their names are free. Renames go through a temporary name, so two tabs can swap names.
    ...orphanIds.map((id) => ({ deleteSheet: { sheetId: id } })),
    ...renames.map((r) => ({ updateSheetProperties: { properties: { sheetId: r.id, title: `__moving_${r.id}` }, fields: "title" } })),
    ...renames.map((r) => ({ updateSheetProperties: { properties: { sheetId: r.id, title: r.title }, fields: "title" } })),
    ...adds,
    // Size, freeze the header and order. A tab needs at least one row below a frozen header.
    ...tabs.map((t, index) => ({
      updateSheetProperties: {
        properties: { sheetId: t.id, index, gridProperties: { rowCount: Math.max(2, (opts.rows.get(t.key) ?? 0) + 1), columnCount: opts.columns, frozenRowCount: 1 } },
        fields: "index,gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount",
      },
    })),
  ];

  const state: SheetTabsState = { all: null, locations: {} };
  for (const t of tabs) {
    if (t.key === "all") state.all = t.id;
    else state.locations[t.key] = t.id;
  }
  return { tabs, requests, state };
}
