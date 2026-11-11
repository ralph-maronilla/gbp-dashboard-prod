import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { assertLocationAccess } from "@/lib/api/location-access";
import { getLocationDetail } from "@/lib/data/location-detail";
import { locationDetailQuerySchema, locationIdParamsSchema } from "@/lib/schemas/location-detail";

export const GET = withAuth(
  { roles: ["admin", "manager", "viewer"], params: locationIdParamsSchema, query: locationDetailQuerySchema },
  async ({ ctx, params, query }) => {
    await assertLocationAccess(ctx, params.id); // 404 (not 403) when the id isn't assigned to the caller
    const isAdmin = ctx.profile.role === "admin";
    return ok(await ctx.db((tx) => getLocationDetail(tx, params.id, query.granularity, isAdmin)));
  },
);
