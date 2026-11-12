import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { Errors } from "@/server/api/errors";
import { updateUserSchema, userIdParamsSchema } from "@/lib/schemas/admin";
import type { Prisma } from "@/generated/prisma/client";

export const PATCH = withAuth(
  {
    roles: ["admin"],
    params: userIdParamsSchema,
    body: updateUserSchema,
    rateLimit: { key: "admin", limit: 30, windowSec: 60 },
  },
  async ({ ctx, params, body }) => {
    // Prevent lock-out: admins cannot change their own role or status (or extraction access, which admins always have).
    if (params.id === ctx.profile.id) throw Errors.conflict("You cannot change your own role or status");

    const data: Prisma.profilesUncheckedUpdateInput =
      body.action === "approve"
        ? { status: "approved", approved_by: ctx.profile.id, approved_at: new Date() }
        : body.action === "reject"
          ? { status: "rejected", approved_by: null, approved_at: null }
          : body.action === "set_role"
            ? { role: body.role }
            : { can_extract: body.value };

    // Update and audit entry commit together or not at all.
    const updated = await ctx.db(async (tx) => {
      const before = await tx.profiles.findUnique({
        where: { id: params.id },
        select: { role: true, status: true, can_extract: true },
      });
      if (!before) throw Errors.notFound();

      // Never leave the app without an approved admin (two admins demoting each other at once would).
      const losesAdmin = before.role === "admin" && before.status === "approved" && (body.action === "reject" || (body.action === "set_role" && body.role !== "admin"));
      if (losesAdmin && (await tx.profiles.count({ where: { role: "admin", status: "approved", id: { not: params.id } } })) === 0) {
        throw Errors.conflict("This is the last approved admin");
      }

      const after = await tx.profiles.update({
        where: { id: params.id },
        data,
        select: { id: true, email: true, full_name: true, role: true, status: true, can_extract: true, created_at: true, approved_at: true },
      });
      await tx.audit_log.create({
        data: {
          actor_id: ctx.profile.id,
          action: `user.${body.action}`,
          target: params.id,
          details: { before, after: { role: after.role, status: after.status, can_extract: after.can_extract } },
        },
      });
      return after;
    });

    return ok(updated);
  },
);
