import { z } from "zod";
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

/** Filters shared by every Dashboard tab. */
export const insightsQuerySchema = z.object({
  months: z.coerce
    .number()
    .int()
    .refine((n) => (INSIGHT_PERIODS as readonly number[]).includes(n), "Use -1 (last month), 3, 6, 12, 24 or 0 (all time)")
    .default(12),
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

/** A calendar month, "YYYY-MM". */
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

/** Month comparison (Review Overview, "Compare months"): two months (default: the last full month and the one before it) and the shared location filters. */
export const compareQuerySchema = insightsQuerySchema
  .omit({ months: true, granularity: true })
  .extend({ a: monthSchema.optional(), b: monthSchema.optional() })
  .refine((q) => !q.a || !q.b || q.a !== q.b, { message: "Choose two different months", path: ["b"] });
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

export interface CompareMonth {
  /** "YYYY-MM". */
  month: string;
  /** "Sep 2026". */
  label: string;
  /** The current month: not finished, so its volume is not comparable. */
  partial: boolean;
}

export interface CompareInsights {
  a: CompareMonth;
  b: CompareMonth;
  network: { a: CompareFigures; b: CompareFigures };
  locations: CompareLocation[];
  /** Every month from the oldest review in scope to the current one, newest first. */
  available_months: CompareMonth[];
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
