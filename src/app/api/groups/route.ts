import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { listGroups } from "@/server/data/locations";

export const GET = withAuth({ roles: ["admin", "manager", "viewer"] }, async ({ ctx }) => {
  const visibleIds = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => listGroups(tx, visibleIds)));
});
