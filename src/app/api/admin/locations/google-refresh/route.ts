import { z } from "zod";
import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import { uuidSchema } from "@/lib/schemas/common";
import { refreshGoogleTotals } from "@/server/data/google-refresh";
import { env } from "@/server/env";
import type { GoogleRefreshSummary } from "@/lib/schemas/google-refresh";

export const maxDuration = 60;

const bodySchema = z.object({ location_ids: z.array(uuidSchema).min(1).max(100).optional() });

/** Admin: refresh Google's public rating and review count (about 3 Serper credits per location). */
export const POST = withAuth(
  { roles: ["admin"], body: bodySchema, rateLimit: { key: "google-refresh", limit: 5, windowSec: 60 } },
  async ({ ctx, body }) => {
    if (!env.serperApiKey) throw Errors.badRequest("SERPER_API_KEY is not set");
    // Serper calls take up to 45 s, so this is not one transaction; the audit row is written whatever happens, failures too.
    let summary: GoogleRefreshSummary | null = null;
    try {
      summary = await refreshGoogleTotals(body.location_ids ?? null, ctx.profile.id);
      return ok(summary);
    } finally {
      await ctx.db((tx) =>
        tx.audit_log.create({
          data: {
            actor_id: ctx.profile.id,
            action: "location.google_refreshed",
            target: null,
            details: summary
              ? { credits_used: summary.credits_used, updated: summary.results.filter((r) => r.status === "updated").length, not_done: summary.not_done }
              : { failed: true },
          },
        }),
      );
    }
  },
);
