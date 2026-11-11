import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db/with-rls";
import type {
  FailedSync,
  GroupSummary,
  ListLocationsQuery,
  LocationRow,
  LocationSortField,
  LocationsPage,
  OverviewStats,
} from "@/lib/schemas/locations";

/**
 * Read queries for the overview. All run inside `ctx.db` (RLS-scoped transaction); `visibleIds` is the
 * caller's allowed set from getAccessibleLocationIds, or null for admins (everything).
 * Aggregation is done in SQL, never by loading reviews into Node.
 */

const SORT_COLUMNS: Record<LocationSortField, Prisma.Sql> = {
  name: Prisma.sql`v.name`,
  avg_rating: Prisma.sql`a.avg_rating`,
  total_reviews: Prisma.sql`coalesce(a.total_reviews, 0)`,
  new_reviews_7d: Prisma.sql`coalesce(a.new_reviews_7d, 0)`,
  unanswered: Prisma.sql`coalesce(a.unanswered, 0)`,
  low_rating: Prisma.sql`coalesce(a.low_rating, 0)`,
};

function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** CTE of locations this caller can see on the overview (active, not removed), with optional filters. */
function visibleCte(visibleIds: string[] | null, q?: string, groupId?: string) {
  const scope = visibleIds === null ? Prisma.sql`true` : Prisma.sql`l.id = any(${visibleIds}::uuid[])`;
  const search = q
    ? Prisma.sql`and (l.name ilike ${`%${escapeLike(q)}%`} or l.address ilike ${`%${escapeLike(q)}%`})`
    : Prisma.empty;
  const group = groupId
    ? Prisma.sql`and exists (select 1 from public.location_group_members m where m.group_id = ${groupId}::uuid and m.location_id = l.id)`
    : Prisma.empty;
  return Prisma.sql`visible as (
    select l.id, l.name, l.address, l.last_synced_at
    from public.locations l
    where l.is_active and l.removed_at is null and ${scope} ${search} ${group}
  )`;
}

const AGG_CTE = Prisma.sql`agg as (
  select r.location_id,
    count(*)::int as total_reviews,
    round(avg(r.rating)::numeric, 2)::float8 as avg_rating,
    (count(*) filter (where r.create_time >= now() - interval '7 days'))::int as new_reviews_7d,
    (count(*) filter (where r.reply_comment is null))::int as unanswered,
    (count(*) filter (where r.rating <= 2))::int as low_rating
  from public.reviews r
  join visible v on v.id = r.location_id
  group by r.location_id
)`;

interface RawRow {
  id: string;
  name: string;
  address: string | null;
  last_synced_at: Date | null;
  avg_rating: number | null;
  total_reviews: number;
  new_reviews_7d: number;
  unanswered: number;
  low_rating: number;
}

