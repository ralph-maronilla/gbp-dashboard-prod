import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/db/with-rls";
import { changeHighlights, hotspotsOf, managementInsight, overviewReadout, recommendedActions, reputationHighlights, type Hotspot, type PeriodComparison, type PeriodFigures } from "@/lib/insights/narrative";
import {
  activitySignal,
  attentionLevel,
  commendationSignal,
  issueLevel,
  MIN_DRIVER_MENTIONS,
  MIN_MEASURED_REPLIES,
  MIN_MEASURED_SPAN_DAYS,
  ratingSignal,
  responseCoverage,
  responseSpeed,
  responseStatus,
  themeSignal,
} from "@/lib/insights/signals";
import { classifyCached } from "@/lib/insights/sentiment";
import { themeByKey, THEMES, type ThemeDef } from "@/lib/insights/themes";
import { groupThemeReviews } from "@/lib/insights/theme-reviews";
import type {
  GroupBy,
  GroupByQuery,
  GroupPerformance,
  InsightsQuery,
  LocationPerformance,
  OverviewInsights,
  ReputationInsights,
  StatusCard,
  ThemeInsights,
  ThemeQuote,
  ThemeReviews,
  ThemeReviewsQuery,
  ThemeStat,
} from "@/lib/schemas/insights";
import { AREA_ORDER, regionName, SEGMENT_ORDER } from "@/lib/ph-regions";
import { groupColumn, insightScope, periodJoin, type InsightScope } from "./insight-scope";

/**
 * Data for the Dashboard tabs (Review Overview, Reputation, Sentiment / Review Intelligence). Everything is counted in
 * SQL inside the caller's RLS transaction, scoped by insightScope (same visibility and filters as the reviews table).
 */

function responseSpeedCard(
  measuredDays: number | null,
  measured: number,
  measuredSince: Date | null,
  approxDays: number | null,
  replies: number,
  timeZone: string,
  now = new Date(),
): StatusCard {
  const days = (d: number) => `${Math.max(0, Math.round(d))} day${Math.round(d) === 1 ? "" : "s"}`;
  // Measured replies only count once they span MIN_MEASURED_SPAN_DAYS of collection: the first full extraction marks
  // every reply Google dates "a day ago" as measured, and a 1-2 day window holds mostly quick replies to new reviews.
  const spanDays = measuredSince ? (now.getTime() - measuredSince.getTime()) / 86_400_000 : 0;
  if (measuredDays !== null && measured >= MIN_MEASURED_REPLIES && spanDays >= MIN_MEASURED_SPAN_DAYS) {
    return { key: "response_speed", title: "Response Speed", signal: responseSpeed(measuredDays), note: "measured", detail: `About ${days(measuredDays)} to reply (median of ${measured} measured replies)`, value: measuredDays, reviews: measured };
  }
  const since = measuredSince ? measuredSince.toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone }) : null;
  return {
    key: "response_speed",
    title: "Response Speed",
    signal: responseSpeed(approxDays),
    note: "approx.",
    value: approxDays,
    reviews: replies,
    detail:
      approxDays === null
        ? "No replies yet"
        : `About ${days(approxDays)} to reply (approximate; ` +
          (since
            ? `measuring exact reply times since ${since}, shown after ${MIN_MEASURED_SPAN_DAYS} days and ${MIN_MEASURED_REPLIES} replies)`
            : `exact reply times are measured from extractions)`),
  };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const JOIN = Prisma.sql`from public.reviews r join public.locations l on l.id = r.location_id`;

