import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import { setUserLocationsSchema, userIdParamsSchema } from "@/lib/schemas/admin";

export const PUT = withAuth(
  {
    roles: ["admin"],
    params: userIdParamsSchema,
    body: setUserLocationsSchema,
    rateLimit: { key: "admin", limit: 30, windowSec: 60 },
  },
  async ({ ctx, params, body }) => {
    const locationIds = [...new Set(body.location_ids)];
    const groupIds = [...new Set(body.group_ids)];

    // One transaction: validation, replace and audit entry are atomic.
    await ctx.db(async (tx) => {
      const target = await tx.profiles.findUnique({ where: { id: params.id }, select: { id: true } });
      if (!target) throw Errors.notFound();

      // Reject ids that don't exist instead of surfacing a foreign-key error.
      if (locationIds.length > 0 && (await tx.locations.count({ where: { id: { in: locationIds } } })) !== locationIds.length) {
        throw Errors.badRequest("Unknown location id");
      }
      if (groupIds.length > 0 && (await tx.location_groups.count({ where: { id: { in: groupIds } } })) !== groupIds.length) {
        throw Errors.badRequest("Unknown group id");
      }

      await tx.user_locations.deleteMany({ where: { user_id: params.id } });
      await tx.user_locations.createMany({
        data: [
          ...locationIds.map((location_id) => ({ user_id: params.id, location_id })),
          ...groupIds.map((group_id) => ({ user_id: params.id, group_id })),
        ],
      });
      await tx.audit_log.create({
        data: {
          actor_id: ctx.profile.id,
          action: "user.assignments_changed",
          target: params.id,
          details: { location_ids: locationIds, group_ids: groupIds },
        },
      });
    });

    return ok({ location_ids: locationIds, group_ids: groupIds });
  },
);
