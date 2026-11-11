import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { assertLocationAccess } from "@/server/api/location-access";
import { listLocationReviews } from "@/server/data/location-detail";
import { locationIdParamsSchema, reviewsQuerySchema } from "@/lib/schemas/location-detail";

export const GET = withAuth(
  { roles: ["admin", "manager", "viewer"], params: locationIdParamsSchema, query: reviewsQuerySchema },
  async ({ ctx, params, query }) => {
    await assertLocationAccess(ctx, params.id);
    const isAdmin = ctx.profile.role === "admin";
    return ok(await ctx.db((tx) => listLocationReviews(tx, params.id, query, isAdmin)));
  },
);
