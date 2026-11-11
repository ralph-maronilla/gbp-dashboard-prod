import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import { getThemeInsights } from "@/lib/data/insights";
import { env } from "@/lib/env";
import { groupByQuerySchema } from "@/lib/schemas/insights";

/** Dashboard tab data, limited to the caller's locations (same rules as the reviews table and CSV). */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: groupByQuerySchema }, async ({ ctx, query }) => {
  const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getThemeInsights(tx, visible, query, env.exportTimeZone)));
});
