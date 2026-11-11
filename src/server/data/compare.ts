import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/db/with-rls";
import type { CompareFigures, CompareInsights, CompareLocation, CompareMonth, CompareQuery } from "@/lib/schemas/insights";
import { insightScope, monthBounds, monthOf, monthRange } from "./insight-scope";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : null);

interface Counts {
  reviews: number;
  stars: number;
  replied: number;
  low: number;
}
const figures = (c: Counts): CompareFigures => ({
  reviews: c.reviews,
  avg_rating: c.reviews > 0 ? Math.round((c.stars / c.reviews) * 100) / 100 : null,
  reply_pct: pct(c.replied, c.reviews),
  low_pct: pct(c.low, c.reviews),
});
const add = (into: Counts, c: Counts) => {
  into.reviews += c.reviews;
  into.stars += c.stars;
  into.replied += c.replied;
  into.low += c.low;
};

/**
 * Two calendar months side by side, per location and for the whole network (Review Overview with "Compare months" ticked). Without `a` and
 * `b`, the last full month against the month before it. The Period filter does not apply; the Client / Region / Island /
 * Type / Location filters do. Every location in scope is listed, with empty figures when it had no reviews.
 */
export async function getCompareInsights(tx: Tx, visibleIds: string[] | null, query: CompareQuery, timeZone: string, now = new Date()): Promise<CompareInsights> {
  const sc = insightScope(visibleIds, { ...query, months: 0, granularity: "auto" }, timeZone, now);
  const current = monthOf(now, timeZone);
  const [before, last] = monthRange(now, 3, timeZone) as [string, string, string];
  const a = query.a ?? (query.b === last ? before : last);
  const b = query.b ?? (a === before ? last : before);
  const label = (month: string): CompareMonth => ({ month, label: `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`, partial: month === current });

  const empty: Counts = { reviews: 0, stars: 0, replied: 0, low: 0 };
  const network = { a: { ...empty }, b: { ...empty } };
  let locations: CompareLocation[] = [];
  let oldest: Date | null = null;

  if (sc.any) {
    const [A, B] = [monthBounds(a, timeZone), monthBounds(b, timeZone)];
    const inA = Prisma.sql`r.create_time >= ${A.from} and r.create_time < ${A.to}`;
    const inB = Prisma.sql`r.create_time >= ${B.from} and r.create_time < ${B.to}`;
    const [rows, first] = await Promise.all([
      tx.$queryRaw<
        { id: string; name: string; a_reviews: number; a_stars: number; a_replied: number; a_low: number; b_reviews: number; b_stars: number; b_replied: number; b_low: number }[]
      >`
        select l.id, l.name,
          (count(r.id) filter (where ${inA}))::int as a_reviews,
          (coalesce(sum(r.rating) filter (where ${inA}), 0))::int as a_stars,
          (count(r.reply_comment) filter (where ${inA}))::int as a_replied,
          (count(r.id) filter (where ${inA} and r.rating <= 2))::int as a_low,
          (count(r.id) filter (where ${inB}))::int as b_reviews,
          (coalesce(sum(r.rating) filter (where ${inB}), 0))::int as b_stars,
          (count(r.reply_comment) filter (where ${inB}))::int as b_replied,
          (count(r.id) filter (where ${inB} and r.rating <= 2))::int as b_low
        from public.locations l
        left join public.reviews r on r.location_id = l.id and ((${inA}) or (${inB}))
        where ${sc.location}
        group by l.id, l.name`,
      tx.$queryRaw<{ oldest: Date | null }[]>`
        select min(r.create_time) as oldest from public.reviews r join public.locations l on l.id = r.location_id where ${sc.location}`,
    ]);
    locations = rows
      .map((r) => {
        const [ca, cb] = [
          { reviews: r.a_reviews, stars: r.a_stars, replied: r.a_replied, low: r.a_low },
          { reviews: r.b_reviews, stars: r.b_stars, replied: r.b_replied, low: r.b_low },
        ];
        add(network.a, ca);
        add(network.b, cb);
        return { id: r.id, name: r.name, a: figures(ca), b: figures(cb) };
      })
      .sort((x, y) => x.name.localeCompare(y.name));
    oldest = first[0]?.oldest ?? null;
  }

  // Every month from the oldest review to now (newest first), plus the two chosen ones in case they lie outside it.
  const [ny, nm] = current.split("-").map(Number) as [number, number];
  const span = oldest ? (() => { const [oy, om] = monthOf(oldest, timeZone).split("-").map(Number) as [number, number]; return (ny - oy) * 12 + (nm - om) + 1; })() : 3;
  const months = [...new Set([...monthRange(now, Math.max(span, 3), timeZone), a, b])].sort().reverse();

  return { a: label(a), b: label(b), network: { a: figures(network.a), b: figures(network.b) }, locations, available_months: months.map(label) };
}