export async function getOverviewInsights(tx: Tx, visibleIds: string[] | null, query: InsightsQuery, timeZone: string): Promise<OverviewInsights> {
  const sc = insightScope(visibleIds, query, timeZone);
  const rows = !sc.any
    ? []
    : await tx.$queryRaw<
        {
          id: string;
          name: string;
          reviews: number;
          avg_rating: number | null;
          rating_sum: number | null;
          google_rating: number | null;
          google_reviews: number | null;
          google_checked_at: Date | null;
          backfill_done: boolean;
          ever_extracted: boolean;
        }[]
      >`
        select l.id, l.name, count(r.id)::int as reviews, round(avg(r.rating)::numeric, 2)::float8 as avg_rating,
          sum(r.rating)::float8 as rating_sum, l.google_rating::float8 as google_rating, l.source_review_count as google_reviews,
          l.google_checked_at, l.backfill_completed_at is not null as backfill_done,
          (l.last_synced_at is not null or l.sync_cursor is not null or l.backfill_completed_at is not null) as ever_extracted
        from public.locations l
        left join public.reviews r on r.location_id = l.id ${periodJoin(sc)}
        where ${sc.location}
        group by l.id, l.name, l.google_rating, l.source_review_count, l.google_checked_at, l.backfill_completed_at, l.last_synced_at, l.sync_cursor`;

  const locations: LocationPerformance[] = rows
    .map((r) => {
      const hasGoogle = r.google_checked_at !== null;
      const gCount = hasGoogle ? (r.google_reviews ?? 0) : null;
      const gRating = hasGoogle && (gCount ?? 0) > 0 ? r.google_rating : null;
      return {
        id: r.id,
        name: r.name,
        reviews: r.reviews,
        avg_rating: r.reviews > 0 ? r.avg_rating : null,
        signal: ratingSignal(r.reviews > 0 ? r.avg_rating : null),
        google_rating: gRating,
        google_reviews: gCount,
        google_checked_at: r.google_checked_at?.toISOString() ?? null,
        google_signal: ratingSignal(gRating),
        extraction: r.backfill_done ? ("complete" as const) : r.ever_extracted || r.reviews > 0 ? ("partial" as const) : ("never" as const),
      };
    })
    .sort((a, b) => b.reviews - a.reviews || a.name.localeCompare(b.name));

  // `known` = we actually know this location's review count (extracted, or Google-confirmed in the Google view).
  const totals = (items: { reviews: number; sum: number; known: boolean }[]) => {
    const total = items.reduce((a, x) => a + x.reviews, 0);
    const sum = items.reduce((a, x) => a + x.sum, 0);
    const withReviews = items.filter((x) => x.reviews > 0).length;
    return {
      profiles: items.length,
      profiles_with_reviews: withReviews,
      profiles_without_reviews: items.filter((x) => x.known && x.reviews === 0).length,
      not_extracted: items.filter((x) => !x.known && x.reviews === 0).length,
      total_reviews: total,
      weighted_rating: total > 0 ? Math.round((sum / total) * 100) / 100 : null,
    };
  };
  const ratingSum = new Map(rows.map((r) => [r.id, r.rating_sum ?? 0]));
  const extracted = totals(locations.map((l) => ({ reviews: l.reviews, sum: ratingSum.get(l.id) ?? 0, known: l.extraction !== "never" })));
  // Google view: Google's count and rating where refreshed, extracted figures otherwise (marked in the UI).
  const googleView = locations.map((l) =>
    l.google_checked_at
      ? { reviews: l.google_reviews ?? 0, sum: (l.google_rating ?? 0) * (l.google_reviews ?? 0), known: true }
      : { reviews: l.reviews, sum: ratingSum.get(l.id) ?? 0, known: l.extraction !== "never" },
  );
  const refreshed = locations.filter((l) => l.google_checked_at);
  const asGoogle = locations.map((l) =>
    l.google_checked_at ? { ...l, reviews: l.google_reviews ?? 0, avg_rating: l.google_rating, signal: l.google_signal } : l,
  );
  const google = totals(googleView);

  return {
    ...extracted,
    locations,
    readout: overviewReadout(locations, extracted.profiles_without_reviews, extracted.not_extracted),
    google: {
      ...google,
      readout: overviewReadout(asGoogle, google.profiles_without_reviews, google.not_extracted, true),
      refreshed: refreshed.length,
      oldest_checked_at: refreshed.length ? refreshed.map((l) => l.google_checked_at as string).sort()[0]! : null,
    },
  };
}

