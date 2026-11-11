import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import { listGroups } from "@/lib/data/locations";

export const GET = withAuth({ roles: ["admin", "manager", "viewer"] }, async ({ ctx }) => {
  const visibleIds = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => listGroups(tx, visibleIds)));
});
