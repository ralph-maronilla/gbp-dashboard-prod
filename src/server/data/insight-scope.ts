import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { startOfDayInZone } from "@/lib/export/reviews-csv";
import type { Tx } from "@/server/db/with-rls";
import { areaOf, PH_REGIONS } from "@/lib/ph-regions";
import { Errors } from "@/server/api/errors";
import {
  addDays,
  comparedRange,
  presetMonths,
  rangeDays,
  rangeLabel,
  resolvePeriod,
  todayIn,
  type DayRange,
  type Period,
} from "@/lib/insights/date-ranges";
import { UNASSIGNED, type CompareSide, type GroupBy, type InsightsQuery } from "@/lib/schemas/insights";

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
  /** End of the period (exclusive); null = now (the period runs to today, or all time). */
  to: Date | null;
  /** The comparison period (the chosen `vs`, else the period just before); null for all time. */
  prev: { from: Date; to: Date } | null;
  period: Period;
  /** The comparison period as days, and how the highlights name it ("the previous 12 months", "Sep 1 – 30, 2026"). */
  prevRange: DayRange | null;
  prevLabel: string | null;
  /** Length of a bounded period in months (whole months for month presets), for per-month rates; null when open-ended. */
  lengthMonths: number | null;
}

const MAX_DAYS = 5 * 366;

/**
 * Server-side options on a Dashboard query (never from the URL). `wholeRange`: count a period that runs to today as a
 * closed range (its figures cover the whole period, not "the last 30 / 90 days"), so it compares like for like with a
 * past range. `noCompare`: this query is itself the compared side; it has nothing to compare with.
 */
export interface ScopeOptions {
  wholeRange?: boolean;
  noCompare?: boolean;
}
type Scoped = { _scope?: ScopeOptions };
const optionsOf = (query: object): ScopeOptions => (query as Scoped)._scope ?? {};

/**
 * The Dashboard period of a request and what it is compared with, in `timeZone` days. Rejects ranges with one end, ends
 * before starts, after today, or longer than five years, and custom comparisons without both dates.
 */
export function resolveInsightPeriod(query: InsightsQuery, timeZone: string, now = new Date()) {
  const today = todayIn(timeZone, now);
  if (!query.from !== !query.to) throw Errors.badRequest("Give both `from` and `to`");
  const period = resolvePeriod(query, today);
  const check = (r: DayRange, what: string) => {
    if (r.from > r.to) throw Errors.badRequest(`The ${what} must not end before it starts`);
    if (r.to > today) throw Errors.badRequest(`The ${what} cannot end after today (${today})`);
    if (rangeDays(r) > MAX_DAYS) throw Errors.badRequest(`The ${what} can be at most five years long`);
  };
  if (period.range) check(period.range, "date range");

  let prevRange: DayRange | null = null;
  let prevLabel: string | null = null;
  if (optionsOf(query).noCompare) {
    // The compared side of withCompare: no comparison of its own.
  } else if (query.vs === "custom") {
    if (!query.vs_from || !query.vs_to) throw Errors.badRequest("A custom comparison needs `vs_from` and `vs_to`");
    prevRange = { from: query.vs_from, to: query.vs_to };
    check(prevRange, "compared range");
    prevLabel = rangeLabel(prevRange);
  } else if (period.range) {
    prevRange = comparedRange(period.range, query.vs ?? "previous", period.preset);
    const months = presetMonths(period.preset);
    const days = rangeDays(period.range);
    prevLabel =
      query.vs === "year"
        ? `the same dates last year (${rangeLabel(prevRange)})`
        : months
          ? months === 1 ? "the month before" : `the previous ${months} months`
          : days === 1 ? "the day before" : `the previous ${days} days`;
  }
  return { today, period, prevRange, prevLabel };
}

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
 * ones. Filters: client group, location, region, type, and the period (days in `timeZone`, see resolveInsightPeriod).
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
  const { today, period, prevRange, prevLabel } = resolveInsightPeriod(query, timeZone, now);
  const dayStart = (day: string) => startOfDayInZone(day, timeZone);
  const from = period.range ? dayStart(period.range.from) : null;
  // A period that runs to today has no end, so reviews posted today count (with wholeRange: it ends tonight, which counts
  // the same reviews but makes the figures cover the whole period).
  const to = period.range && (period.range.to < today || optionsOf(query).wholeRange) ? dayStart(addDays(period.range.to, 1)) : null;
  const prev = prevRange ? { from: dayStart(prevRange.from), to: dayStart(addDays(prevRange.to, 1)) } : null;
  const lengthMonths = period.range && to ? (presetMonths(period.preset) ?? rangeDays(period.range) / 30.4375) : null;

  const location = Prisma.sql`l.removed_at is null
    ${ids === null ? Prisma.empty : Prisma.sql`and l.id = any(${ids}::uuid[])`}
    ${visibleIds === null ? Prisma.empty : Prisma.sql`and l.is_active`}
    ${query.group_id ? Prisma.sql`and exists (select 1 from public.location_group_members m where m.group_id = ${query.group_id}::uuid and m.location_id = l.id)` : Prisma.empty}
    ${labelClause(Prisma.sql`l.region`, query.region)}
    ${query.island ? Prisma.sql`and l.region = any(${PH_REGIONS.filter((r) => r.island === query.island).map((r) => r.code)}::text[])` : Prisma.empty}
    ${labelClause(Prisma.sql`l.location_type`, query.location_type)}`;
  const sc = { from, to, prev, period, prevRange, prevLabel, lengthMonths };
  const review = Prisma.sql`${location} ${periodJoin(sc)}`;
  return { any: ids === null || ids.length > 0, location, review, ...sc };
}

/**
 * A Dashboard tab's data for the period and, when the query has `vs` (Compare to) and a bounded period, the same data
 * for the compared dates in `compare`. Both sides count their whole range (ScopeOptions.wholeRange) so they compare
 * like for like. `bQuery` adjusts the compared side's query from the period's result (e.g. the same chart buckets).
 */
export async function withCompare<Q extends InsightsQuery, T>(
  query: Q,
  timeZone: string,
  run: (q: Q) => Promise<T>,
  bQuery: (q: Q, a: T) => Q = (q) => q,
): Promise<T & { compare: CompareSide<T> | null }> {
  if (!query.vs) return { ...(await run(query)), compare: null };
  const { period, prevRange } = resolveInsightPeriod(query, timeZone);
  if (!prevRange || !period.range) return { ...(await run(query)), compare: null }; // All time: nothing to compare with
  const a = await run({ ...query, _scope: { wholeRange: true } });
  const b = await run(
    bQuery(
      { ...query, range: undefined, months: undefined, from: prevRange.from, to: prevRange.to, vs: undefined, vs_from: undefined, vs_to: undefined, _scope: { wholeRange: true, noCompare: true } },
      a,
    ),
  );
  return { ...a, compare: { label: rangeLabel(prevRange), range: prevRange, same_length: rangeDays(period.range) === rangeDays(prevRange), data: b } };
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
