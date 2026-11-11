import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { getOverviewInsights } from "@/server/data/insights";
import { env } from "@/server/env";
import { insightsQuerySchema } from "@/lib/schemas/insights";

/** Dashboard tab data, limited to the caller's locations (same rules as the reviews table and CSV). */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: insightsQuerySchema }, async ({ ctx, query }) => {
  const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getOverviewInsights(tx, visible, query, env.exportTimeZone)));
});
