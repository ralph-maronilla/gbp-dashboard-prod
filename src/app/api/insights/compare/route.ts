import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import { getCompareInsights } from "@/lib/data/compare";
import { env } from "@/lib/env";
import { compareQuerySchema } from "@/lib/schemas/insights";

/** Dashboard Compare tab: two months side by side, limited to the caller's locations. */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: compareQuerySchema }, async ({ ctx, query }) => {
  const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getCompareInsights(tx, visible, query, env.exportTimeZone)));
});
