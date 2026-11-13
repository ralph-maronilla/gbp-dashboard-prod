import "server-only";
import { randomInt } from "node:crypto";
import { REVIEW_HEADER, reviewCell } from "@/lib/export/review-cells";
import { REVIEW_CSV_IDS } from "@/lib/export/review-columns";
import type { ReviewRow } from "@/lib/schemas/extract";
import { reviewSheetSelect, toReviewRow } from "@/server/data/reviews";
import { getPrisma } from "@/server/db/prisma";
import { env } from "@/server/env";
import { closeStaleRuns } from "@/server/sync/engine";
import { sheetsClient, type SheetsClient, type TabValues } from "./client";
import { getAccessToken } from "./google-auth";
import { cellRange, parseTabsState, planTabs, type SheetTabsState } from "./tabs";

/** Reviews read from the database at a time. */
const READ_CHUNK = 2000;
/** Rows sent to Google in one request. */
const WRITE_ROWS = 5000;
/** A whole sync must fit in one request to the app (60 s limit on the routes that start it). */
const SYNC_BUDGET_MS = 45_000;

const HEADER_ROW = REVIEW_CSV_IDS.map((c) => REVIEW_HEADER.get(c) ?? c);
const BLANK_ROW = REVIEW_CSV_IDS.map(() => "");

export const sheetRow = (r: ReviewRow): (string | number)[] => REVIEW_CSV_IDS.map((c) => reviewCell(r, c));

/**
 * The value blocks to write for one tab: the header and its rows from A1, cut into blocks of at most `maxRows` rows.
 * A tab without reviews gets the header and one blank row, which clears what the (never empty) grid may still hold.
 */
export function tabBlocks(title: string, rows: (string | number)[][], maxRows = WRITE_ROWS): TabValues[] {
  const all = [HEADER_ROW, ...(rows.length > 0 ? rows : [BLANK_ROW])];
  const blocks: TabValues[] = [];
  for (let at = 0; at < all.length; at += maxRows) blocks.push({ range: cellRange(title, at + 1), values: all.slice(at, at + maxRows) });
  return blocks;
}

