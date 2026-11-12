import { z } from "zod";
import { COMPARE_MODE_KEYS, isDay, RANGE_PRESET_KEYS, type CompareMode, type DayRange, type RangePreset } from "@/lib/insights/date-ranges";
import { uuidSchema } from "./common";
import type { Signal } from "@/lib/insights/signals";
import type { Sentiment } from "@/lib/insights/sentiment";
import { THEME_KEYS, type ThemeKey } from "@/lib/insights/themes";

/** The last full calendar month (e.g. all of September on 29 October). */
export const LAST_MONTH = -1;
/** Months up to now; LAST_MONTH; 0 = all time. */
export const INSIGHT_PERIODS = [LAST_MONTH, 3, 6, 12, 24, 0] as const;
/** Region/Type filter value for locations without one. */
export const UNASSIGNED = "__unassigned";

const label = z.string().trim().min(1).max(50);

const daySchema = z.string().refine(isDay, "Use a date, YYYY-MM-DD");

/**
 * Filters shared by every Dashboard tab. The period is a preset `range` or custom `from`-`to` days (Manila time); `months`
 * is still accepted from old links (-1 last month, 3, 6, 12, 24, 0 all time). Without any, All time. `vs` (with
 * `vs_from`-`vs_to` for custom) is the comparison period: the Reputation highlights compare against it and the Review
 * Overview comparison shows it. Ranges are checked and resolved in lib/data/insight-scope.ts (resolveInsightPeriod).
 */
export const insightsQuerySchema = z.object({
  range: z.enum(RANGE_PRESET_KEYS).optional(),
  from: daySchema.optional(),
  to: daySchema.optional(),
  months: z.coerce
    .number()
    .int()
    .refine((n) => (INSIGHT_PERIODS as readonly number[]).includes(n), "Use -1 (last month), 3, 6, 12, 24 or 0 (all time)")
    .optional(),
  vs: z.enum(COMPARE_MODE_KEYS).optional(),
  vs_from: daySchema.optional(),
  vs_to: daySchema.optional(),
  group_id: uuidSchema.optional(),
  location_id: uuidSchema.optional(),
  /** Region code (lib/ph-regions.ts) or UNASSIGNED. */
  region: label.optional(),
  island: z.enum(["Luzon", "Visayas", "Mindanao"]).optional(),
  location_type: label.optional(),
  /** Chart buckets; auto picks month, quarter or year from the length of the period. */
  granularity: z.enum(["auto", "month", "quarter", "year"]).default("auto"),
});
export type InsightsQuery = z.output<typeof insightsQuerySchema>;

/**
 * The Compare-to side of a Dashboard tab (lib/data/insight-scope.ts withCompare): the same data for the compared dates.
 * Null without Compare to, or for All time.
 */
export interface CompareSide<T> {
  /** "Sep 1 – 30, 2026". */
  label: string;
  range: DayRange;
  /** The two ranges have the same number of days; otherwise counts (volumes) differ just by length. */
  same_length: boolean;
  data: T;
}
export type WithCompare<T> = T & { compare?: CompareSide<T> | null };

/** Review Overview comparison: the Dashboard period against `vs` (default: the period just before it). */
export const compareQuerySchema = insightsQuerySchema.omit({ granularity: true }).extend({ vs: z.enum(COMPARE_MODE_KEYS).default("previous") });
export type CompareQuery = z.output<typeof compareQuerySchema>;

/** Area and segment follow the Healthway sample dashboard (lib/ph-regions.ts AREA_ORDER, SEGMENT_ORDER). */
export const GROUP_BYS = ["area", "segment", "region", "island", "type"] as const;
export type GroupBy = (typeof GROUP_BYS)[number];
export const groupByQuerySchema = insightsQuerySchema.extend({ group_by: z.enum(GROUP_BYS).default("area") });
export type GroupByQuery = z.output<typeof groupByQuerySchema>;