export async function listLocations(tx: Tx, visibleIds: string[] | null, query: ListLocationsQuery): Promise<LocationsPage> {
  if (visibleIds !== null && visibleIds.length === 0) {
    return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
  }
  const visible = visibleCte(visibleIds, query.q, query.group_id);
  const direction = query.order === "asc" ? Prisma.sql`asc` : Prisma.sql`desc`;

  const [rows, totalRows] = await Promise.all([
    tx.$queryRaw<RawRow[]>`
      with ${visible}, ${AGG_CTE}
      select v.id, v.name, v.address, v.last_synced_at,
        a.avg_rating,
        coalesce(a.total_reviews, 0)::int as total_reviews,
        coalesce(a.new_reviews_7d, 0)::int as new_reviews_7d,
        coalesce(a.unanswered, 0)::int as unanswered,
        coalesce(a.low_rating, 0)::int as low_rating
      from visible v left join agg a on a.location_id = v.id
      order by ${SORT_COLUMNS[query.sort]} ${direction} nulls last, v.name asc, v.id asc
      limit ${query.pageSize} offset ${query.page * query.pageSize}`,
    tx.$queryRaw<{ total: number }[]>`with ${visible} select count(*)::int as total from visible`,
  ]);

  // 12-week sparkline, only for the ids on this page.
  const pageIds = rows.map((r) => r.id);
  const trends = new Map<string, (number | null)[]>();
  if (pageIds.length > 0) {
    const weekly = await tx.$queryRaw<{ location_id: string; weeks_ago: number; avg_rating: number }[]>`
      select r.location_id,
        floor(extract(epoch from (date_trunc('week', now()) - date_trunc('week', r.create_time))) / 604800)::int as weeks_ago,
        round(avg(r.rating)::numeric, 2)::float8 as avg_rating
      from public.reviews r
      where r.location_id = any(${pageIds}::uuid[]) and r.create_time >= date_trunc('week', now()) - interval '11 weeks'
      group by 1, 2`;
    for (const id of pageIds) trends.set(id, Array<number | null>(12).fill(null));
    for (const w of weekly) {
      const series = trends.get(w.location_id);
      const idx = 11 - w.weeks_ago;
      if (series && idx >= 0 && idx < 12) series[idx] = w.avg_rating;
    }
  }

  return {
    rows: rows.map<LocationRow>((r) => ({
      ...r,
      last_synced_at: r.last_synced_at?.toISOString() ?? null,
      trend: trends.get(r.id) ?? Array<number | null>(12).fill(null),
    })),
    total: totalRows[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getOverviewStats(tx: Tx, visibleIds: string[] | null, isAdmin: boolean): Promise<OverviewStats> {
  const empty = visibleIds !== null && visibleIds.length === 0;
  const visible = visibleCte(visibleIds);

  const totals = empty
    ? []
    : await tx.$queryRaw<
        { location_count: number; total_reviews: number; avg_rating: number | null; new_reviews_7d: number; unanswered: number; low_rating: number }[]
      >`
      with ${visible}, ${AGG_CTE}
      select (select count(*)::int from visible) as location_count,
        coalesce(sum(a.total_reviews), 0)::int as total_reviews,
        round((sum(a.avg_rating * a.total_reviews) / nullif(sum(a.total_reviews), 0))::numeric, 2)::float8 as avg_rating,
        coalesce(sum(a.new_reviews_7d), 0)::int as new_reviews_7d,
        coalesce(sum(a.unanswered), 0)::int as unanswered,
        coalesce(sum(a.low_rating), 0)::int as low_rating
      from agg a`;
  const t = totals[0];

  const lastSynced = empty
    ? []
    : await tx.$queryRaw<{ last_synced_at: Date | null }[]>`
      with ${visible} select max(l.last_synced_at) as last_synced_at
      from public.locations l join visible v on v.id = l.id`;

  // Failed runs from the last 7 days; non-admins only see runs for their own locations, and never the error text.
  const failed = await tx.sync_runs.findMany({
    where: {
      status: "failed",
      started_at: { gte: new Date(Date.now() - 7 * 86_400_000) },
      ...(isAdmin ? {} : { location_id: { in: visibleIds ?? [] } }),
    },
    orderBy: { started_at: "desc" },
    take: 10,
    select: { id: true, started_at: true, location_id: true, error: true, location: { select: { name: true } } },
  });

  return {
    location_count: t?.location_count ?? 0,
    total_reviews: t?.total_reviews ?? 0,
    avg_rating: t?.avg_rating ?? null,
    new_reviews_7d: t?.new_reviews_7d ?? 0,
    unanswered: t?.unanswered ?? 0,
    low_rating: t?.low_rating ?? 0,
    sync: {
      last_synced_at: lastSynced[0]?.last_synced_at?.toISOString() ?? null,
      failed_runs: failed.map<FailedSync>((f) => ({
        id: f.id,
        started_at: f.started_at.toISOString(),
        location_id: f.location_id,
        location_name: f.location?.name ?? null,
        error: isAdmin ? f.error : null,
      })),
    },
  };
}

/** Groups the caller can see (RLS), with the number of active locations they can see inside each. */
export async function listGroups(tx: Tx, visibleIds: string[] | null): Promise<GroupSummary[]> {
  const groups = await tx.location_groups.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (groups.length === 0) return [];
  const counts = await tx.location_group_members.groupBy({
    by: ["group_id"],
    where: {
      group_id: { in: groups.map((g) => g.id) },
      location: { is_active: true, removed_at: null },
      ...(visibleIds === null ? {} : { location_id: { in: visibleIds } }),
    },
    _count: { _all: true },
  });
  const byGroup = new Map(counts.map((c) => [c.group_id, c._count._all]));
  return groups.map((g) => ({ ...g, location_count: byGroup.get(g.id) ?? 0 }));
}
