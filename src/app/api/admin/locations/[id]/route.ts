import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import { deleteLocation, nameKey, setLocationGroups } from "@/server/data/locations-admin";
import { locationIdParamsSchema, updateLocationSchema } from "@/lib/schemas/export";
import { Prisma } from "@/generated/prisma/client";

/** Admin edits: name, address, branch prefix (CSV export), region/type (dashboard), active flag and clients. */
export const PATCH = withAuth(
  { roles: ["admin"], params: locationIdParamsSchema, body: updateLocationSchema, rateLimit: { key: "admin", limit: 60, windowSec: 60 } },
  async ({ ctx, params, body }) => {
    const { group_ids, ...fields } = body;
    const select = { id: true, branch_prefix: true, is_active: true, name: true, address: true, region: true, location_type: true } as const;
    // Update, client changes and audit entry commit together or not at all.
    const result = await ctx
      .db(async (tx) => {
      const before = await tx.locations.findUnique({ where: { id: params.id }, select: { ...select, group_members: { select: { group_id: true } } } });
      if (!before) throw Errors.notFound();
      if (fields.name && nameKey(fields.name) !== nameKey(before.name)) {
        const clash = (await tx.locations.findMany({ where: { id: { not: params.id } }, select: { name: true } })).some((l) => nameKey(l.name) === nameKey(fields.name as string));
        if (clash) throw Errors.conflict("Another location already has this name");
      }
      const { group_members, ...beforeFields } = before;
      const after = Object.keys(fields).length > 0 ? await tx.locations.update({ where: { id: params.id }, data: fields, select }) : beforeFields;
      if (group_ids) await setLocationGroups(tx, params.id, group_ids);
      await tx.audit_log.create({
        data: {
          actor_id: ctx.profile.id,
          action: "location.updated",
          target: params.id,
          details: { before: beforeFields, after, ...(group_ids ? { group_ids: { before: group_members.map((m) => m.group_id), after: [...new Set(group_ids)] } } : {}) },
        },
      });
      return after;
    })
      .catch((err) => {
        // The unique index on lower(btrim(name)) (migration 0010) is the backstop for the check below.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw Errors.conflict("Another location already has this name");
        throw err;
      });
    return ok(result);
  },
);

/** Permanently deletes the location, its reviews and its history. Refused while it is being extracted. */
export const DELETE = withAuth(
  { roles: ["admin"], params: locationIdParamsSchema, rateLimit: { key: "admin-delete-location", limit: 10, windowSec: 60 } },
  async ({ ctx, params }) => {
    return ok(await deleteLocation(params.id, ctx.profile.id));
  },
);
