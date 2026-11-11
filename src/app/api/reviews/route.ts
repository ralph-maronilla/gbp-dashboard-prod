import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAccessibleLocationIds } from "@/lib/api/location-access";
import { buildReviewWhere, reviewOrderBy, reviewSheetSelect, toReviewRow } from "@/lib/data/reviews";
import { env } from "@/lib/env";
import { listReviewsQuerySchema, type ReviewsPage } from "@/lib/schemas/extract";

/** Reviews in the CX Pulse sheet shape, server-paginated, limited to the caller's locations. */
export const GET = withAuth({ roles: ["admin", "manager", "viewer"], query: listReviewsQuerySchema }, async ({ ctx, query }) => {
  const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
  const tz = env.exportTimeZone;
  const where = buildReviewWhere(query, visible, tz);
  const orderBy = reviewOrderBy(query.sort, query.order);

  const page = await ctx.db(async (tx) => {
    const [total, rows] = await Promise.all([
      tx.reviews.count({ where }),
      tx.reviews.findMany({ where, orderBy, skip: query.page * query.pageSize, take: query.pageSize, select: reviewSheetSelect }),
    ]);
    return {
      total,
      rows: rows.map((r) => toReviewRow(r, tz)),
    } satisfies ReviewsPage;
  });
  return ok(page);
});
