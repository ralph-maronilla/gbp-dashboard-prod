import type { ExportParams } from "@/lib/client/export";
import { REPLY_TIMES, SEARCH_IN, type ReplyTime, type SearchIn } from "@/lib/schemas/extract";

/** The Extraction reviews table's filters ("" = not set). Kept in the page URL so a filtered view can be shared. */
export interface ReviewFilterState {
  locationId: string;
  groupId: string;
  /** Location type ("" = all, UNASSIGNED = locations with no type). */
  locationType: string;
  /** Region code or UNASSIGNED. */
  region: string;
  island: "" | "Luzon" | "Visayas" | "Mindanao";
  from: string;
  to: string;
  rating: string;
  replied: "" | "yes" | "no";
  hasComment: "" | "yes" | "no";
  replyTime: "" | ReplyTime;
  searchIn: SearchIn;
}

export const EMPTY_REVIEW_FILTER: ReviewFilterState = {
  locationId: "",
  groupId: "",
  locationType: "",
  region: "",
  island: "",
  from: "",
  to: "",
  rating: "",
  replied: "",
  hasComment: "",
  replyTime: "",
  searchIn: "all",
};

/** Query-string name of each filter (the same names the reviews API takes). */
const URL_KEYS: Record<keyof ReviewFilterState, string> = {
  locationId: "location_id",
  groupId: "group_id",
  locationType: "type",
  region: "region",
  island: "island",
  from: "from",
  to: "to",
  rating: "rating",
  replied: "replied",
  hasComment: "has_comment",
  replyTime: "reply_time",
  searchIn: "search_in",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T => {
  const s = v ?? "";
  return (values as readonly string[]).includes(s) ? (s as T) : fallback;
};

/** The filters in a URL; anything malformed is ignored (the API checks everything again). */
export function parseReviewFilter(p: URLSearchParams): ReviewFilterState {
  const text = (k: keyof ReviewFilterState, max = 100) => (p.get(URL_KEYS[k]) ?? "").slice(0, max);
  const day = (k: "from" | "to") => (DAY.test(text(k)) ? text(k) : "");
  return {
    locationId: text("locationId"),
    groupId: text("groupId"),
    locationType: text("locationType", 50),
    region: text("region", 50),
    island: oneOf(["", "Luzon", "Visayas", "Mindanao"], p.get(URL_KEYS.island), ""),
    from: day("from"),
    to: day("to"),
    rating: /^[1-5](,[1-5]){0,4}$/.test(text("rating")) ? text("rating") : "",
    replied: oneOf(["", "yes", "no"], p.get(URL_KEYS.replied), ""),
    hasComment: oneOf(["", "yes", "no"], p.get(URL_KEYS.hasComment), ""),
    replyTime: oneOf(["", ...REPLY_TIMES], p.get(URL_KEYS.replyTime), ""),
    searchIn: oneOf(SEARCH_IN, p.get(URL_KEYS.searchIn), "all"),
  };
}

/** Query string of the filters that differ from the defaults (other query keys in `current` are kept). */
export function reviewFilterQuery(filter: ReviewFilterState, current: URLSearchParams): string {
  const p = new URLSearchParams(current);
  for (const k of Object.keys(URL_KEYS) as (keyof ReviewFilterState)[]) {
    if (filter[k] !== EMPTY_REVIEW_FILTER[k]) p.set(URL_KEYS[k], filter[k]);
    else p.delete(URL_KEYS[k]);
  }
  return p.toString();
}

/** API parameters for the table and the CSV. `q` is the (debounced) search text. */
export function reviewFilterParams(filter: ReviewFilterState, q: string): ExportParams {
  return {
    location_id: filter.locationId || undefined,
    group_id: filter.groupId || undefined,
    location_type: filter.locationType || undefined,
    region: filter.region || undefined,
    island: filter.island || undefined,
    from: filter.from || undefined,
    to: filter.to || undefined,
    rating: filter.rating || undefined,
    replied: filter.replied || undefined,
    has_comment: filter.hasComment || undefined,
    reply_time: filter.replyTime || undefined,
    q: q || undefined,
    // Only sent with a search, so the default ("all") never shows up in a request.
    search_in: q && filter.searchIn !== "all" ? filter.searchIn : undefined,
  };
}
