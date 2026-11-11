import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import { getDashboard } from "@/lib/data/dashboard";
import { env } from "@/lib/env";
import { insightsQuerySchema } from "@/lib/schemas/insights";

/** Chart data for the Dashboard page, limited to the caller's locations (same rules as the reviews table and CSV). */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: insightsQuerySchema }, async ({ ctx, query }) => {
  const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getDashboard(tx, visible, query, env.exportTimeZone)));
});
