import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { getThemeReviews } from "@/server/data/insights";
import { env } from "@/server/env";
import { themeReviewsQuerySchema } from "@/lib/schemas/insights";

/** Review Intelligence: the reviews that mention one theme, by location. Same visibility as the themes tab. */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: themeReviewsQuerySchema }, async ({ ctx, query }) => {
  const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getThemeReviews(tx, visible, query, env.exportTimeZone)));
});
