import { z } from "zod";
import { uuidSchema } from "./common";

export const locationIdParamsSchema = z.object({ id: uuidSchema });

export const GRANULARITIES = ["week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const locationDetailQuerySchema = z.object({
  granularity: z.enum(GRANULARITIES).default("month"),
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const REVIEW_STATUSES = ["replied", "unanswered"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const reviewsQuerySchema = z.object({
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Comma-separated star values, e.g. "1,2". */
  rating: z
    .string()
    .regex(/^[1-5](,[1-5]){0,4}$/, "Use comma-separated values from 1 to 5")
    .transform((s) => [...new Set(s.split(",").map(Number))])
    .optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  status: z.enum(REVIEW_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ReviewsQuery = z.input<typeof reviewsQuerySchema>;

export interface TrendPoint {
  /** ISO timestamp of the bucket start. */
  bucket: string;
  avg_rating: number | null;
  count: number;
}

export interface LocationDetail {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  removed: boolean;
  last_synced_at: string | null;
  total_reviews: number;
  avg_rating: number | null;
  new_reviews_7d: number;
  unanswered: number;
  low_rating: number;
  granularity: Granularity;
  trend: TrendPoint[];
  /** Index 0 = 1-star count ... index 4 = 5-star count. */
  distribution: [number, number, number, number, number];
}

export interface ReviewRow {
  id: string;
  reviewer_name: string | null;
  rating: number;
  comment: string | null;
  create_time: string;
  reply_comment: string | null;
  reply_time: string | null;
}

export interface ReviewsPage {
  rows: ReviewRow[];
  next_cursor: string | null;
}
