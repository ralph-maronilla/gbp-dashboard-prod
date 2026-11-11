import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { getCompareInsights } from "@/server/data/compare";
import { env } from "@/server/env";
import { compareQuerySchema } from "@/lib/schemas/insights";

/** Dashboard Compare tab: two months side by side, limited to the caller's locations. */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: compareQuerySchema }, async ({ ctx, query }) => {
  const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getCompareInsights(tx, visible, query, env.exportTimeZone)));
});
