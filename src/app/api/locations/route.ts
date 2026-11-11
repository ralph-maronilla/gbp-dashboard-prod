import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { listLocations } from "@/server/data/locations";
import { listLocationsQuerySchema } from "@/lib/schemas/locations";

export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: listLocationsQuerySchema }, async ({ ctx, query }) => {
  const visibleIds = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => listLocations(tx, visibleIds, query)));
});
