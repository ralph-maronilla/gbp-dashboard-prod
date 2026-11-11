import "server-only";
import { Errors } from "./errors";
import type { AuthContext } from "./with-auth";

/**
 * Location ids the caller may see. Admins: all. Others: directly assigned locations
 * plus members of assigned groups. Every handler that takes a location id from the
 * client must go through this (or assertLocationAccess); RLS is the second layer.
 */
export async function getAccessibleLocationIds(ctx: AuthContext): Promise<string[]> {
  const { profile } = ctx;
  return ctx.db(async (tx) => {
    if (profile.role === "admin") {
      return (await tx.locations.findMany({ select: { id: true } })).map((l) => l.id);
    }
    const assignments = await tx.user_locations.findMany({
      where: { user_id: profile.id },
      select: { location_id: true, group_id: true },
    });
    const ids = new Set<string>();
    const groupIds: string[] = [];
    for (const a of assignments) {
      if (a.location_id) ids.add(a.location_id);
      if (a.group_id) groupIds.push(a.group_id);
    }
    if (groupIds.length > 0) {
      const members = await tx.location_group_members.findMany({
        where: { group_id: { in: groupIds } },
        select: { location_id: true },
      });
      for (const m of members) ids.add(m.location_id);
    }
    return [...ids];
  });
}

/** Returns 404 (not 403) for inaccessible ids so existence is not revealed. */
export async function assertLocationAccess(ctx: AuthContext, locationId: string): Promise<void> {
  if (ctx.profile.role === "admin") return;
  const accessible = await getAccessibleLocationIds(ctx);
  if (!accessible.includes(locationId)) throw Errors.notFound();
}
