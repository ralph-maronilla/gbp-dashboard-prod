import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/db/with-rls";
import { ApiError, Errors } from "@/server/api/errors";
import type {
  Granularity,
  LocationDetail,
  ReviewRow,
  ReviewsPage,
  TrendPoint,
} from "@/lib/schemas/location-detail";
import type { reviewsQuerySchema } from "@/lib/schemas/location-detail";
import type { z } from "zod";

/** Trusted SQL fragments per granularity (never built from user input). */
const BUCKETS: Record<Granularity, { unit: Prisma.Sql; step: Prisma.Sql; span: Prisma.Sql }> = {
  week: { unit: Prisma.raw("'week'"), step: Prisma.raw("interval '1 week'"), span: Prisma.raw("interval '11 weeks'") },
  month: { unit: Prisma.raw("'month'"), step: Prisma.raw("interval '1 month'"), span: Prisma.raw("interval '11 months'") },
};

/** Loads the location through RLS; inactive and removed locations are hidden from non-admins (like the overview). */
async function loadLocation(tx: Tx, id: string, isAdmin: boolean) {
  const loc = await tx.locations.findUnique({
    where: { id },
    select: { id: true, name: true, address: true, is_active: true, removed_at: true, last_synced_at: true },
  });
  if (!loc || (!isAdmin && (!loc.is_active || loc.removed_at))) throw Errors.notFound();
  return loc;
}

export async function getLocationDetail(tx: Tx, id: string, granularity: Granularity, isAdmin: boolean): Promise<LocationDetail> {
  const loc = await loadLocation(tx, id, isAdmin);
  const b = BUCKETS[granularity];

  const [agg, trend] = await Promise.all([
    tx.$queryRaw<
      {
        total_reviews: number; avg_rating: number | null; new_reviews_7d: number; unanswered: number; low_rating: number;
        r1: number; r2: number; r3: number; r4: number; r5: number;
      }[]
    >`
      select count(*)::int as total_reviews,
        round(avg(rating)::numeric, 2)::float8 as avg_rating,
        (count(*) filter (where create_time >= now() - interval '7 days'))::int as new_reviews_7d,
        (count(*) filter (where reply_comment is null))::int as unanswered,
        (count(*) filter (where rating <= 2))::int as low_rating,
        (count(*) filter (where rating = 1))::int as r1, (count(*) filter (where rating = 2))::int as r2,
        (count(*) filter (where rating = 3))::int as r3, (count(*) filter (where rating = 4))::int as r4,
        (count(*) filter (where rating = 5))::int as r5
      from public.reviews where location_id = ${id}::uuid`,
    // generate_series guarantees all 12 buckets exist, even with zero reviews.
    tx.$queryRaw<{ bucket: Date; avg_rating: number | null; count: number }[]>`
      with buckets as (
        select generate_series(date_trunc(${b.unit}, now()) - ${b.span}, date_trunc(${b.unit}, now()), ${b.step}) as bucket
      )
      select bk.bucket, round(avg(r.rating)::numeric, 2)::float8 as avg_rating, count(r.id)::int as count
      from buckets bk
      left join public.reviews r on r.location_id = ${id}::uuid and date_trunc(${b.unit}, r.create_time) = bk.bucket
      group by bk.bucket order by bk.bucket`,
  ]);

  const a = agg[0];
  return {
    id: loc.id,
    name: loc.name,
    address: loc.address,
    is_active: loc.is_active,
    removed: loc.removed_at !== null,
    last_synced_at: loc.last_synced_at?.toISOString() ?? null,
    total_reviews: a?.total_reviews ?? 0,
    avg_rating: a?.avg_rating ?? null,
    new_reviews_7d: a?.new_reviews_7d ?? 0,
    unanswered: a?.unanswered ?? 0,
    low_rating: a?.low_rating ?? 0,
    granularity,
    trend: trend.map<TrendPoint>((t) => ({ bucket: t.bucket.toISOString(), avg_rating: t.avg_rating, count: t.count })),
    distribution: [a?.r1 ?? 0, a?.r2 ?? 0, a?.r3 ?? 0, a?.r4 ?? 0, a?.r5 ?? 0],
  };
}

// ---- reviews (cursor pagination on create_time desc, id desc) ----

function encodeCursor(row: { create_time: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.create_time.toISOString(), id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): { t: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t?: unknown; id?: unknown };
    const t = new Date(String(parsed.t));
    if (Number.isNaN(t.getTime()) || typeof parsed.id !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error("bad");
    return { t, id: parsed.id };
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Invalid cursor");
  }
}

export async function listLocationReviews(
  tx: Tx,
  id: string,
  query: z.output<typeof reviewsQuerySchema>,
  isAdmin: boolean,
): Promise<ReviewsPage> {
  await loadLocation(tx, id, isAdmin);

  const and: Prisma.reviewsWhereInput[] = [];
  if (query.q) {
    and.push({
      OR: [
        { comment: { contains: query.q, mode: "insensitive" } },
        { reviewer_name: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    and.push({ OR: [{ create_time: { lt: c.t } }, { create_time: c.t, id: { lt: c.id } }] });
  }

  const rows = await tx.reviews.findMany({
    where: {
      location_id: id,
      ...(query.rating ? { rating: { in: query.rating } } : {}),
      ...(query.status === "replied" ? { reply_comment: { not: null } } : {}),
      ...(query.status === "unanswered" ? { reply_comment: null } : {}),
      ...(query.from || query.to
        ? {
            create_time: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    },
    orderBy: [{ create_time: "desc" }, { id: "desc" }],
    take: query.limit + 1, // one extra row tells us whether another page exists
    select: { id: true, reviewer_name: true, rating: true, comment: true, create_time: true, reply_comment: true, reply_time: true },
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page.map<ReviewRow>((r) => ({
      ...r,
      create_time: r.create_time.toISOString(),
      reply_time: r.reply_time?.toISOString() ?? null,
    })),
    next_cursor: hasMore && last ? encodeCursor(last) : null,
  };
}
