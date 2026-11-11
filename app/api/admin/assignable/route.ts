import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import type { AssignableOptions } from "@/lib/schemas/admin";

// Options for the assignment dialog: all non-removed locations and all groups.
export const GET = withAuth({ roles: ["admin"] }, async ({ ctx }) => {
  const result: AssignableOptions = await ctx.db(async (tx) => ({
    locations: await tx.locations.findMany({
      where: { removed_at: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    groups: await tx.location_groups.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  }));
  return ok(result);
});