/** Review Intelligence: the reviews that mention one theme, grouped by location. */
export const THEME_SENTIMENTS = ["all", "negative", "mixed", "positive"] as const;
export type ThemeSentimentFilter = (typeof THEME_SENTIMENTS)[number];
export const themeReviewsQuerySchema = insightsQuerySchema.extend({
  theme: z.enum(THEME_KEYS),
  sentiment: z.enum(THEME_SENTIMENTS).default("all"),
  q: z.string().trim().max(100).optional(),
  /** Show more: the next page of one location (`location_id` set). */
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ThemeReviewsQuery = z.output<typeof themeReviewsQuerySchema>;

/** Review Intelligence Excel export: every theme, or one theme as filtered in the theme panel. */
export const themeExportQuerySchema = insightsQuerySchema.extend({
  theme: z.enum(THEME_KEYS).optional(),
  sentiment: z.enum(THEME_SENTIMENTS).default("all"),
  q: z.string().trim().max(100).optional(),
});
export type ThemeExportQuery = z.output<typeof themeExportQuerySchema>;

export interface ThemeReview {
  id: string;
  rating: number;
  created_at: string;
  comment: string;
  sentiment: Sentiment;
  unanswered: boolean;
  /** [start, end) of each theme keyword in `comment`, for highlighting. */
  marks: [number, number][];
}

export interface ThemeReviewLocation {
  location_id: string;
  location: string;
  /** All of this theme's mentions at the location (before the sentiment and search filters). */
  mentions: number;
  negative_pct: number | null;
  positive_pct: number | null;
  /** Reviews that pass the filters; `reviews` is one page of them, newest first. */
  matching: number;
  reviews: ThemeReview[];
}

export interface ThemeReviews {
  theme: ThemeKey;
  label: string;
  kind: "issue" | "commendation";
  /** Reviews per sentiment after the search filter (the chips' counts). */
  counts: Record<ThemeSentimentFilter, number>;
  locations: ThemeReviewLocation[];
}


export interface LocationPerformance {
  id: string;
  name: string;
  /** Extracted reviews in the selected period. */
  avg_rating: number | null;
  reviews: number;
  signal: Signal;
  /** Google's public figures from the last refresh (null if never refreshed). */
  google_rating: number | null;
  google_reviews: number | null;
  google_checked_at: string | null;
  google_signal: Signal;
  /** never = no extraction yet (reviews unknown, not "no reviews"); partial = extraction started but not finished. */
  extraction: "complete" | "partial" | "never";
}

export interface OverviewTotals {
  profiles: number;
  profiles_with_reviews: number;
  /** Fully extracted (or Google-confirmed) locations with no reviews. Never-extracted locations are not counted here. */
  profiles_without_reviews: number;
  /** Locations whose reviews are unknown because they were never extracted (and, in the Google view, not refreshed). */
  not_extracted: number;
  total_reviews: number;
  weighted_rating: number | null;
}

export interface OverviewInsights extends OverviewTotals {
  locations: LocationPerformance[];
  readout: string[];
  /** The same figures from Google's public totals; locations never refreshed count with their extracted numbers. */
  google: OverviewTotals & {
    readout: string[];
    /** Locations in scope that have Google totals, and the oldest refresh among them. */
    refreshed: number;
    oldest_checked_at: string | null;
  };
}

export interface StatusCard {
  /** "measured" / "approx." badge for the response speed card. */
  note?: string;
  key: "coverage" | "rating" | "response_coverage" | "response_speed" | "escalation";
  title: string;
  signal: Signal;
  detail: string;
  /**
   * The card's figure, for changes against Compare to: profiles with reviews, average rating, reply %, days to reply,
   * unreplied 1-2★ reviews. Null when there is none. `reviews` = reviews behind it (ratings and rates need enough).
   */
  value: number | null;
  reviews: number;
}

export interface GroupPerformance {
  group: string;
  locations: number;
  reviews: number;
  avg_rating: number | null;
  health: Signal;
  activity: Signal;
  response: Signal;
  attention: Signal;
}

export interface ReputationInsights {
  cards: StatusCard[];
  groups: GroupPerformance[];
  highlights: string[];
}

export interface ThemeStat {
  key: ThemeKey;
  label: string;
  kind: "issue" | "commendation";
  mentions: number;
  positive_pct: number | null;
  mixed_pct: number | null;
  negative_pct: number | null;
  signal: Signal;
}

export interface ThemeQuote {
  id: string;
  location_id: string;
  location: string;
  rating: number;
  created_at: string;
  comment: string;
}

export interface HeatmapRow {
  group: string;
  cells: { key: ThemeKey; level: Signal; mentions: number }[];
}

/** A location named under a Recommended Action: its share of that theme's mentions that are negative. */
export interface ActionLocation {
  location_id: string;
  location: string;
  mentions: number;
  negative_pct: number;
}

export interface RecommendedAction {
  theme: string;
  /** The standard advice for the theme. */
  advice: string;
  /** Worst first, at most a few; `more` counts the others that qualified. */
  most_affected: ActionLocation[];
  more: number;
}

/** One month's figures for a location (or the whole network). */
export interface CompareFigures {
  reviews: number;
  /** Null when there are no reviews. */
  avg_rating: number | null;
  /** Share (%) of the month's reviews with an owner reply. */
  reply_pct: number | null;
  /** Share (%) of the month's reviews that are 1-2 stars. */
  low_pct: number | null;
}

export interface CompareLocation {
  id: string;
  name: string;
  a: CompareFigures;
  b: CompareFigures;
}

/** One side of the comparison: days in Manila time, both ends included. */
export interface CompareRange {
  from: string;
  to: string;
  /** "Oct 14 – Nov 10, 2026". */
  label: string;
  days: number;
  /** Includes today: not finished, so its volume is not comparable. */
  partial: boolean;
}

export interface CompareInsights {
  a: CompareRange;
  b: CompareRange;
  /** The preset `a` came from (null = custom dates) and how `b` was chosen, as resolved. */
  range: RangePreset | null;
  vs: CompareMode;
  /** Today in Manila time (the last day that can be picked). */
  today: string;
  /** Day of the first review in scope (null = none), the first day worth picking. */
  oldest: string | null;
  network: { a: CompareFigures; b: CompareFigures };
  locations: CompareLocation[];
}

export interface ThemeInsights {
  reviews_with_text: number;
  /** Share (%) of theme mentions whose feeling was read from the words; the rest follow the stars. */
  text_share_pct: number | null;
  themes: ThemeStat[];
  positive_drivers: { key: ThemeKey; label: string; quotes: ThemeQuote[] }[];
  negative_drivers: { key: ThemeKey; label: string; quotes: ThemeQuote[] }[];
  heatmap: HeatmapRow[];
  insight: string;
  actions: RecommendedAction[];
}
