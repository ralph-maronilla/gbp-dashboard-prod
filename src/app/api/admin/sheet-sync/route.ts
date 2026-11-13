import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import type { Tx } from "@/server/db/with-rls";
import { env } from "@/server/env";
import { sheetUrl, syncSheetNow } from "@/server/sheets/sync";
import type { SheetSyncStatus } from "@/lib/schemas/sheet-sync";

export const maxDuration = 60;

async function status(tx: Tx): Promise<SheetSyncStatus> {
  const s = await tx.app_settings.findUnique({ where: { id: 1 }, select: { sheet_dirty_at: true, sheet_synced_at: true, sheet_rows: true, sheet_sync_error: true } });
  const configured = env.sheets !== null;
  return {
    configured,
    sheet_url: sheetUrl(),
    synced_at: s?.sheet_synced_at?.toISOString() ?? null,
    rows: s?.sheet_rows ?? null,
    pending: configured && !!s?.sheet_dirty_at,
    error: configured ? (s?.sheet_sync_error ?? null) : null,
  };
}

/** Admin: the state of the Google Sheet mirror of the reviews. */
export const GET = withAuth({ roles: ["admin"] }, async ({ ctx }) => ok(await ctx.db(status)));

/** Admin: write the Google Sheet now ("Sync now"). The outcome is audit-logged, failures too. */
export const POST = withAuth({ roles: ["admin"], rateLimit: { key: "sheet-sync", limit: 4, windowSec: 60 } }, async ({ ctx }) => {
  if (!env.sheets) throw Errors.badRequest("The Google Sheet is not set up on the server.");
  let details: Record<string, unknown> = { failed: true };
  try {
    const result = await syncSheetNow();
    details = result;
  } catch (err) {
    // The message says what to fix (sharing, the key, the spreadsheet id); admins only reach this route.
    throw Errors.conflict(err instanceof Error ? err.message : "The sheet could not be written.");
  } finally {
    await ctx.db((tx) => tx.audit_log.create({ data: { actor_id: ctx.profile.id, action: "sheet.synced", target: null, details: details as object } }));
  }
  return ok(await ctx.db(status));
});
