import { COMPARE } from "@/lib/insights/signals";
import type { CompareFigures } from "@/lib/schemas/insights";

/** The four measures of the date-range comparison (Review Overview, Period → Compare to). `better` is the direction that is good news. */
export const MEASURES = [
  { key: "reviews", label: "Review volume", short: "Reviews", better: "up" },
  { key: "rating", label: "Average rating", short: "Rating", better: "up" },
  { key: "reply", label: "Response rate", short: "Response rate", better: "up" },
  { key: "low", label: "Low-rating share (1–2★)", short: "1–2★ share", better: "down" },
] as const;
export type Measure = (typeof MEASURES)[number]["key"];

export const valueOf = (f: CompareFigures, m: Measure): number | null =>
  m === "reviews" ? f.reviews : m === "rating" ? f.avg_rating : m === "reply" ? f.reply_pct : f.low_pct;

/** "-" for no value; volume as a count, rating with two decimals, rates with one. */
export function formatValue(m: Measure, v: number | null): string {
  if (v === null) return "-";
  if (m === "reviews") return v.toLocaleString("en-US");
  return m === "rating" ? `${v.toFixed(2)}★` : `${v.toFixed(1)}%`;
}

export interface Change {
  /** "+0.80★", "-12.4 pts", "+106"; "-" when it cannot be compared. */
  text: string;
  direction: "better" | "worse" | "same" | "none";
  /** Month minus compared-with month; null when `direction` is "none". Sort key. */
  delta: number | null;
}

const NONE: Change = { text: "-", direction: "none", delta: null };

/** How a figure is shown: a count ("+106"), stars ("+0.80★"), percentage points ("-12.4 pts") or days ("-1.5 days"). */
export type ChangeKind = "count" | "stars" | "pts" | "days";
/** Smallest difference that shows as a change at each kind's precision. */
const EPSILON: Record<ChangeKind, number> = { count: 0.5, stars: 0.005, pts: 0.05, days: 0.05 };
const KIND: Record<Measure, ChangeKind> = { reviews: "count", rating: "stars", reply: "pts", low: "pts" };

/**
 * Change from the compared value `y` to the period's value `x`. `better` is the direction that is good news; `enough`
 * false (too few reviews behind a rate) or a missing value gives "-". `better` null: neither direction is good news (no colour).
 */
export function changeBetween(kind: ChangeKind, better: "up" | "down" | null, x: number | null | undefined, y: number | null | undefined, enough = true): Change {
  if (x === null || x === undefined || y === null || y === undefined || !enough) return NONE;
  const delta = Math.round((x - y) * 1e4) / 1e4; // no float noise in the sort key
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const size = Math.abs(delta);
  if (size < EPSILON[kind]) return { text: kind === "count" ? "0" : "no change", direction: "same", delta: 0 };
  const text =
    kind === "count"
      ? `${sign}${Math.round(size).toLocaleString("en-US")}`
      : kind === "stars"
        ? `${sign}${size.toFixed(2)}★`
        : kind === "pts"
          ? `${sign}${size.toFixed(1)} pts`
          : `${sign}${size.toFixed(1)} days`;
  // No good or bad direction (e.g. how often a theme is mentioned): shown without colour.
  if (better === null) return { text, direction: "same", delta };
  return { text, direction: (better === "up") === delta > 0 ? "better" : "worse", delta };
}

/** Rates and ratings are compared only when both sides have at least COMPARE.MIN_REVIEWS reviews (fewer is noise). */
export const enoughReviews = (a: number, b: number, min: number = COMPARE.MIN_REVIEWS) => a >= min && b >= min;

/**
 * Change from the compared-with month (`b`) to the chosen month (`a`). Ratings and rates need at least
 * COMPARE.MIN_REVIEWS reviews in both months (a rate of 3 reviews is noise); volume is always shown.
 */
export function changeOf(m: Measure, a: CompareFigures, b: CompareFigures, minReviews: number = COMPARE.MIN_REVIEWS): Change {
  const better = MEASURES.find((x) => x.key === m)!.better;
  return changeBetween(KIND[m], better, valueOf(a, m), valueOf(b, m), m === "reviews" || enoughReviews(a.reviews, b.reviews, minReviews));
}
