import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "@/server/api/errors";
import { failure, ok } from "@/server/api/response";
import { autoCreditsLeft, tickAndClaim } from "@/server/data/auto-extract";
import { env } from "@/server/env";
import { CHAIN_HEADER, scheduleContinuation } from "@/server/sync/continue";
import { NotConfiguredError, runSync } from "@/server/sync/engine";

export const maxDuration = 60;

const BUDGET_MS = 45_000;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>` (what the scheduler sends). */
function authorized(req: NextRequest): boolean {
  const secret = env.cronSecret;
  if (!secret) return false; // no secret configured: the route is closed
  return timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

/**
 * Automatic extraction. Machine route (no user session), so not wrapped in withAuth. The scheduler (Supabase pg_cron,
 * see README) calls it every 15 minutes; a call does nothing until an admin has switched automatic extraction on and
 * the chosen Manila time has come, then claims the day's run (once a day) and extracts. A large extraction re-invokes
 * this route (CHAIN_HEADER, lib/sync/continue.ts) until done, within the automatic credit limit of the day.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return failure(new ApiError(401, "UNAUTHENTICATED", "Authentication required"));
  const chain = Math.max(0, Number(req.headers.get(CHAIN_HEADER)) || 0);
  try {
    if (chain === 0) {
      const claim = await tickAndClaim();
      if (claim !== "claimed") return ok({ skipped: claim });
    }
    const left = await autoCreditsLeft();
    if (left === null) return ok({ skipped: "disabled" });
    if (left <= 0) return ok({ skipped: "auto_credit_limit" });
    const summary = await runSync({ budgetMs: BUDGET_MS, maxCredits: Math.min(env.serperMaxCreditsPerRun, left) });
    scheduleContinuation(summary, chain, req.nextUrl.origin);
    return ok(summary);
  } catch (err) {
    if (err instanceof NotConfiguredError) return ok({ skipped: "not_configured", reason: err.message });
    console.error("[cron] sync failed:", err instanceof Error ? err.message : "unknown error");
    return failure(new ApiError(500, "INTERNAL", "Sync failed"));
  }
}
