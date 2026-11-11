import { withAuth } from "@/server/api/with-auth";
import { Errors } from "@/server/api/errors";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { buildReviewWhere, reviewOrderBy, reviewSheetSelect, toReviewRow } from "@/server/data/reviews";
import { env } from "@/server/env";
import { REVIEW_CSV_COLUMNS, type ReviewCsvColumn } from "@/lib/export/review-columns";
import { PLACEHOLDER, csvRow } from "@/lib/export/reviews-csv";
import { exportReviewsQuerySchema, type ReviewRow } from "@/lib/schemas/extract";

export const maxDuration = 60;

const HEADER = new Map<ReviewCsvColumn, string>(REVIEW_CSV_COLUMNS.map((c) => [c.id, c.header]));

/** One CSV cell of a review. The CX Pulse columns are exactly as before (AGE and GENDER are always N/A). */
function cell(r: ReviewRow, column: ReviewCsvColumn): string | number {
  switch (column) {
    case "reference": return Number(r.reference);
    case "datetime": return r.datetime;
    case "branch": return r.branch;
    case "first_name": return r.first_name;
    case "middle_name": return r.middle_name;
    case "last_name": return r.last_name;
    case "age": return PLACEHOLDER;
    case "location": return r.location;
    case "gender": return PLACEHOLDER;
    case "rating": return r.rating;
    case "comment": return r.comment ?? "";
    case "reviewer_link": return r.reviewer_url ?? "";
    case "type": return r.location_type ?? "";
    case "client": return r.client;
    case "region": return r.region ?? "";
    case "replied": return r.reply ? "Yes" : "No";
    case "reply": return r.reply ?? "";
    case "reply_date": return r.reply_date ?? "";
  }
}

const CHUNK = 2000;
/** Keeps one download within the function time limit; larger exports need a narrower date range. */
const MAX_ROWS = 100_000;

/**
 * One CSV with the reviews of every location the caller can access (admins: all): the CX Pulse upload layout, or
 * the chosen `columns`. Same filters as the reviews table (lib/data/reviews.ts). Access is enforced twice: the explicit id
 * list and RLS (every query runs through ctx.db).
 */
export const GET = withAuth(
  { roles: ["admin", "manager", "viewer"], query: exportReviewsQuerySchema, rateLimit: { key: "export", limit: 10, windowSec: 60 } },
  async ({ ctx, query }) => {
    const tz = env.exportTimeZone;
    const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
    const where = buildReviewWhere(query, visible, tz);

    const total = await ctx.db((tx) => tx.reviews.count({ where }));
    if (total > MAX_ROWS) {
      throw Errors.badRequest(`${total.toLocaleString("en-US")} reviews match; narrow the date range or location (limit ${MAX_ROWS.toLocaleString("en-US")})`);
    }

    // The ids in the table's order (same reviewOrderBy as /api/reviews), read once up front: the rows are then loaded in
    // chunks by id, so the file keeps that order and reviews saved mid-download cannot shift or repeat rows.
    const ids = (await ctx.db((tx) => tx.reviews.findMany({ where, orderBy: reviewOrderBy(query.sort, query.order), select: { id: true } }))).map((r) => r.id);

    const encoder = new TextEncoder();
    let next = 0;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode("﻿" + csvRow(query.columns.map((c) => HEADER.get(c))))); // BOM so Excel reads UTF-8
      },
      async pull(controller) {
        const chunk = ids.slice(next, next + CHUNK);
        next += CHUNK;
        if (chunk.length === 0) return controller.close();
        const found = await ctx.db((tx) => tx.reviews.findMany({ where: { id: { in: chunk } }, select: reviewSheetSelect }));
        const byId = new Map(found.map((r) => [r.id, r]));
        // A review deleted since the id list was read is skipped.
        const rows = chunk.map((id) => byId.get(id)).filter((r) => r !== undefined);
        let out = "";
        for (const r of rows) {
          const row = toReviewRow(r, tz);
          out += csvRow(query.columns.map((c) => cell(row, c)));
        }
        controller.enqueue(encoder.encode(out));
        if (next >= ids.length) controller.close();
      },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reviews-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
