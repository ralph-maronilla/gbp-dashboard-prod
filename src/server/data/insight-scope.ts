import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { startOfDayInZone } from "@/lib/export/reviews-csv";
import type { Tx } from "@/lib/db/with-rls";
import { areaOf, PH_REGIONS } from "@/lib/ph-regions";
import { LAST_MONTH, UNASSIGNED, type GroupBy, type InsightsQuery } from "@/lib/schemas/insights";

/** "YYYY-MM" of `date` in `timeZone`. */
export function monthOf(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

/** The `count` calendar months ending with the current one, oldest first, as "YYYY-MM". */
export function monthRange(now: Date, count: number, timeZone: string): string[] {
  const [y, m] = monthOf(now, timeZone).split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

export interface InsightScope {
  /** False when the caller can't see anything that matches (skip the queries). */
  any: boolean;
  /** Locations in scope; alias `l`. */
  location: Prisma.Sql;
  /** Reviews in scope; aliases `r` (reviews) joined to `l` (locations). */
  review: Prisma.Sql;
  /** Start of the period, or null for all time. */
  from: Date | null;
  /** End of the period (exclusive); null = now. Set only for LAST_MONTH. */
  to: Date | null;
  /** The period of the same length just before this one, for comparisons; null for all time. */
  prev: { from: Date; to: Date } | null;
}

/** First day of the month `offset` months from the current one ("YYYY-MM-01" in `timeZone`, as a Date). */
const monthStart = (now: Date, offset: number, timeZone: string) =>
  startOfDayInZone(`${monthRange(now, 1 - offset, timeZone)[0]}-01`, timeZone);

/** `[from, to)` of a calendar month ("YYYY-MM") in `timeZone`. */
export function monthBounds(month: string, timeZone: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: startOfDayInZone(`${month}-01`, timeZone), to: startOfDayInZone(`${next}-01`, timeZone) };
}

const labelClause = (column: Prisma.Sql, value: string | undefined) =>
  value === undefined ? Prisma.empty : value === UNASSIGNED ? Prisma.sql`and ${column} is null` : Prisma.sql`and lower(${column}) = lower(${value})`;

/**
 * Which locations and reviews a Dashboard query covers. Same visibility as the reviews table and CSV
 * (lib/data/reviews.ts buildReviewWhere): admins (`visibleIds` null) see every location, others only their active
 * ones. Filters: client group, location, region, type, and the period (whole calendar months in `timeZone`).
 */
export function insightScope(visibleIds: string[] | null, query: InsightsQuery, timeZone: string, now = new Date()): InsightScope {
  const ids =
    visibleIds === null
      ? query.location_id
        ? [query.location_id]
        : null
      : query.location_id
        ? visibleIds.filter((id) => id === query.location_id)
        : visibleIds;
  // N months = this month and the N-1 before it; LAST_MONTH = the whole previous month. The comparison period has the
  // same number of calendar months and ends where this one starts.
  const span = query.months === LAST_MONTH ? 1 : query.months;
  const end = query.months === LAST_MONTH ? 0 : 1;
  const from = span > 0 ? monthStart(now, end - span, timeZone) : null;
  const to = query.months === LAST_MONTH ? monthStart(now, 0, timeZone) : null;
  const prev = from ? { from: monthStart(now, end - 2 * span, timeZone), to: from } : null;

  const location = Prisma.sql`l.removed_at is null
    ${ids === null ? Prisma.empty : Prisma.sql`and l.id = any(${ids}::uuid[])`}
    ${visibleIds === null ? Prisma.empty : Prisma.sql`and l.is_active`}
    ${query.group_id ? Prisma.sql`and exists (select 1 from public.location_group_members m where m.group_id = ${query.group_id}::uuid and m.location_id = l.id)` : Prisma.empty}
    ${labelClause(Prisma.sql`l.region`, query.region)}
    ${query.island ? Prisma.sql`and l.region = any(${PH_REGIONS.filter((r) => r.island === query.island).map((r) => r.code)}::text[])` : Prisma.empty}
    ${labelClause(Prisma.sql`l.location_type`, query.location_type)}`;
  const sc = { from, to, prev };
  const review = Prisma.sql`${location} ${periodJoin(sc)}`;
  return { any: ids === null || ids.length > 0, location, review, ...sc };
}

/** `and r.create_time …` bounds of the period, for joins and filters on reviews (alias `r`). */
export function periodJoin(sc: Pick<InsightScope, "from" | "to">): Prisma.Sql {
  return Prisma.sql`${sc.from ? Prisma.sql`and r.create_time >= ${sc.from}` : Prisma.empty} ${sc.to ? Prisma.sql`and r.create_time < ${sc.to}` : Prisma.empty}`;
}


/** Island group of `l.region` in SQL (from the region list), null when the region is not set. */
const ISLAND_SQL = Prisma.sql`case ${Prisma.join(
  (["Luzon", "Visayas", "Mindanao"] as const).map((island) => Prisma.sql`when l.region = any(${PH_REGIONS.filter((r) => r.island === island).map((r) => r.code)}::text[]) then ${island}`),
  " ",
)} end`;

/** Segment of a location (SEGMENT_ORDER) from its Type and Region; null when the type is not set or unknown. */
const SEGMENT_SQL = Prisma.sql`case
  when lower(l.location_type) = 'hospital' and l.region = 'NCR' then 'Metro Hospitals'
  when lower(l.location_type) = 'hospital' and l.region is not null then 'Provincial Hospitals'
  when lower(l.location_type) in ('outpatient center', 'clinic') then 'Outpatient Centers'
  when lower(l.location_type) in ('specialty center', 'diagnostic center') then 'Specialty Centers'
end`;

/**
 * SQL expression for a Dashboard grouping (alias `l`). The area depends on the address (lib/ph-regions.ts areaOf), so
 * it is worked out here for every location and passed to SQL as a `case` on the location id.
 */
export async function groupColumn(tx: Tx, groupBy: GroupBy): Promise<Prisma.Sql> {
  if (groupBy === "region") return Prisma.sql`l.region`;
  if (groupBy === "island") return ISLAND_SQL;
  if (groupBy === "type") return Prisma.sql`l.location_type`;
  if (groupBy === "segment") return SEGMENT_SQL;
  const rows = await tx.$queryRaw<{ id: string; region: string | null; address: string | null }[]>`
    select id, region, address from public.locations where removed_at is null`;
  const cases = rows.flatMap((r) => {
    const area = areaOf(r.region, r.address);
    return area ? [Prisma.sql`when ${r.id}::uuid then ${area}`] : [];
  });
  return cases.length === 0 ? Prisma.sql`null::text` : Prisma.sql`(case l.id ${Prisma.join(cases, " ")} end)`;
}
