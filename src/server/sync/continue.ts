import "server-only";
import { after } from "next/server";
import { env } from "@/server/env";
import { creditsUsedToday, type SyncSummary } from "./engine";

export const CHAIN_HEADER = "x-sync-chain";

/**
 * When a run ended with work left (big backfills), start the next run right after this response, so extraction
 * finishes without waiting a day for the cron. It only continues while the last run actually saved reviews or finished
 * a location: spending credits alone is not progress, so a read that goes nowhere ends the chain at once. Also bounded
 * by SYNC_MAX_CHAIN runs and the shared daily credit budget (checked again inside every run).
 */
export function scheduleContinuation(summary: SyncSummary, chain: number, origin: string): void {
  const progressed = summary.processed > 0 || summary.reviews_upserted > 0;
  if (!env.cronSecret || summary.remaining <= 0 || summary.status === "failed" || !progressed || chain >= env.syncMaxChain) return;

  after(async () => {
    if ((await creditsUsedToday()) >= env.serperDailyCreditLimit) {
      console.warn("[sync] daily credit limit reached; not continuing automatically");
      return;
    }
    try {
      // Fire and forget: the next run executes in its own invocation; we only wait long enough to hand it off.
      await fetch(`${env.internalAppUrl ?? env.appUrl ?? origin}/api/cron/sync`, {
        headers: { Authorization: `Bearer ${env.cronSecret}`, [CHAIN_HEADER]: String(chain + 1) },
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      });
    } catch {
      // Timeout is expected (the next run keeps going); anything else is retried by tomorrow's cron.
    }
  });
}
