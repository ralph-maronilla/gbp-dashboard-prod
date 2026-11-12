import { withAuth } from "@/server/api/with-auth";
import { getAccessibleLocationIds } from "@/server/api/location-access";
import { getThemeWorkbook } from "@/server/data/theme-export";
import { env } from "@/server/env";
import { buildXlsx } from "@/lib/export/xlsx";
import { themeByKey } from "@/lib/insights/themes";
import { regionName } from "@/lib/ph-regions";
import { resolveInsightPeriod } from "@/server/data/insight-scope";
import { rangeLabel } from "@/lib/insights/date-ranges";
import { UNASSIGNED, themeExportQuerySchema, type ThemeExportQuery } from "@/lib/schemas/insights";
import type { Tx } from "@/server/db/with-rls";

export const maxDuration = 60;


/** Header lines of the Summary tab: what was exported, with which filters, when. */
async function about(tx: Tx, query: ThemeExportQuery, timeZone: string): Promise<string[]> {
  const [group, location] = await Promise.all([
    query.group_id ? tx.location_groups.findUnique({ where: { id: query.group_id }, select: { name: true } }) : null,
    query.location_id ? tx.locations.findUnique({ where: { id: query.location_id }, select: { name: true } }) : null,
  ]);
  const label = (v: string | undefined, name: (v: string) => string | null = (x) => x) => (v === UNASSIGNED ? "Unassigned" : v ? (name(v) ?? v) : null);
  const filters = [
    group && `Client: ${group.name}`,
    query.island && `Island group: ${query.island}`,
    label(query.region, regionName) && `Region: ${label(query.region, regionName)}`,
    label(query.location_type) && `Type: ${label(query.location_type)}`,
    location && `Location: ${location.name}`,
  ].filter(Boolean);
  const theme = query.theme ? themeByKey.get(query.theme)?.label : null;
  const { period } = resolveInsightPeriod(query, timeZone);
  const generated = new Date().toLocaleString("en-PH", { timeZone, dateStyle: "medium", timeStyle: "short" });
  return [
    `Period: ${period.label}${period.preset && period.range ? ` (${rangeLabel(period.range)})` : ""}`,
    `Filters: ${filters.length > 0 ? filters.join(" · ") : "none (all locations you can see)"}`,
    ...(theme
      ? [`Theme: ${theme}${query.sentiment !== "all" ? ` · ${query.sentiment[0]!.toUpperCase()}${query.sentiment.slice(1)} mentions only (location tabs)` : ""}${query.q ? ` · Search: "${query.q}"` : ""}`]
      : []),
    `Generated: ${generated} (Manila time)`,
    "One row per review per theme it mentions. Sentiment is estimated from the words about the theme, or from the stars when there are none.",
  ];
}

/**
 * Review Intelligence as an Excel workbook: a Summary tab and one tab per location. Same visibility and filters as the
 * themes tab (RLS applies: every query runs through ctx.db).
 */
export const GET = withAuth(
  { roles: ["admin", "manager", "viewer"], query: themeExportQuerySchema, rateLimit: { key: "export", limit: 10, windowSec: 60 } },
  async ({ ctx, query }) => {
    const tz = env.exportTimeZone;
    const visible = ctx.profile.role === "admin" ? null : await getAccessibleLocationIds(ctx);
    const sheets = await ctx.db(async (tx) => getThemeWorkbook(tx, visible, query, tz, await about(tx, query, tz)));
    const file = buildXlsx(sheets);

    const stamp = new Date().toISOString().slice(0, 10);
    const slug = query.theme ? `-${(themeByKey.get(query.theme)?.label ?? query.theme).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
    return new Response(file as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="review-intelligence${slug}-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
