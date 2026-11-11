import "server-only";
import { Errors } from "@/server/api/errors";
import type { Tx } from "@/server/db/with-rls";
import { formatDateTime } from "@/lib/export/reviews-csv";
import { classifyCached } from "@/lib/insights/sentiment";
import { themeWorkbook } from "@/lib/insights/theme-workbook";
import type { Sheet } from "@/lib/export/xlsx";
import { regionName } from "@/lib/ph-regions";
import type { ThemeExportQuery } from "@/lib/schemas/insights";
import { insightScope } from "./insight-scope";

/** Keeps one export within the function time limit. */
const MAX_REVIEWS = 100_000;

/**
 * Sheets of the Review Intelligence export: the same reviews and classification as the themes tab
 * (lib/data/insights.ts getThemeInsights), so the Summary's totals equal the tiles. `about` = the header lines.
 */
export async function getThemeWorkbook(tx: Tx, visibleIds: string[] | null, query: ThemeExportQuery, timeZone: string, about: string[]): Promise<Sheet[]> {
  const sc = insightScope(visibleIds, query, timeZone);
  if (!sc.any) return themeWorkbook([], { ...query, about });
  const [count] = await tx.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from public.reviews r join public.locations l on l.id = r.location_id
    where ${sc.review} and r.comment is not null and btrim(r.comment) <> ''`;
  const n = count?.n ?? 0;
  if (n > MAX_REVIEWS) throw Errors.badRequest(`${n.toLocaleString("en-US")} reviews match; choose a shorter period or fewer locations (limit ${MAX_REVIEWS.toLocaleString("en-US")})`);

  const rows = await tx.$queryRaw<
    { id: string; reference_no: number; rating: number; comment: string; created_at: Date; location_id: string; location: string; region: string | null; type: string | null; replied: boolean; reviewer_url: string | null }[]
  >`
    select r.id, r.reference_no, r.rating::int as rating, r.comment, r.create_time as created_at, l.id as location_id,
      l.name as location, l.region, l.location_type as type, r.reply_comment is not null as replied, r.reviewer_url
    from public.reviews r join public.locations l on l.id = r.location_id
    where ${sc.review} and r.comment is not null and btrim(r.comment) <> ''
    order by r.create_time desc, r.id desc`;
  return themeWorkbook(
    rows.map((r) => ({
      ...r,
      region: regionName(r.region),
      date: formatDateTime(r.created_at, timeZone),
      found: classifyCached(r.id, r.comment, r.rating),
    })),
    { ...query, about },
  );
}
