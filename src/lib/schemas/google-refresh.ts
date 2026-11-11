/** Response of POST /api/admin/locations/google-refresh (see lib/data/google-refresh.ts). */
export interface GoogleRefreshResult {
  id: string;
  name: string;
  status: "updated" | "not_found" | "skipped" | "failed";
  rating: number | null;
  review_count: number | null;
  filled: string[];
  error?: string;
}

export interface GoogleRefreshSummary {
  results: GoogleRefreshResult[];
  credits_used: number;
  /** Locations not looked up because the daily credit budget or the time budget ran out. */
  not_done: number;
  /** Why it stopped early, when a credit limit did ("You have used your 200 credits for today…"). */
  limit: string | null;
}

/** Serper Maps lookup cost per location. */
export const CREDITS_PER_LOOKUP = 3;
