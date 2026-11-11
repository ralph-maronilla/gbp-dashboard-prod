import { COMPARE } from "@/lib/insights/signals";
import type { CompareFigures } from "@/lib/schemas/insights";

/** The four measures of the month comparison (Review Overview, "Compare months"). `better` is the direction that is good news. */
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
/** Smallest difference that shows as a change at each measure's precision. */
const EPSILON: Record<Measure, number> = { reviews: 0.5, rating: 0.005, reply: 0.05, low: 0.05 };

/**
 * Change from the compared-with month (`b`) to the chosen month (`a`). Ratings and rates need at least
 * COMPARE.MIN_REVIEWS reviews in both months (a rate of 3 reviews is noise); volume is always shown.
 */
export function changeOf(m: Measure, a: CompareFigures, b: CompareFigures, minReviews: number = COMPARE.MIN_REVIEWS): Change {
  const [x, y] = [valueOf(a, m), valueOf(b, m)];
  if (x === null || y === null) return NONE;
  if (m !== "reviews" && (a.reviews < minReviews || b.reviews < minReviews)) return NONE;
  const delta = Math.round((x - y) * 1e4) / 1e4; // no float noise in the sort key
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const size = Math.abs(delta);
  const text =
    m === "reviews" ? `${sign}${Math.round(size).toLocaleString("en-US")}` : m === "rating" ? `${sign}${size.toFixed(2)}★` : `${sign}${size.toFixed(1)} pts`;
  if (size < EPSILON[m]) return { text: m === "reviews" ? "0" : "no change", direction: "same", delta: 0 };
  const good = (MEASURES.find((x) => x.key === m)!.better === "up") === delta > 0;
  return { text, direction: good ? "better" : "worse", delta };
}