/** Groups blocks into requests of at most `maxRows` rows in total. */
export function batchBlocks(blocks: TabValues[], maxRows = WRITE_ROWS): TabValues[][] {
  const batches: TabValues[][] = [];
  let current: TabValues[] = [];
  let size = 0;
  for (const b of blocks) {
    if (current.length > 0 && size + b.values.length > maxRows) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(b);
    size += b.values.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Makes the spreadsheet match the given reviews: an "All reviews" tab and one tab per location, each holding the header
 * and its rows and nothing else. `saveState` is called with the tabs the app owns before Google is asked to create
 * them: if the call then fails, the next sync finds no such tab and creates it again, so no tab is ever left behind
 * unknown to the app.
 */
export async function writeMirror(opts: {
  client: SheetsClient;
  locations: { id: string; name: string }[];
  /** All reviews, in the order they should appear. */
  reviews: ReviewRow[];
  state: SheetTabsState;
  saveState: (state: SheetTabsState) => Promise<void>;
  newId?: () => number;
}): Promise<{ rows: number; tabs: number }> {
  const byLocation = new Map<string, (string | number)[][]>();
  const allRows: (string | number)[][] = [];
  for (const r of opts.reviews) {
    const row = sheetRow(r);
    allRows.push(row);
    const list = byLocation.get(r.location_id);
    if (list) list.push(row);
    else byLocation.set(r.location_id, [row]);
  }
  const counts = new Map<string, number>([["all", allRows.length], ...opts.locations.map((l) => [l.id, byLocation.get(l.id)?.length ?? 0] as [string, number])]);

  const plan = planTabs({
    locations: opts.locations,
    rows: counts,
    columns: HEADER_ROW.length,
    existing: await opts.client.tabs(),
    state: opts.state,
    newId: opts.newId ?? (() => randomInt(1, 2 ** 31 - 1)),
  });
  await opts.saveState(plan.state);
  // Tabs first (sized to the data, so rows left over from a longer earlier copy are gone), then the cells.
  await opts.client.batchUpdate(plan.requests);
  const blocks = plan.tabs.flatMap((t) => tabBlocks(t.title, t.key === "all" ? allRows : (byLocation.get(t.key) ?? [])));
  for (const batch of batchBlocks(blocks)) await opts.client.writeValues(batch);
  return { rows: allRows.length, tabs: plan.tabs.length };
}

/** Where the admin can open the sheet, or null when the mirror is not set up. */
export const sheetUrl = () => (env.sheets ? `https://docs.google.com/spreadsheets/d/${env.sheets.spreadsheetId}/edit` : null);

/** Every review of the locations in the app, newest first, as export rows. */
async function readReviews(): Promise<ReviewRow[]> {
  const prisma = getPrisma();
  const tz = env.exportTimeZone;
  const rows: ReviewRow[] = [];
  for (let skip = 0; ; skip += READ_CHUNK) {
    const chunk = await prisma.reviews.findMany({
      where: { location: { removed_at: null } },
      orderBy: [{ create_time: "desc" }, { id: "desc" }],
      select: reviewSheetSelect,
      skip,
      take: READ_CHUNK,
    });
    for (const r of chunk) rows.push(toReviewRow(r, tz));
    if (chunk.length < READ_CHUNK) return rows;
  }
}

/** Writes the whole mirror now. Throws with a message an admin can act on; records the outcome either way. */
export async function syncReviewsSheet(): Promise<{ rows: number; tabs: number }> {
  const config = env.sheets;
  if (!config) throw new Error("The Google Sheet is not set up.");
  const prisma = getPrisma();
  const signal = AbortSignal.timeout(SYNC_BUDGET_MS);
  try {
    const [settings, locations, reviews] = await Promise.all([
      prisma.app_settings.findUnique({ where: { id: 1 }, select: { sheet_tabs: true } }),
      prisma.locations.findMany({ where: { removed_at: null }, select: { id: true, name: true } }),
      readReviews(),
    ]);
    const token = await getAccessToken(config, signal);
    const result = await writeMirror({
      client: sheetsClient(config.spreadsheetId, token, signal),
      locations,
      reviews,
      state: parseTabsState(settings?.sheet_tabs),
      saveState: async (state) => {
        await prisma.app_settings.update({ where: { id: 1 }, data: { sheet_tabs: { all: state.all, locations: state.locations } } });
      },
    });
    await prisma.app_settings.update({ where: { id: 1 }, data: { sheet_synced_at: new Date(), sheet_rows: result.rows, sheet_sync_error: null } });
    return result;
  } catch (err) {
    const message = signal.aborted ? "Writing the sheet took too long and was stopped. It will be tried again." : err instanceof Error ? err.message : "Unknown error";
    await prisma.app_settings.update({ where: { id: 1 }, data: { sheet_sync_error: message.slice(0, 500) } }).catch(() => undefined);
    throw new Error(message);
  }
}

/** Takes the "out of date" flag (so two syncs cannot run at once) and returns how to put it back after a failure. */
async function claimDirty(): Promise<{ dirty: Date | null; restore: () => Promise<unknown> }> {
  const prisma = getPrisma();
  const claimed = await prisma.$queryRaw<{ dirty: Date | null }[]>`
    update public.app_settings s set sheet_dirty_at = null
      from (select sheet_dirty_at from public.app_settings where id = 1 for update) old
     where s.id = 1
    returning old.sheet_dirty_at as dirty`;
  const dirty = claimed[0]?.dirty ?? null;
  return { dirty, restore: () => prisma.$executeRaw`update public.app_settings set sheet_dirty_at = coalesce(sheet_dirty_at, ${dirty ?? new Date()}) where id = 1` };
}

/** "Sync now": writes the sheet whether or not it is marked out of date. A failure leaves it marked, so the scheduler retries. */
export async function syncSheetNow(): Promise<{ rows: number; tabs: number }> {
  const { restore } = await claimDirty();
  try {
    return await syncReviewsSheet();
  } catch (err) {
    await restore().catch(() => undefined);
    throw err;
  }
}

/**
 * Called by the scheduler tick: writes the sheet when it is out of date. Waits for running extractions to finish (the
 * next tick tries again), so a long extraction leads to one write, not one per pass. Never throws.
 */
export async function syncSheetIfDirty(): Promise<"synced" | "busy" | "failed" | null> {
  if (!env.sheets) return null;
  try {
    const { dirty, restore } = await claimDirty();
    if (!dirty) return null;
    await closeStaleRuns(); // a crashed run must not hold the sheet back for ever
    if ((await getPrisma().sync_runs.count({ where: { status: "running" } })) > 0) {
      await restore();
      return "busy";
    }
    try {
      await syncReviewsSheet();
      return "synced";
    } catch (err) {
      await restore();
      console.error("[sheets] sync failed:", err instanceof Error ? err.message : "unknown error");
      return "failed";
    }
  } catch (err) {
    console.error("[sheets] sync check failed:", err instanceof Error ? err.message : "unknown error");
    return "failed";
  }
}
