import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/db/with-rls";
import { Errors } from "@/server/api/errors";
import { startOfDayInZone } from "@/lib/export/reviews-csv";
import { addDays, rangeDays, rangeLabel, todayIn, type DayRange } from "@/lib/insights/date-ranges";
import type { CompareFigures, CompareInsights, CompareLocation, CompareQuery, CompareRange } from "@/lib/schemas/insights";
import { insightScope } from "./insight-scope";
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

const side = (r: DayRange, today: string): CompareRange => ({ ...r, label: rangeLabel(r), days: rangeDays(r), partial: r.to === today });

/**
 * The Dashboard period and its comparison period side by side, per location and for the whole network (Review Overview
 * with Compare on), like the Google Analytics comparison. The comparison is the period just before (same number of
 * days, or whole months for month presets), the same dates a year earlier, or custom `vs_from`-`vs_to`. Days are in
 * `timeZone`. All time cannot be compared. The Client / Region / Island / Type / Location filters apply. Every location
 * in scope is listed, with empty figures when it had no reviews.
 */
export async function getCompareInsights(tx: Tx, visibleIds: string[] | null, query: CompareQuery, timeZone: string, now = new Date()): Promise<CompareInsights> {
  const sc = insightScope(visibleIds, { ...query, granularity: "auto" }, timeZone, now);
  const today = todayIn(timeZone, now);
  if (!sc.period.range || !sc.prevRange) throw Errors.badRequest("All time has nothing to compare with: pick a date range first");
  const a = side(sc.period.range, today);
  const b = side(sc.prevRange, today);

  const empty: Counts = { reviews: 0, stars: 0, replied: 0, low: 0 };
  const network = { a: { ...empty }, b: { ...empty } };
  let locations: CompareLocation[] = [];
  let oldest: Date | null = null;

  if (sc.any) {
    // From the start of the first day to the start of the day after the last (both in `timeZone`).
    const bounds = (r: DayRange) => ({ from: startOfDayInZone(r.from, timeZone), to: startOfDayInZone(addDays(r.to, 1), timeZone) });
    const [A, B] = [bounds(a), bounds(b)];
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

  return {
    a,
    b,
    range: sc.period.preset,
    vs: query.vs,
    today,
    oldest: oldest ? todayIn(timeZone, oldest) : null,
    network: { a: figures(network.a), b: figures(network.b) },
    locations,
  };
}
