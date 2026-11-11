import type { ReplyTime, ReviewSort, SearchIn } from "@/lib/schemas/extract";
import { ApiClientError } from "./api-client";

export interface ExportParams {
  from?: string;
  to?: string;
  location_id?: string;
  group_id?: string;
  location_type?: string;
  region?: string;
  island?: "Luzon" | "Visayas" | "Mindanao";
  rating?: string;
  replied?: "yes" | "no";
  has_comment?: "yes" | "no";
  reply_time?: ReplyTime;
  q?: string;
  search_in?: SearchIn;
  /** The reviews table's sort, so the file is in the same order. */
  sort?: ReviewSort;
  order?: "asc" | "desc";
  /** Comma-separated REVIEW_CSV_COLUMNS ids; omitted = the CX Pulse layout. */
  columns?: string;
}

/** Fetches the review CSV and saves it, so API errors (e.g. "too many rows") show up in the UI instead of a bad file. */
export const downloadReviewsCsv = (params: ExportParams, fileName?: string | null) => downloadFile("/api/export/reviews", { ...params }, "reviews.csv", fileName);

/**
 * A file name the user typed, made safe to save: no path or reserved characters, at most 120 characters, and the
 * extension added when missing. Empty → null (the server's name is used).
 */
export function safeFileName(typed: string, extension: string): string | null {
  const base = typed
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  if (!base) return null;
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

/**
 * Fetches a file from an export route and saves it; API errors are thrown as ApiClientError for the UI to show. `fileName`
 * (already made safe) replaces the server's name.
 */
export async function downloadFile(path: string, params: Record<string, string | number | undefined>, fallbackName: string, fileName?: string | null): Promise<void> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    if (res.status === 401) window.location.assign("/login");
    throw new ApiClientError(res.status, payload?.error?.code ?? "UNKNOWN", payload?.error?.message ?? "Export failed");
  }
  const blob = await res.blob();
  const name = fileName || (/filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName);
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
