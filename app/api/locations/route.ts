import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import { listLocations } from "@/lib/data/locations";
import { listLocationsQuerySchema } from "@/lib/schemas/locations";

export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: listLocationsQuerySchema }, async ({ ctx, query }) => {
  const visibleIds = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  return ok(await ctx.db((tx) => listLocations(tx, visibleIds, query)));
});
