import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import type { ExtractLocationRow, ExtractState } from "@/lib/schemas/extract";

/** Locations the caller can see, with their client(s) and extraction progress. */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"] }, async ({ ctx }) => {
  const isAdmin = ctx.profile.role === "admin";
  const visible = isAdmin ? null : await getAccessibleLocationIds(ctx);
  const rows = await ctx.db(async (tx) => {
    const locations = await tx.locations.findMany({
      where: { removed_at: null, ...(visible ? { id: { in: visible }, is_active: true } : {}) },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, address: true, branch_prefix: true, region: true, location_type: true, google_rating: true, google_checked_at: true, is_active: true, source_review_count: true, sync_cursor: true,
        backfill_completed_at: true, last_synced_at: true, sync_locked_until: true,
        group_members: { select: { group: { select: { id: true, name: true } } } },
      },
    });
    const ids = locations.map((l) => l.id);
    const counts = await tx.reviews.groupBy({ by: ["location_id"], where: { location_id: { in: ids } }, _count: { _all: true } });
    // Latest per-location run, to surface a failing location.
    const lastRuns = await tx.$queryRaw<{ location_id: string; status: string; error: string | null }[]>`
      select distinct on (location_id) location_id, status, error
      from public.sync_runs where location_id = any(${ids}::uuid[])
      order by location_id, started_at desc`;
    const countBy = new Map(counts.map((c) => [c.location_id, c._count._all]));
    const runBy = new Map(lastRuns.map((r) => [r.location_id, r]));
    const now = Date.now();

    return locations.map<ExtractLocationRow>((l) => {
      const last = runBy.get(l.id);
      const state: ExtractState =
        l.sync_locked_until && l.sync_locked_until.getTime() > now
          ? "extracting"
          : last?.status === "failed"
            ? "error"
            : l.backfill_completed_at === null
              ? l.last_synced_at || l.sync_cursor ? "backfilling" : "never"
              : l.sync_cursor ? "catching_up" : "up_to_date";
      return {
        id: l.id, name: l.name, address: l.address, branch_prefix: l.branch_prefix, region: l.region, location_type: l.location_type, is_active: l.is_active,
        google_rating: l.google_rating === null ? null : Number(l.google_rating), google_checked_at: l.google_checked_at?.toISOString() ?? null,
        clients: l.group_members.map((m) => m.group),
        review_count: countBy.get(l.id) ?? 0,
        source_review_count: l.source_review_count,
        state,
        last_error: state === "error" && isAdmin ? last?.error ?? null : null,
        last_synced_at: l.last_synced_at?.toISOString() ?? null,
      };
    });
  });
  return ok(rows);
});
