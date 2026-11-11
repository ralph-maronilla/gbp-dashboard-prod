import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { env } from "@/server/env";
import { NotConfiguredError, creditsUsedToday, limitMessage, runSync } from "@/server/sync/engine";
import { extractRequestSchema, type SyncSummaryDto } from "@/lib/schemas/extract";

export const maxDuration = 60;

/** Leaves headroom under maxDuration; the page calls again while work remains. */
const BUDGET_MS = 45_000;

/**
 * Runs one extraction slice for the chosen locations (admins: any, managers: only their own). Several users can call
 * this at once: each location is claimed by one run at a time, so work is shared, never duplicated.
 */
export const POST = withAuth(
  { roles: ["admin", "manager"], body: extractRequestSchema, rateLimit: { key: "extract", limit: 30, windowSec: 60 } },
  async ({ ctx, body }) => {
    if (!env.serperApiKey) throw Errors.conflict(new NotConfiguredError().message);
    const accessible = await getAccessibleLocationIds(ctx); // admins: all locations
    const requested = body.location_ids ? [...new Set(body.location_ids)] : accessible;
    if (body.location_ids && ctx.profile.role !== "admin") {
      const allowed = new Set(accessible);
      if (requested.some((id) => !allowed.has(id))) throw Errors.notFound();
    }
    if ((await creditsUsedToday()) >= env.serperDailyCreditLimit) {
      throw Errors.conflict(`Today's credit limit (${env.serperDailyCreditLimit.toLocaleString("en-US")}) is reached. Raise SERPER_DAILY_CREDIT_LIMIT or try tomorrow.`);
    }
    if ((await creditsUsedToday(ctx.profile.id)) >= env.serperUserDailyCreditLimit) throw Errors.conflict(`${limitMessage("user")}.`);

    const { limited_by, ...summary } = await runSync({ budgetMs: BUDGET_MS, locationIds: requested, startedBy: ctx.profile.id });
    const details = { locations: requested.length, processed: summary.processed, remaining: summary.remaining, failed: summary.failed, reviews_upserted: summary.reviews_upserted, credits_used: summary.credits_used };
    // log_action (migration 0016) lets managers write this one audit entry; the audit_log table itself is admin-only.
    await ctx.db((tx) => tx.$executeRaw`select public.log_action('extract.run', ${summary.run_id}, ${JSON.stringify(details)}::jsonb)`);
    // Error text can mention configuration (like the status route): admins only. Credit-limit messages are for everyone.
    const dto: SyncSummaryDto = ctx.profile.role === "admin" || limited_by ? summary : { ...summary, error: null };
    return ok(dto);
  },
);
