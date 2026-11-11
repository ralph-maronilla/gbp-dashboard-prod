import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { getOverviewStats } from "@/server/data/locations";

export const GET = withAuth({ roles: ["admin", "manager", "viewer"] }, async ({ ctx }) => {
  const isAdmin = ctx.profile.role === "admin";
  const visibleIds = isAdmin ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getOverviewStats(tx, visibleIds, isAdmin)));
});
