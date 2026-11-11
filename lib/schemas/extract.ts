import { z } from "zod";
import { CX_PULSE_COLUMNS, orderCsvColumns } from "@/lib/export/review-columns";
import { uuidSchema } from "./common";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const ratingList = z
  .string()
  .regex(/^[1-5](,[1-5]){0,4}$/, "Use comma-separated values from 1 to 5")
  .transform((s) => [...new Set(s.split(",").map(Number))]);

const yesNo = z.enum(["yes", "no"]);
/** Reply time buckets: within a day, 1-7 days, over 7 days (reviews.reply_hours). */
export const REPLY_TIMES = ["day", "week", "slow"] as const;
export type ReplyTime = (typeof REPLY_TIMES)[number];
/** Where the search text is looked for. */
export const SEARCH_IN = ["all", "comment", "reply", "name"] as const;
export type SearchIn = (typeof SEARCH_IN)[number];

/** Filters shared by the reviews table and the CSV export. */
export const reviewFilterSchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  location_id: uuidSchema.optional(),
  group_id: uuidSchema.optional(),
  /** Location type (Hospital, Outpatient Center, ...), or UNASSIGNED for locations with no type. */
  location_type: z.string().trim().max(50).optional(),
  /** Region code (lib/ph-regions.ts), or UNASSIGNED. */
  region: z.string().trim().max(50).optional(),
  island: z.enum(["Luzon", "Visayas", "Mindanao"]).optional(),
  rating: ratingList.optional(),
  replied: yesNo.optional(),
  has_comment: yesNo.optional(),
  reply_time: z.enum(REPLY_TIMES).optional(),
  q: z.string().trim().max(100).optional(),
  search_in: z.enum(SEARCH_IN).default("all"),
});
export type ReviewFilter = z.output<typeof reviewFilterSchema>;

const fromNotAfterTo = (q: { from?: string; to?: string }) => !q.from || !q.to || q.from <= q.to;

/** Columns the reviews table can be sorted by. `name` orders by the reviewer's full name, so by first name. */
export const REVIEW_SORTS = ["date", "rating", "reference", "branch", "name", "location", "type", "comment"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
const reviewSortFields = {
  sort: z.enum(REVIEW_SORTS).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
};

/**
 * The CSV takes the table's sort too, so the file lists the reviews in the order the table shows them, and the columns
 * to include (comma-separated REVIEW_CSV_COLUMNS ids, put in file order); without `columns` it is the CX Pulse layout.
 */
export const exportReviewsQuerySchema = reviewFilterSchema
  .extend({
    ...reviewSortFields,
    columns: z
      .string()
      .max(500)
      .optional()
      .transform((s) => (s ? orderCsvColumns(s.split(",")) : CX_PULSE_COLUMNS))
      .refine((c) => c.length > 0, "Choose at least one column"),
  })
  .refine(fromNotAfterTo, { message: "`from` must not be after `to`", path: ["from"] });
export const listReviewsQuerySchema = reviewFilterSchema
  .extend({
    ...reviewSortFields,
    page: z.coerce.number().int().min(0).max(10_000).default(0),
    pageSize: z.coerce.number().int().min(10).max(100).default(25),
  })
  .refine(fromNotAfterTo, { message: "`from` must not be after `to`", path: ["from"] });
export type ListReviewsQuery = z.input<typeof listReviewsQuerySchema>;

/** One review in the CX Pulse sheet shape. */
export interface ReviewRow {
  id: string;
  reference: string;
  /** MM/DD/YYYY H:MM in the export time zone. */
  datetime: string;
  created_at: string;
  branch: string;
  first_name: string;
  middle_name: string;
  reviewer_url: string | null;
  last_name: string;
  location: string;
  location_id: string;
  /** Hospital, Outpatient Center, ... (null = not set). */
  location_type: string | null;
  /** The location's clients, comma-separated ("" = none). */
  client: string;
  /** Region name (null = not set). */
  region: string | null;
  rating: number;
  comment: string | null;
  reply: string | null;
  /** MM/DD/YYYY H:MM in the export time zone; approximate when Google only gave "3 weeks ago". */
  reply_date: string | null;
}

export interface ReviewsPage {
  rows: ReviewRow[];
  total: number;
}

export const extractRequestSchema = z.object({
  /** Omit for every accessible active location. */
  location_ids: z.array(uuidSchema).min(1).max(2000).optional(),
});
export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export type ExtractState = "never" | "extracting" | "backfilling" | "catching_up" | "up_to_date" | "error";

export interface ExtractLocationRow {
  id: string;
  name: string;
  address: string | null;
  branch_prefix: string | null;
  /** Philippine region code (lib/ph-regions.ts). */
  region: string | null;
  location_type: string | null;
  google_rating: number | null;
  google_checked_at: string | null;
  is_active: boolean;
  clients: { id: string; name: string }[];
  review_count: number;
  /** Google's public review count from the last "Refresh Google totals", for a completeness check. */
  source_review_count: number | null;
  state: ExtractState;
  last_error: string | null;
  last_synced_at: string | null;
}

export interface SyncSummaryDto {
  run_id: string;
  status: "success" | "partial" | "failed";
  locations_found: number;
  processed: number;
  remaining: number;
  failed: number;
  reviews_upserted: number;
  credits_used: number;
  error: string | null;
}

export interface ExtractStatusDto {
  configured: boolean;
  credits_today: number;
  daily_credit_limit: number;
  /** The caller's own spend today and their personal daily limit. */
  my_credits_today: number;
  my_daily_credit_limit: number;
  max_credits_per_run: number;
  last_run: {
    status: string;
    started_at: string;
    finished_at: string | null;
    error: string | null;
    reviews_upserted: number;
    credits_used: number;
  } | null;
}