/** Display name of a group value (region codes become "Region VII (Central Visayas)"). */
const groupLabel = (groupBy: GroupBy, value: string | null) => (value === null ? "Unassigned" : groupBy === "region" ? (regionName(value) ?? value) : value);

/** Row order: areas and segments in the sample dashboard's order, everything else A-Z; Unassigned last. */
function groupOrder(groupBy: GroupBy) {
  const order = groupBy === "area" ? AREA_ORDER : groupBy === "segment" ? SEGMENT_ORDER : null;
  const rank = (g: string) => (g === "Unassigned" ? Infinity : order ? order.indexOf(g) : 0);
  return (a: { group: string }, b: { group: string }) => rank(a.group) - rank(b.group) || (a.group === "Unassigned" ? 0 : a.group.localeCompare(b.group));
}

export async function getReputationInsights(tx: Tx, visibleIds: string[] | null, query: GroupByQuery, timeZone: string): Promise<ReputationInsights> {
  const sc = insightScope(visibleIds, query, timeZone);
  const col = await groupColumn(tx, query.group_by);
  const join = periodJoin(sc);
  // Attention and Escalation look at the last 30 days, or at the whole period when it ended before today.
  const since30 = sc.to && sc.from ? Prisma.sql`${sc.from}::timestamptz` : Prisma.sql`now() - interval '30 days'`;

  const [groupRows, totals, comparison] = !sc.any
    ? [[], [], null]
    : await Promise.all([
        tx.$queryRaw<{ grp: string | null; locations: number; reviews: number; avg_rating: number | null; replied: number; recent90: number; recent30: number; low30: number }[]>`
          select ${col} as grp, count(distinct l.id)::int as locations, count(r.id)::int as reviews,
            round(avg(r.rating)::numeric, 2)::float8 as avg_rating,
            count(r.reply_comment)::int as replied,
            (count(r.id) filter (where r.create_time >= now() - interval '90 days'))::int as recent90,
            (count(r.id) filter (where r.create_time >= ${since30}))::int as recent30,
            (count(r.id) filter (where r.create_time >= ${since30} and r.rating <= 2))::int as low30
          from public.locations l
          left join public.reviews r on r.location_id = l.id ${join}
          where ${sc.location}
          group by 1`,
        tx.$queryRaw<{ profiles: number; profiles_with_reviews: number; not_extracted: number; reviews: number; avg_rating: number | null; replied: number; median_reply_days: number | null; measured_replies: number; median_measured_days: number | null; measured_since: Date | null; escalations: number }[]>`
          with loc as (
            select l.id, count(r.id) as n,
              (l.last_synced_at is null and l.sync_cursor is null and l.backfill_completed_at is null) as never
            from public.locations l left join public.reviews r on r.location_id = l.id ${join}
            where ${sc.location} group by l.id
          )
          select (select count(*)::int from loc) as profiles,
            (select count(*)::int from loc where n > 0) as profiles_with_reviews,
            (select count(*)::int from loc where never and n = 0) as not_extracted,
            count(*)::int as reviews,
            round(avg(r.rating)::numeric, 2)::float8 as avg_rating,
            count(r.reply_comment)::int as replied,
            -- Replies dated before their review are left out: the review date is the reviewer's later edit, or Google
            -- rounded the reply to "a year ago". Their true delay is unknown.
            (percentile_cont(0.5) within group (order by extract(epoch from (r.reply_time - r.create_time)) / 86400)
              filter (where r.reply_time is not null and r.reply_time >= r.create_time))::float8 as median_reply_days,
            (count(*) filter (where r.reply_time_source = 'observed' and r.reply_time >= r.create_time))::int as measured_replies,
            (percentile_cont(0.5) within group (order by extract(epoch from (r.reply_time - r.create_time)) / 86400)
              filter (where r.reply_time_source = 'observed' and r.reply_time >= r.create_time))::float8 as median_measured_days,
            min(r.reply_seen_at) filter (where r.reply_time_source = 'observed' and r.reply_time >= r.create_time) as measured_since,
            (count(*) filter (where r.rating <= 2 and r.reply_comment is null and r.create_time >= ${since30}))::int as escalations
          ${JOIN}
          where ${sc.review}`,
        comparePeriods(tx, sc, col, query),
      ]);

  const groups: GroupPerformance[] = groupRows
    .map((g) => {
      const reply = pct(g.replied, g.reviews);
      return {
        group: groupLabel(query.group_by, g.grp),
        locations: g.locations,
        reviews: g.reviews,
        avg_rating: g.reviews > 0 ? g.avg_rating : null,
        health: ratingSignal(g.reviews > 0 ? g.avg_rating : null),
        // Reviews per location per month: over the last 90 days, or over the whole period when it ended before today.
        activity: activitySignal(g.locations > 0 ? (sc.lengthMonths ? g.reviews / sc.lengthMonths : g.recent90 / 3) / g.locations : null),
        response: responseStatus(reply),
        attention: attentionLevel(pct(g.low30, g.recent30)),
      };
    })
    .sort(groupOrder(query.group_by));

  const t = totals[0];
  const reviews = t?.reviews ?? 0;
  const replyPct = pct(t?.replied ?? 0, reviews);
  const profiles = t?.profiles ?? 0;
  const covered = t?.profiles_with_reviews ?? 0;
  const median = t?.median_reply_days ?? null;
  const escalations = t?.escalations ?? 0;
  const window = sc.to ? (sc.lengthMonths === 1 && sc.period.preset === "last_month" ? "in that month" : "in that period") : "in the last 30 days";
  const cards: StatusCard[] = [
    {
      key: "coverage",
      title: "Network Coverage",
      signal: profiles > 0 && covered === profiles ? { label: "Full Portfolio", tone: "success" } : { label: profiles === 0 ? "No locations" : "Partial", tone: profiles === 0 ? "neutral" : "warning" },
      detail:
        `${covered} of ${profiles} profiles have reviews in this period` +
        ((t?.not_extracted ?? 0) > 0 ? `; ${t?.not_extracted} not extracted yet` : ""),
      value: covered,
      reviews,
    },
    { key: "rating", title: "Rating Health", signal: ratingSignal(t?.avg_rating ?? null), detail: t?.avg_rating ? `${t.avg_rating.toFixed(2)}★ across ${reviews.toLocaleString("en-US")} reviews` : "No reviews", value: t?.avg_rating ?? null, reviews },
    { key: "response_coverage", title: "Response Coverage", signal: responseCoverage(replyPct), detail: replyPct === null ? "No reviews" : `${replyPct.toFixed(0)}% of reviews have an owner reply`, value: replyPct, reviews },
    responseSpeedCard(t?.median_measured_days ?? null, t?.measured_replies ?? 0, t?.measured_since ?? null, median, t?.replied ?? 0, timeZone),
    {
      key: "escalation",
      title: "Escalation Watch",
      signal: escalations > 0 ? { label: "Active Monitoring", tone: "warning" } : { label: "Clear", tone: "success" },
      detail: escalations > 0 ? `${escalations} unreplied 1-2★ review${escalations === 1 ? "" : "s"} ${window}` : `No unreplied 1-2★ reviews ${window}`,
      value: escalations,
      reviews,
    },
  ];
  const groupWord = query.group_by === "type" || query.group_by === "segment" ? "type" : "region";
  return { cards, groups, highlights: reputationHighlights(groups, replyPct, escalations, groupWord, window, comparison ? changeHighlights(comparison) : []) };
}

