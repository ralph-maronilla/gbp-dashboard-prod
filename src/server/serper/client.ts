import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import type { ProviderReview } from "@/server/sync/types";
import { MIN_REQUEST_MS, SerperError, SerperTimeBudgetError } from "./errors";
import type { PlaceKey } from "./maps-input";

const BASE = "https://google.serper.dev";
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shapes verified against live responses (2026-10). Unknown fields are ignored; optional ones stay optional. */
const reviewsSchema = z.object({
  reviews: z
    .array(
      z.object({
        id: z.string().optional(),
        rating: z.number(),
        isoDate: z.string().optional(),
        date: z.string().optional(),
        snippet: z.string().optional(), // missing on rating-only reviews
        user: z.object({ name: z.string().optional(), link: z.string().optional() }).optional(),
        response: z.object({ snippet: z.string().optional(), date: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
  credits: z.number().optional(),
});

/**
 * One Serper call. At most MAX_ATTEMPTS tries, and never past `deadline` (the caller's time budget): a retry that
 * could not finish in time is not started, so a run can never outlive its function limit or keep spending credits.
 */
async function post<S extends z.ZodType>(path: string, body: Record<string, unknown>, schema: S, deadline?: number): Promise<z.output<S>> {
  const key = env.serperApiKey;
  if (!key) throw new SerperError(401, "SERPER_API_KEY is not set");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const left = deadline === undefined ? TIMEOUT_MS : deadline - Date.now();
    if (left < MIN_REQUEST_MS) throw new SerperTimeBudgetError();
    let res: Response;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ gl: env.serperGl, hl: env.serperHl, ...body }),
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, left)),
      });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new SerperError(503, `Serper request failed: ${err instanceof Error ? err.message : "network error"}`);
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (res.ok) return schema.parse(await res.json());
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const payload = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new SerperError(res.status, `Serper ${res.status}: ${payload?.message ?? res.statusText}`);
  }
  throw new SerperError(503, "Serper request failed"); // unreachable: every attempt returns or throws
}

const RELATIVE = /^(a|an|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i;
const UNIT_MS: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };

/** "3 weeks ago" → approximate date. Serper gives owner replies only as relative text. */
export function parseRelativeDate(text: string | undefined, now = Date.now()): Date | null {
  const m = RELATIVE.exec((text ?? "").trim().replace(/^edited\s+/i, ""));
  if (!m) return null;
  const n = /^an?$/i.test(m[1] as string) ? 1 : Number(m[1]);
  return new Date(now - n * (UNIT_MS[(m[2] as string).toLowerCase()] as number));
}

type RawReview = NonNullable<z.output<typeof reviewsSchema>["reviews"]>[number];

/** The reviewer's profile link, only if it is a plain http(s) URL (it is rendered as a link and written to the CSV). */
function profileUrl(link: string | undefined): string | null {
  const v = link?.trim();
  return v && /^https?:\/\/\S+$/i.test(v) ? v : null;
}

/** Maps a Serper review to the reviews table. Exact `isoDate` for the review; reply date is approximate. */
export function toProviderReview(r: RawReview, locationKey: string, now = Date.now()): ProviderReview | null {
  const rating = Math.round(r.rating);
  if (rating < 1 || rating > 5) return null;
  const created = r.isoDate ? new Date(r.isoDate) : parseRelativeDate(r.date, now);
  if (!created || Number.isNaN(created.getTime())) return null;
  const name = r.user?.name?.trim() || null;
  // Serper's id is Google's review id (stable). Fallback hash only if it is ever missing.
  const id =
    r.id ??
    createHash("sha256").update([locationKey, r.user?.link ?? name ?? "", created.toISOString(), r.snippet ?? ""].join("\u0000")).digest("hex").slice(0, 40);
  const reply = r.response?.snippet?.trim() || null;
  return {
    reviewId: `serper:${id}`,
    reviewerName: name,
    reviewerUrl: profileUrl(r.user?.link),
    rating,
    comment: r.snippet?.trim() || null,
    createTime: created,
    updateTime: null,
    replyComment: reply,
    replyTime: reply ? (parseRelativeDate(r.response?.date, now) ?? created) : null,
  };
}

export interface ReviewPage {
  reviews: ProviderReview[];
  nextCursor: string | null;
  credits: number;
}

/** One page (20 reviews, newest first, 1 credit). `cursor` null = first page. `deadline` = end of the run's time budget. */
export async function fetchReviewPage(key: PlaceKey, locationKey: string, cursor: string | null, deadline?: number): Promise<ReviewPage> {
  const res = await post(
    "reviews",
    { ...("cid" in key ? { cid: key.cid } : { placeId: key.placeId }), sortBy: "newest", ...(cursor ? { nextPageToken: cursor } : {}) },
    reviewsSchema,
    deadline,
  );
  const now = Date.now();
  return {
    reviews: (res.reviews ?? []).flatMap((r) => toProviderReview(r, locationKey, now) ?? []),
    // The last page carries `"nextPageToken": ""`, not a missing field. An empty token must mean "no more pages":
    // passing it on would restart the read from page 1 and loop forever.
    nextCursor: res.nextPageToken?.trim() || null,
    credits: res.credits ?? 1,
  };
}

const placeSchema = z.object({
  places: z
    .array(
      z.object({
        title: z.string().optional(),
        address: z.string().optional(),
        rating: z.number().optional(),
        ratingCount: z.number().optional(),
        type: z.string().optional(),
        cid: z.string().optional(),
      }),
    )
    .optional(),
  credits: z.number().optional(),
});

export interface PlaceDetails {
  title: string | null;
  address: string | null;
  /** Google's public star rating (one decimal). */
  rating: number | null;
  /** Google's public review count (includes rating-only reviews). */
  ratingCount: number | null;
  type: string | null;
  credits: number;
}

/**
 * Google's public profile summary for one place, looked up by CID (Serper Maps, about 3 credits). Verified live
 * 2026-10: returns one place with title, address, rating, ratingCount and type. Returns nulls when Google has no match.
 */
export async function lookupPlace(cid: string, deadline?: number): Promise<PlaceDetails> {
  const res = await post("maps", { cid }, placeSchema, deadline);
  const p = (res.places ?? []).find((x) => x.cid === cid) ?? res.places?.[0];
  return {
    title: p?.title?.trim() || null,
    address: p?.address?.trim() || null,
    rating: typeof p?.rating === "number" ? Math.round(p.rating * 10) / 10 : null,
    ratingCount: typeof p?.ratingCount === "number" ? Math.round(p.ratingCount) : null,
    type: p?.type?.trim() || null,
    credits: res.credits ?? 3,
  };
}
