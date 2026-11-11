export interface DashboardMonth {
  /** Bucket in the export time zone: "YYYY-MM", "YYYY-Qn" or "YYYY" (see DashboardData.granularity). */
  month: string;
  total: number;
  avg_rating: number | null;
  low: number;
}

export interface DashboardLocationScore {
  id: string;
  name: string;
  avg_rating: number;
  total: number;
}

export interface DashboardLowReview {
  id: string;
  created_at: string;
  location_id: string;
  location: string;
  rating: number;
  comment: string | null;
}

export interface DashboardData {
  months: number;
  granularity: "month" | "quarter" | "year";
  totals: {
    total: number;
    avg_rating: number | null;
    /** Share of 4 and 5 star reviews, 0-100. */
    positive_pct: number | null;
    /** Share of 1 and 2 star reviews, 0-100. */
    negative_pct: number | null;
    /** Share of reviews with an owner reply, 0-100. */
    reply_pct: number | null;
  };
  monthly: DashboardMonth[];
  /** Counts for 1..5 stars. */
  distribution: number[];
  best: DashboardLocationScore[];
  worst: DashboardLocationScore[];
  recent_low: DashboardLowReview[];
}