/**
 * The period and the one before it, side by side, for the Reputation highlights (lib/insights/narrative.ts
 * changeHighlights): per group, rating, replies and measured reply speed; per theme, the negative share; per group,
 * how many reviews with text are commendations. Null for all time (nothing before it).
 */
async function comparePeriods(tx: Tx, sc: InsightScope, col: Prisma.Sql, query: GroupByQuery): Promise<PeriodComparison | null> {
  if (!sc.prev || !sc.from) return null;
  // The period and the comparison period need not touch (same dates last year, custom dates): count each on its own.
  const inCur = Prisma.sql`r.create_time >= ${sc.from} ${sc.to ? Prisma.sql`and r.create_time < ${sc.to}` : Prisma.empty}`;
  const window = Prisma.sql`and ((${inCur}) or (r.create_time >= ${sc.prev.from} and r.create_time < ${sc.prev.to}))`;
  const p = Prisma.sql`case when ${inCur} then 'cur' else 'prev' end`;
  const observed = Prisma.sql`r.reply_time_source = 'observed' and r.reply_time >= r.create_time`;
  const [figures, texts] = await Promise.all([
    tx.$queryRaw<{ grp: string | null; p: "cur" | "prev"; reviews: number; stars: number; replied: number; measured: number; median_days: number | null }[]>`
      select ${col} as grp, ${p} as p, count(*)::int as reviews, coalesce(sum(r.rating), 0)::int as stars,
        count(r.reply_comment)::int as replied, (count(*) filter (where ${observed}))::int as measured,
        (percentile_cont(0.5) within group (order by extract(epoch from (r.reply_time - r.create_time)) / 86400)
          filter (where ${observed}))::float8 as median_days
      ${JOIN} where ${sc.location} ${window}
      group by 1, 2`,
    tx.$queryRaw<{ id: string; rating: number; comment: string; grp: string | null; p: "cur" | "prev" }[]>`
      select r.id, r.rating::int as rating, r.comment, ${col} as grp, ${p} as p
      ${JOIN} where ${sc.location} ${window} and r.comment is not null and btrim(r.comment) <> ''`,
  ]);

  const blank = (): PeriodFigures => ({ reviews: 0, rating: null, replyPct: null, measured: 0, medianDays: null, textReviews: 0, commendations: 0 });
  const groups = new Map<string | null, { cur: PeriodFigures; prev: PeriodFigures; stars: { cur: number; prev: number } }>();
  const groupOf = (grp: string | null) => groups.get(grp) ?? groups.set(grp, { cur: blank(), prev: blank(), stars: { cur: 0, prev: 0 } }).get(grp)!;
  const network = { cur: blank(), prev: blank() };
  const netStars = { cur: 0, prev: 0 };
  const netReplied = { cur: 0, prev: 0 };
  for (const f of figures) {
    const g = groupOf(f.grp);
    Object.assign(g[f.p], { reviews: f.reviews, replyPct: pct(f.replied, f.reviews), measured: f.measured, medianDays: f.median_days });
    g.stars[f.p] = f.stars;
    network[f.p].reviews += f.reviews;
    netStars[f.p] += f.stars;
    netReplied[f.p] += f.replied;
  }
  const tallies = { cur: {} as Tally, prev: {} as Tally };
  for (const r of texts) {
    const found = classifyCached(r.id, r.comment, r.rating);
    tally(tallies[r.p], found);
    const g = groupOf(r.grp)[r.p];
    g.textReviews++;
    if (found.has("commendations")) g.commendations++;
  }
  const avg = (sum: number, n: number) => (n > 0 ? Math.round((sum / n) * 100) / 100 : null);
  for (const k of ["cur", "prev"] as const) {
    network[k].rating = avg(netStars[k], network[k].reviews);
    network[k].replyPct = pct(netReplied[k], network[k].reviews);
  }
  return {
    previous: sc.prevLabel ?? "the previous period",
    network,
    groups: [...groups].map(([grp, g]) => ({
      group: groupLabel(query.group_by, grp),
      cur: { ...g.cur, rating: avg(g.stars.cur, g.cur.reviews) },
      prev: { ...g.prev, rating: avg(g.stars.prev, g.prev.reviews) },
    })),
    themes: THEMES.filter((t) => t.kind === "issue").map((t) => {
      const [cur, prev] = [themeStat(t, tallies.cur), themeStat(t, tallies.prev)];
      return { label: t.label, cur: { mentions: cur.mentions, negativePct: cur.negative_pct }, prev: { mentions: prev.mentions, negativePct: prev.negative_pct } };
    }),
  };
}

