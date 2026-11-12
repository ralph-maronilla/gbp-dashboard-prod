import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { env } from "@/server/env";
import { creditsUsedToday, latestRun } from "@/server/sync/engine";
import type { ExtractStatusDto } from "@/lib/schemas/extract";
import { Errors } from "@/server/api/errors";
import { canExtract } from "@/lib/schemas/common";

export const GET = withAuth({ roles: ["admin", "manager", "viewer"] }, async ({ ctx }) => {
  if (!canExtract(ctx.profile)) throw Errors.forbidden();
  const [run, credits, mine] = await Promise.all([latestRun(), creditsUsedToday(), creditsUsedToday(ctx.profile.id)]);
  const status: ExtractStatusDto = {
    configured: Boolean(env.serperApiKey),
    credits_today: credits,
    daily_credit_limit: env.serperDailyCreditLimit,
    my_credits_today: mine,
    my_daily_credit_limit: env.serperUserDailyCreditLimit,
    max_credits_per_run: env.serperMaxCreditsPerRun,
    last_run: run
      ? {
          status: run.status, started_at: run.started_at.toISOString(), finished_at: run.finished_at?.toISOString() ?? null,
          // Error text can mention configuration; admins only, like the overview's failed runs.
          error: ctx.profile.role === "admin" ? run.error : null,
          reviews_upserted: run.reviews_upserted, credits_used: run.credits_used,
        }
      : null,
  };
  return ok(status);
});
