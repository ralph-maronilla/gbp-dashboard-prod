import "server-only";
import type { Tx } from "@/lib/db/with-rls";
import type { DashboardData } from "@/lib/schemas/dashboard";
import { LAST_MONTH, type InsightsQuery } from "@/lib/schemas/insights";
import { insightScope, monthOf, monthRange } from "./insight-scope";

/** Locations need at least this many reviews in range to be ranked best/worst. */
const MIN_REVIEWS_TO_RANK = 10;
const RANK_SIZE = 5;
const RECENT_LOW = 10;

/**
 * Aggregates for the dashboard page. Same visibility and filter rules as the Extraction table and the CSV export
 * (lib/data/reviews.ts buildReviewWhere: admins see everything, others only their active locations; group and location
 * filters), so the numbers always agree. All counting happens in SQL inside the caller's RLS transaction.
 * `visibleIds` null = admin.
 */
export type Bucket = "month" | "quarter" | "year";

/** Auto: up to 24 months monthly, up to 6 years quarterly, longer yearly. */
export function pickBucket(spanMonths: number, requested: "auto" | Bucket): Bucket {
  if (requested !== "auto") return requested;
  return spanMonths <= 24 ? "month" : spanMonths <= 72 ? "quarter" : "year";
}

/** "2026-03" → bucket key: "2026-03", "2026-Q1" or "2026". */
export function bucketOf(month: string, bucket: Bucket): string {
  const [y, m] = month.split("-");
  return bucket === "month" ? month : bucket === "quarter" ? `${y}-Q${Math.ceil(Number(m) / 3)}` : String(y);
}

const BUCKET_SQL: Record<Bucket, { unit: string; format: string }> = {
  month: { unit: "month", format: "YYYY-MM" },
  quarter: { unit: "quarter", format: 'YYYY-"Q"Q' },
  year: { unit: "year", format: "YYYY" },
};

export async function getDashboard(tx: Tx, visibleIds: string[] | null, query: InsightsQuery, timeZone: string, now = new Date()): Promise<DashboardData> {
  const sc = insightScope(visibleIds, query, timeZone, now);
  const scope = sc.review;
  let months =
    query.months > 0 ? monthRange(now, query.months, timeZone) : query.months === LAST_MONTH ? monthRange(now, 2, timeZone).slice(0, 1) : [monthOf(now, timeZone)];
  if (query.months === 0 && sc.any) {
    // All time: from the oldest review in scope; every review is counted.
    const [first] = await tx.$queryRaw<{ oldest: Date | null }[]>`
      select min(r.create_time) as oldest from public.reviews r join public.locations l on l.id = r.location_id where ${scope}`;
    if (first?.oldest) {
      const [fy, fm] = monthOf(first.oldest, timeZone).split("-").map(Number) as [number, number];
      const [ny, nm] = monthOf(now, timeZone).split("-").map(Number) as [number, number];
      months = monthRange(now, (ny - fy) * 12 + (nm - fm) + 1, timeZone);
    }
  }
  const bucket = pickBucket(months.length, query.granularity);
  const buckets = [...new Set(months.map((m) => bucketOf(m, bucket)))];
  const { unit, format } = BUCKET_SQL[bucket];

  const empty: DashboardData = {
    months: query.months,
    totals: { total: 0, avg_rating: null, positive_pct: null, negative_pct: null, reply_pct: null },
    granularity: bucket,
    monthly: buckets.map((month) => ({ month, total: 0, avg_rating: null, low: 0 })),
    distribution: [0, 0, 0, 0, 0],
    best: [],
    worst: [],
    recent_low: [],
  };
  if (!sc.any) return empty;

  const [totals, perMonth, dist, perLocation, recentLow] = await Promise.all([
    tx.$queryRaw<{ total: number; avg_rating: number | null; positive: number; negative: number; replied: number }[]>`
      select count(*)::int as total,
        round(avg(r.rating)::numeric, 2)::float8 as avg_rating,
        (count(*) filter (where r.rating >= 4))::int as positive,
        (count(*) filter (where r.rating <= 2))::int as negative,
        (count(*) filter (where r.reply_comment is not null))::int as replied
      from public.reviews r join public.locations l on l.id = r.location_id
      where ${scope}`,
    tx.$queryRaw<{ month: string; total: number; avg_rating: number; low: number }[]>`
      select to_char(date_trunc(${unit}, r.create_time at time zone ${timeZone}::text), ${format}) as month,
        count(*)::int as total,
        round(avg(r.rating)::numeric, 2)::float8 as avg_rating,
        (count(*) filter (where r.rating <= 2))::int as low
      from public.reviews r join public.locations l on l.id = r.location_id
      where ${scope}
      group by 1`,
    tx.$queryRaw<{ rating: number; n: number }[]>`
      select r.rating::int as rating, count(*)::int as n
      from public.reviews r join public.locations l on l.id = r.location_id
      where ${scope}
      group by 1`,
    tx.$queryRaw<{ id: string; name: string; avg_rating: number; total: number }[]>`
      select l.id, l.name, round(avg(r.rating)::numeric, 2)::float8 as avg_rating, count(*)::int as total
      from public.reviews r join public.locations l on l.id = r.location_id
      where ${scope}
      group by l.id, l.name
      having count(*) >= ${MIN_REVIEWS_TO_RANK}`,
    tx.$queryRaw<{ id: string; created_at: Date; location_id: string; location: string; rating: number; comment: string | null }[]>`
      select r.id, r.create_time as created_at, l.id as location_id, l.name as location, r.rating::int as rating,
        left(r.comment, 240) as comment
      from public.reviews r join public.locations l on l.id = r.location_id
      where ${scope} and r.rating <= 2
      order by r.create_time desc, r.id desc
      limit ${RECENT_LOW}`,
  ]);

  const t = totals[0];
  const total = t?.total ?? 0;
  const pct = (n: number | undefined) => (total > 0 && n !== undefined ? Math.round((n / total) * 1000) / 10 : null);
  const byMonth = new Map(perMonth.map((m) => [m.month, m]));
  const distribution = [1, 2, 3, 4, 5].map((s) => dist.find((d) => d.rating === s)?.n ?? 0);
  const ranked = [...perLocation].sort((a, b) => b.avg_rating - a.avg_rating || b.total - a.total || a.name.localeCompare(b.name));

  return {
    months: query.months,
    granularity: bucket,
    totals: { total, avg_rating: t?.avg_rating ?? null, positive_pct: pct(t?.positive), negative_pct: pct(t?.negative), reply_pct: pct(t?.replied) },
    monthly: buckets.map((month) => {
      const m = byMonth.get(month);
      return { month, total: m?.total ?? 0, avg_rating: m?.avg_rating ?? null, low: m?.low ?? 0 };
    }),
    distribution,
    best: ranked.slice(0, RANK_SIZE),
    worst: ranked.length > RANK_SIZE ? ranked.slice(-RANK_SIZE).reverse() : [],
    recent_low: recentLow.map((r) => ({ ...r, created_at: r.created_at.toISOString() })),
  };
}
