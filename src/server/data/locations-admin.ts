import "server-only";
import { Errors } from "@/server/api/errors";
import { getPrisma } from "@/server/db/prisma";
import type { Tx } from "@/server/db/with-rls";

/** Same length as the extraction claim (lib/sync/engine.ts), long enough to finish a delete. */
const DELETE_CLAIM_MS = 2 * 60_000;

/**
 * Permanently deletes a location with everything that hangs off it: reviews and sync history (no ON DELETE CASCADE in
 * the schema, so deleted explicitly), then the location row, which cascades to client memberships and user assignments.
 *
 * It first takes the extraction lock (`sync_locked_until`), so an extraction can't be reading the location while it is
 * deleted, and a location that is being extracted right now is refused instead of racing it.
 *
 * The audit entry is written in the same transaction, so a delete is never left unlogged.
 *
 * SECURITY: uses the privileged client (bypasses RLS). Only call from a route that already enforced `roles: ["admin"]`.
 */
export async function deleteLocation(id: string, actorId: string): Promise<{ name: string; gbp_location_id: string; reviews_deleted: number }> {
  const prisma = getPrisma();
  const claimed = await prisma.$queryRaw<{ name: string; gbp_location_id: string }[]>`
    update public.locations
    set sync_locked_until = now() + ${`${DELETE_CLAIM_MS} milliseconds`}::interval
    where id = ${id}::uuid and (sync_locked_until is null or sync_locked_until < now())
    returning name, gbp_location_id`;
  const loc = claimed[0];
  if (!loc) {
    // Either it doesn't exist or someone holds the lock.
    if (!(await prisma.locations.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound();
    throw Errors.conflict("This location is being extracted (or deleted) right now. Wait a moment, or stop the extraction, then try again.");
  }

  try {
    const reviews_deleted = await prisma.$transaction(
      async (tx) => {
        const reviews = await tx.reviews.deleteMany({ where: { location_id: id } });
        await tx.sync_runs.deleteMany({ where: { location_id: id } });
        await tx.locations.delete({ where: { id } }); // cascades location_group_members and user_locations
        await tx.audit_log.create({
          data: { actor_id: actorId, action: "location.deleted", target: id, details: { name: loc.name, gbp_location_id: loc.gbp_location_id, reviews_deleted: reviews.count } },
        });
        return reviews.count;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    return { name: loc.name, gbp_location_id: loc.gbp_location_id, reviews_deleted };
  } catch (err) {
    // Nothing was deleted (transaction rolled back): release the lock so the location is usable again.
    await prisma.locations.update({ where: { id }, data: { sync_locked_until: null } }).catch(() => undefined);
    throw err;
  }
}

/** Replaces which clients (groups) a location belongs to. Runs in the caller's transaction (RLS: admins only). */
export async function setLocationGroups(tx: Tx, locationId: string, groupIds: string[]): Promise<void> {
  const ids = [...new Set(groupIds)];
  if (ids.length > 0 && (await tx.location_groups.count({ where: { id: { in: ids } } })) !== ids.length) {
    throw Errors.badRequest("Unknown client");
  }
  await tx.location_group_members.deleteMany({ where: { location_id: locationId } });
  if (ids.length > 0) {
    await tx.location_group_members.createMany({ data: ids.map((group_id) => ({ group_id, location_id: locationId })) });
  }
}

// ---- Location identity -----------------------------------------------------------------------------------------
// A location is the same as another when it is the same Maps place (same CID, enforced by the unique gbp_location_id)
// or has the same name ignoring case and spacing (unique index on lower(btrim(name)), migration 0010). Names matter
// because the table and the CSV's branch column fall back to them.

/** Trim and collapse inner whitespace, so "Healthway  Lio " and "healthway lio" are recognised as the same name. */
export function normalizeLocationName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export const nameKey = (name: string) => normalizeLocationName(name).toLowerCase();

/**
 * A name that is not in `taken` (lower-cased keys). The wanted name is used as is when free; otherwise the city taken
 * from the address is appended, then the CID tail, then a counter, so this always terminates with a unique name.
 * Adds the chosen name to `taken`.
 */
export function uniqueLocationName(wanted: string, address: string | null, cid: string, taken: Set<string>): { name: string; renamed: boolean } {
  const base = normalizeLocationName(wanted) || `Location ${cid}`;
  const parts = (address ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  const candidates = [base, ...(city ? [`${base} (${city})`] : []), `${base} (${cid.slice(-6)})`];
  for (let i = 2; candidates.length < 50; i++) candidates.push(`${base} (${cid.slice(-6)}-${i})`);
  const name = candidates.find((c) => !taken.has(nameKey(c))) ?? `${base} (${cid})`;
  taken.add(nameKey(name));
  return { name, renamed: name !== base };
}
