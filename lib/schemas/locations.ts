import { z } from "zod";
import { uuidSchema } from "./common";

export const LOCATION_SORT_FIELDS = [
  "name",
  "avg_rating",
  "total_reviews",
  "new_reviews_7d",
  "unanswered",
  "low_rating",
] as const;
export type LocationSortField = (typeof LOCATION_SORT_FIELDS)[number];

export const listLocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(LOCATION_SORT_FIELDS).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().trim().max(100).optional(),
  group_id: uuidSchema.optional(),
});
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;

export interface LocationRow {
  id: string;
  name: string;
  address: string | null;
  last_synced_at: string | null;
  avg_rating: number | null;
  total_reviews: number;
  new_reviews_7d: number;
  unanswered: number;
  /** Reviews rated 1 or 2 stars. */
  low_rating: number;
  /** Average rating per week for the last 12 weeks, oldest first; null = no reviews that week. */
  trend: (number | null)[];
}

export interface LocationsPage {
  rows: LocationRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FailedSync {
  id: string;
  started_at: string;
  location_id: string | null;
  location_name: string | null;
  /** Only populated for admins. */
  error: string | null;
}

export interface OverviewStats {
  location_count: number;
  total_reviews: number;
  avg_rating: number | null;
  new_reviews_7d: number;
  unanswered: number;
  low_rating: number;
  sync: { last_synced_at: string | null; failed_runs: FailedSync[] };
}

export interface GroupSummary {
  id: string;
  name: string;
  location_count: number;
}
