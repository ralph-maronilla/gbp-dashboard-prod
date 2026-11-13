import "server-only";
import { getPrisma } from "@/server/db/prisma";
import { env } from "@/server/env";

/**
 * Notes that the Google Sheet no longer matches the app (reviews saved, a location added, changed or removed). The next
 * scheduler tick writes it (sheets/sync.ts). Does nothing when the mirror is not set up, and never fails the caller.
 */
export async function markSheetDirty(): Promise<void> {
  if (!env.sheets) return;
  try {
    await getPrisma().$executeRaw`update public.app_settings set sheet_dirty_at = coalesce(sheet_dirty_at, now()) where id = 1`;
  } catch (err) {
    console.error("[sheets] could not mark the sheet for syncing:", err instanceof Error ? err.message : "unknown error");
  }
}
