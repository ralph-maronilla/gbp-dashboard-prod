/**
 * Review Intelligence drill-down: the reviews that mention one theme, grouped by location. Pure (no database), so the
 * grouping, sorting and paging can be tested; lib/data/insights.ts getThemeReviews loads and classifies the reviews.
 */
import type { Sentiment } from "./sentiment";
import { themeJsRegex, type ThemeDef } from "./themes";
import type { ThemeReview, ThemeReviewLocation, ThemeReviews, ThemeSentimentFilter } from "@/lib/schemas/insights";

export interface ThemeReviewInput {
  id: string;
  rating: number;
  comment: string;
  created_at: Date;
  location_id: string;
  location: string;
  unanswered: boolean;
  /** How this review talks about the theme. */
  sentiment: Sentiment;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** [start, end) of every keyword of `theme` in `text`. */
export function themeMarks(theme: ThemeDef, text: string): [number, number][] {
  return [...text.matchAll(themeJsRegex(theme, "giu"))].map((m) => [m.index!, m.index! + m[0].length]);
}

/**
 * Groups `reviews` (newest first, all mentioning `theme`) by location. Locations are ordered by negative mentions
 * (positive ones for Positive Commendations), then mentions, then name; only locations with a review passing the
 * sentiment and search filters are listed, each with `limit` of them from `offset`.
 */
export function groupThemeReviews(
  theme: ThemeDef,
  reviews: ThemeReviewInput[],
  opts: { sentiment: ThemeSentimentFilter; q?: string; offset: number; limit: number },
): ThemeReviews {
  const q = opts.q?.toLowerCase();
  const counts: Record<ThemeSentimentFilter, number> = { all: 0, negative: 0, mixed: 0, positive: 0 };
  const byLocation = new Map<string, { loc: ThemeReviewLocation; negative: number; positive: number; rows: ThemeReviewInput[] }>();

  for (const r of reviews) {
    const g = byLocation.get(r.location_id) ?? { loc: { location_id: r.location_id, location: r.location, mentions: 0, negative_pct: null, positive_pct: null, matching: 0, reviews: [] }, negative: 0, positive: 0, rows: [] };
    byLocation.set(r.location_id, g);
    g.loc.mentions++;
    if (r.sentiment === "negative") g.negative++;
    if (r.sentiment === "positive") g.positive++;
    if (q && !r.comment.toLowerCase().includes(q)) continue;
    counts.all++;
    counts[r.sentiment]++;
    if (opts.sentiment === "all" || opts.sentiment === r.sentiment) g.rows.push(r);
  }

  const key = theme.kind === "commendation" ? "positive" : "negative";
  const locations = [...byLocation.values()]
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => b[key] - a[key] || b.loc.mentions - a.loc.mentions || a.loc.location.localeCompare(b.loc.location))
    .map(({ loc, negative, positive, rows }) => ({
      ...loc,
      negative_pct: pct(negative, loc.mentions),
      positive_pct: pct(positive, loc.mentions),
      matching: rows.length,
      reviews: rows.slice(opts.offset, opts.offset + opts.limit).map(
        (r): ThemeReview => ({
          id: r.id,
          rating: r.rating,
          created_at: r.created_at.toISOString(),
          comment: r.comment,
          sentiment: r.sentiment,
          unanswered: r.unanswered,
          marks: themeMarks(theme, r.comment),
        }),
      ),
    }));
  return { theme: theme.key, label: theme.label, kind: theme.kind, counts, locations };
}