/** Mentions per theme and how they feel, as m_/p_/x_/n_ counts (see themeStat); t_ = judged from the words. */
type Tally = Record<string, number>;
function tally(into: Tally, found: ReturnType<typeof classifyCached>) {
  for (const [key, v] of found) {
    into[`m_${key}`] = (into[`m_${key}`] ?? 0) + 1;
    const k = v.sentiment === "positive" ? "p" : v.sentiment === "mixed" ? "x" : "n";
    into[`${k}_${key}`] = (into[`${k}_${key}`] ?? 0) + 1;
    if (v.fromText) into[`t_${key}`] = (into[`t_${key}`] ?? 0) + 1;
  }
}

function themeStat(t: ThemeDef, row: Record<string, number>): ThemeStat {
  const m = row[`m_${t.key}`] ?? 0;
  const positive = pct(row[`p_${t.key}`] ?? 0, m);
  const negative = pct(row[`n_${t.key}`] ?? 0, m);
  return {
    key: t.key,
    label: t.label,
    kind: t.kind,
    mentions: m,
    positive_pct: positive,
    mixed_pct: pct(row[`x_${t.key}`] ?? 0, m),
    negative_pct: negative,
    signal: t.kind === "commendation" ? commendationSignal(positive) : themeSignal(negative),
  };
}


