import { z } from "zod";
import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { canExtract, uuidSchema } from "@/lib/schemas/common";
import { refreshGoogleTotals } from "@/server/data/google-refresh";
import { getPrisma } from "@/server/db/prisma";
import { markSheetDirty } from "@/server/sheets/dirty";
import { env } from "@/server/env";
import type { GoogleRefreshSummary } from "@/lib/schemas/google-refresh";

export const maxDuration = 60;

const bodySchema = z.object({ location_ids: z.array(uuidSchema).min(1).max(100).optional() });

/**
 * Refresh Google's public rating and review count (about 3 Serper credits per location). For admins (any location) and
 * users an admin allowed to extract (only their own locations), the same people and scope as POST /api/extract. The
 * credits count against the caller's own daily limit and the shared one.
 */
export const POST = withAuth(
  { roles: ["admin", "manager", "viewer"], body: bodySchema, rateLimit: { key: "google-refresh", limit: 5, windowSec: 60 } },
  async ({ ctx, body }) => {
    if (!canExtract(ctx.profile)) throw Errors.forbidden();
    // The missing-key message names configuration: admins only (as in the extract routes).
    if (!env.serperApiKey) throw Errors.badRequest(ctx.profile.role === "admin" ? "SERPER_API_KEY is not set" : "Refreshing Google totals is not available right now.");
    // Admins: the chosen locations, or all of them. Everyone else: only locations they can see.
    let ids: string[] | null = body.location_ids ?? null;
    if (ctx.profile.role !== "admin") {
      const accessible = await getAccessibleLocationIds(ctx);
      if (ids) {
        const allowed = new Set(accessible);
        if (ids.some((id) => !allowed.has(id))) throw Errors.notFound();
      } else {
        ids = accessible;
      }
    }
    // Serper calls take up to 45 s, so this is not one transaction; the audit row is written whatever happens, failures too.
    let summary: GoogleRefreshSummary | null = null;
    try {
      summary = await refreshGoogleTotals(ids, ctx.profile.id);
      // Filled-in addresses, regions and types appear in the Google Sheet.
      if (summary.results.some((r) => r.filled.length > 0)) await markSheetDirty();
      // Lookup errors can mention configuration (as in the extract route): their text is for admins only.
      return ok(ctx.profile.role === "admin" ? summary : { ...summary, results: summary.results.map((r) => ({ ...r, error: undefined })) });
    } finally {
      const data = {
        actor_id: ctx.profile.id,
        action: "location.google_refreshed",
        target: null,
        details: summary
          ? { credits_used: summary.credits_used, updated: summary.results.filter((r) => r.status === "updated").length, not_done: summary.not_done }
          : { failed: true },
      };
      // The audit_log table is admin-only under RLS, so a non-admin's entry is written over the privileged connection.
      if (ctx.profile.role === "admin") await ctx.db((tx) => tx.audit_log.create({ data }));
      else await getPrisma().audit_log.create({ data });
    }
  },
);
