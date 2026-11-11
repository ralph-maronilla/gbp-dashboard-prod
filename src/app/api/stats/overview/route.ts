import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import { getOverviewStats } from "@/lib/data/locations";

export const GET = withAuth({ roles: ["admin", "manager", "viewer"] }, async ({ ctx }) => {
  const isAdmin = ctx.profile.role === "admin";
  const visibleIds = isAdmin ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => getOverviewStats(tx, visibleIds, isAdmin)));
});