export async function getThemeInsights(tx: Tx, visibleIds: string[] | null, query: GroupByQuery, timeZone: string): Promise<ThemeInsights> {
  const sc = insightScope(visibleIds, query, timeZone);
  const col = await groupColumn(tx, query.group_by);
  const text = Prisma.sql`${sc.review} and r.comment is not null and btrim(r.comment) <> ''`;

  // Sentiment is read from the words of each review (lib/insights/sentiment.ts), so the text is classified here
  // rather than counted in SQL. Newest first, so the driver quotes below are the latest ones.
  const reviews = !sc.any
    ? []
    : await tx.$queryRaw<{ id: string; rating: number; comment: string; created_at: Date; location_id: string; location: string; grp: string | null }[]>`
        select r.id, r.rating::int as rating, r.comment, r.create_time as created_at, l.id as location_id, l.name as location, ${col} as grp
        ${JOIN} where ${text}
        order by r.create_time desc, r.id desc`;
  const row: Tally = {};
  const groupTallies = new Map<string | null, Tally>();
  const classified = reviews.map((r) => {
    const found = classifyCached(r.id, r.comment, r.rating);
    tally(row, found);
    const g = groupTallies.get(r.grp) ?? {};
    tally(g, found);
    groupTallies.set(r.grp, g);
    return { review: r, found };
  });
  const themes = THEMES.map((t) => themeStat(t, row));
  const mentions = themes.reduce((a, t) => a + t.mentions, 0);
  const fromText = THEMES.reduce((a, t) => a + (row[`t_${t.key}`] ?? 0), 0);

  const issues = themes.filter((t) => t.kind === "issue" && t.mentions >= MIN_DRIVER_MENTIONS);
  const positiveDrivers = [...issues].sort((a, b) => (b.positive_pct ?? 0) - (a.positive_pct ?? 0)).slice(0, 3);
  const negativeDrivers = [...issues].sort((a, b) => (b.negative_pct ?? 0) - (a.negative_pct ?? 0)).filter((t) => (t.negative_pct ?? 0) > 0).slice(0, 3);

  // Two quotes per driver: the newest reviews whose words say so about that theme, never the same review twice.
  const pick = (drivers: ThemeStat[], sentiment: "positive" | "negative") => {
    const used = new Set<string>();
    return drivers.map((t) => {
      const chosen: ThemeQuote[] = [];
      for (const { review: r, found } of classified) {
        if (chosen.length === 2) break;
        const f = found.get(t.key);
        if (!f || !f.fromText || f.sentiment !== sentiment || used.has(r.id) || r.comment.length < 40) continue;
        used.add(r.id);
        chosen.push({ id: r.id, location_id: r.location_id, location: r.location, rating: r.rating, created_at: r.created_at.toISOString(), comment: r.comment.replace(/\s+/g, " ").slice(0, 280) });
      }
      return { key: t.key, label: t.label, quotes: chosen };
    });
  };
  const pos = pick(positiveDrivers, "positive");
  const neg = pick(negativeDrivers, "negative");

  const heatmap = [...groupTallies]
    .map(([grp, g]) => ({
      group: groupLabel(query.group_by, grp),
      cells: THEMES.map((t) => {
        const s = themeStat(t, g);
        return {
          key: t.key,
          mentions: s.mentions,
          level: s.mentions === 0 ? { label: "-", tone: "neutral" as const } : t.kind === "commendation" ? commendationSignal(s.positive_pct) : issueLevel(s.negative_pct),
        };
      }),
    }))
    .sort(groupOrder(query.group_by));

  const flagged = themes.filter((t) => t.kind === "issue" && t.mentions > 0 && (t.signal.label === "Priority" || t.signal.label === "Watch"));
  // Where each flagged theme is worst: its mentions and negative mentions per location.
  const places = new Map<string, Map<string, Hotspot>>();
  for (const { review: r, found } of classified) {
    for (const t of flagged) {
      const f = found.get(t.key);
      if (!f) continue;
      const byLocation = places.get(t.key) ?? new Map<string, Hotspot>();
      const h = byLocation.get(r.location_id) ?? { id: r.location_id, name: r.location, mentions: 0, negative: 0 };
      h.mentions++;
      if (f.sentiment === "negative") h.negative++;
      byLocation.set(r.location_id, h);
      places.set(t.key, byLocation);
    }
  }
  const actions = recommendedActions(
    [...flagged]
      .sort((a, b) => (b.negative_pct ?? 0) - (a.negative_pct ?? 0))
      .map((t) => ({ label: t.label, action: THEMES.find((x) => x.key === t.key)!.action, hotspots: hotspotsOf([...(places.get(t.key)?.values() ?? [])], t.negative_pct ?? 0) })),
  );

  return {
    reviews_with_text: reviews.length,
    text_share_pct: pct(fromText, mentions),
    themes,
    positive_drivers: pos,
    negative_drivers: neg,
    heatmap,
    insight: managementInsight(themes),
    actions,
  };
}

/**
 * Review Intelligence drill-down: every review in scope that mentions `query.theme`, grouped by location. The reviews
 * and classification are the same as getThemeInsights, so the counts match the theme tile and the heatmap.
 */
export async function getThemeReviews(tx: Tx, visibleIds: string[] | null, query: ThemeReviewsQuery, timeZone: string): Promise<ThemeReviews> {
  const theme = themeByKey.get(query.theme)!;
  const sc = insightScope(visibleIds, query, timeZone);
  const rows = !sc.any
    ? []
    : await tx.$queryRaw<{ id: string; rating: number; comment: string; created_at: Date; location_id: string; location: string; unanswered: boolean }[]>`
        select r.id, r.rating::int as rating, r.comment, r.create_time as created_at, l.id as location_id, l.name as location,
          r.reply_comment is null as unanswered
        ${JOIN} where ${sc.review} and r.comment is not null and btrim(r.comment) <> ''
        order by r.create_time desc, r.id desc`;
  const mentioning = rows.flatMap((r) => {
    const found = classifyCached(r.id, r.comment, r.rating).get(theme.key);
    return found ? [{ ...r, sentiment: found.sentiment }] : [];
  });
  return groupThemeReviews(theme, mentioning, query);
}
