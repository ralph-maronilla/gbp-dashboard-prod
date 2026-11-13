import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { env } from "@/server/env";
import { markSheetDirty } from "@/server/sheets/dirty";
import { fetchReviewPage, type ReviewPage } from "@/server/serper/client";
import { MIN_REQUEST_MS, SerperError, SerperTimeBudgetError } from "@/server/serper/errors";
import type { PlaceKey } from "@/server/serper/maps-input";
import type { ProviderReview } from "./types";

/**
 * Serper → database extraction. Uses the privileged Prisma client (bypasses RLS): reviews and sync_runs have no write
 * policies by design. Only call from routes that already checked the caller (extract route, cron route).
 *
 * Locations are registered by admins (gbp_location_id "serper:<cid>" or "serper:pid:<placeId>"). Credits are spent per
 * page of 20 reviews, newest first, so each location is in one of three states:
 *  - backfill    (backfill_completed_at null): read every page to the end, resuming from sync_cursor across runs;
 *  - catch-up    (completed, sync_cursor set): an incremental read was cut short; resume, stop at the first saved review;
 *  - incremental (completed, no cursor): read from the newest page, stop at the first saved review (usually 1 credit;
 *                that page is always re-saved, so recent edits and owner replies are picked up).
 * Every page is saved together with the next cursor, so a timeout loses at most the page in flight.
 *
 * Concurrency: each location is claimed (`sync_locked_until`) before it is read, so many runs (cron, several users)
 * can work at once on different locations and a location is never read twice at the same time. Claims expire on
 * their own if an invocation dies.
 */

export const SERPER_PREFIX = "serper:";
const CLAIM_MS = 2 * 60_000;
/**
 * Catching up on new reviews never needs more than this many pages in one run (20 reviews each). If no already-saved
 * review shows up by then, the ids are not behaving as expected: stop instead of re-reading a whole history every run.
 */
const MAX_INCREMENTAL_PAGES = 50;
/** Credits reserved at a time (see reserveCredits): small, so an idle worker never holds much of the budget. */
const RESERVE_CHUNK = 20;
const UPSERT_CHUNK = 500;
const MAX_ERROR_LENGTH = 500;

export class NotConfiguredError extends Error {
  constructor(message = "SERPER_API_KEY is not set on the server") {
    super(message);
    this.name = "NotConfiguredError";
  }
}

export type SyncStatus = "success" | "partial" | "failed";

export interface SyncSummary {
  run_id: string;
  status: SyncStatus;
  /** Locations this run was asked to cover (active, accessible). */
  locations_found: number;
  /** Fully up to date after this run. */
  processed: number;
  /** Still have work left (or were being extracted by another run). */
  remaining: number;
  failed: number;
  reviews_upserted: number;
  credits_used: number;
  error: string | null;
  /** Which limit stopped the run, if one did. */
  limited_by: CreditLimit | null;
}

export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : "unknown error";
  return msg.length > MAX_ERROR_LENGTH ? `${msg.slice(0, MAX_ERROR_LENGTH)}…` : msg;
}

export function placeKeyFromLocationId(gbpLocationId: string): PlaceKey | null {
  if (!gbpLocationId.startsWith(SERPER_PREFIX)) return null;
  const rest = gbpLocationId.slice(SERPER_PREFIX.length);
  if (rest.startsWith("pid:")) return { placeId: rest.slice(4) };
  return /^\d+$/.test(rest) ? { cid: rest } : null;
}

/**
 * A reply counts as measured ('observed') when Serper dates it within the last 3 days the first time we read it:
 * recent replies come as "5 hours ago" / "2 days ago", so the time is right to about a day. Older ones ("3 weeks ago")
 * stay 'relative'. This also keeps a reply we only noticed late from looking fast.
 */
const MEASURED_REPLY = Prisma.sql`src.rt is not null and src.rt >= now() - interval '3 days'`;

/** Inserts or updates reviews; returns how many rows actually changed (unchanged rows are skipped). */
export async function upsertReviews(locationId: string, reviews: ProviderReview[]): Promise<number> {
  const unique = [...new Map(reviews.map((r) => [r.reviewId, r])).values()];
  let changed = 0;
  for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
    const chunk = unique.slice(i, i + UPSERT_CHUNK);
    const iso = (d: Date | null) => d?.toISOString() ?? null;
    // One statement: update the saved reviews that changed, insert only the ones not saved yet. New rows get their
    // reference_no from the sequence by default; inserting only new rows keeps it from advancing on every re-read.
    const [row] = await getPrisma().$queryRaw<{ changed: bigint }[]>`
      with src as (
        select r.id, r.reviewer, r.url, r.rating::smallint as rating, r.comment, r.ct, r.ut, r.rc, r.rt
        from unnest(
          ${chunk.map((r) => r.reviewId)}::text[],
          ${chunk.map((r) => r.reviewerName)}::text[],
          ${chunk.map((r) => r.reviewerUrl)}::text[],
          ${chunk.map((r) => r.rating)}::int[],
          ${chunk.map((r) => r.comment)}::text[],
          ${chunk.map((r) => iso(r.createTime))}::timestamptz[],
          ${chunk.map((r) => iso(r.updateTime))}::timestamptz[],
          ${chunk.map((r) => r.replyComment)}::text[],
          ${chunk.map((r) => iso(r.replyTime))}::timestamptz[]
        ) as r(id, reviewer, url, rating, comment, ct, ut, rc, rt)
      ),
      upd as (
        update public.reviews as v set
          location_id = ${locationId}::uuid,
          reviewer_name = src.reviewer,
          reviewer_url = src.url,
          rating = src.rating,
          comment = src.comment,
          create_time = src.ct,
          update_time = src.ut,
          reply_comment = src.rc,
          -- Serper only gives the reply date as "3 weeks ago", so the computed time shifts on every read. Keep the stored
          -- one while the reply text is the same (otherwise unchanged reviews would look edited on every sync), and keep a
          -- measured time even when the owner later edits the reply.
          reply_time = case
            when src.rc is null then null
            when v.reply_comment is not null and (v.reply_comment = src.rc or v.reply_time_source = 'observed') then v.reply_time
            else src.rt end,
          reply_time_source = case
            when src.rc is null then null
            when v.reply_comment is not null and (v.reply_comment = src.rc or v.reply_time_source = 'observed') then v.reply_time_source
            when ${MEASURED_REPLY} then 'observed'
            else 'relative' end,
          reply_seen_at = case when src.rc is null then null else coalesce(v.reply_seen_at, now()) end
        from src
        where v.gbp_review_id = src.id
          and (v.location_id, v.reviewer_name, v.reviewer_url, v.rating, v.comment, v.create_time, v.update_time, v.reply_comment)
            is distinct from
              (${locationId}::uuid, src.reviewer, src.url, src.rating, src.comment, src.ct, src.ut, src.rc)
        returning 1
      ),
      ins as (
        insert into public.reviews
          (location_id, gbp_review_id, reviewer_name, reviewer_url, rating, comment, create_time, update_time, reply_comment, reply_time,
           reply_seen_at, reply_time_source)
        select ${locationId}::uuid, src.id, src.reviewer, src.url, src.rating, src.comment, src.ct, src.ut, src.rc, src.rt,
          case when src.rc is null then null else now() end,
          case when src.rc is null then null when ${MEASURED_REPLY} then 'observed' else 'relative' end
        from src
        where not exists (select 1 from public.reviews x where x.gbp_review_id = src.id)
        on conflict (gbp_review_id) do nothing
        returning 1
      )
      select ((select count(*) from upd) + (select count(*) from ins)) as changed`;
    changed += Number(row?.changed ?? 0);
  }
  return changed;
}

/** `deadline` is the end of the run's time budget; implementations must not retry or wait past it. */
export type PageFetcher = (key: PlaceKey, locationKey: string, cursor: string | null, deadline: number) => Promise<ReviewPage>;

export type CreditLimit = "daily" | "user" | "run";

/** Spend so far today (00:00 UTC) for everyone, or for one person. A reservation counts until its run settles it. */
export async function creditsUsedToday(userId?: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await getPrisma().$queryRaw<{ used: number }[]>`
    select coalesce(sum(greatest(credits_used, credits_reserved)), 0)::int as used
    from public.sync_runs
    where location_id is null and started_at >= ${start} ${userId ? Prisma.sql`and started_by = ${userId}::uuid` : Prisma.empty}`;
  return row?.used ?? 0;
}

/**
 * Reserves up to `want` credits for a run before they are spent (migration 0017): one reservation at a time across all
 * servers, so concurrent runs never overshoot the shared daily limit or the starter's own limit (`userLimit`).
 */
export async function reserveCredits(runId: string, want: number, userLimit: number | null): Promise<{ granted: number; limitedBy: CreditLimit | null }> {
  const [row] = await getPrisma().$queryRaw<{ granted: number; limited_by: CreditLimit | null }[]>`
    select granted, limited_by from public.reserve_credits(${runId}::uuid, ${want}::int, ${env.serperDailyCreditLimit}::int, ${userLimit}::int)`;
  return { granted: row?.granted ?? 0, limitedBy: row?.limited_by ?? null };
}

/** Closes a run's reservation: what it did not spend goes back to the budget. */
export async function settleCredits(runId: string, creditsUsed: number): Promise<void> {
  await getPrisma().sync_runs.update({ where: { id: runId }, data: { credits_used: creditsUsed, credits_reserved: creditsUsed } });
}

export function limitMessage(limit: CreditLimit, runCap = env.serperMaxCreditsPerRun): string {
  if (limit === "user") return `You have used your ${env.serperUserDailyCreditLimit.toLocaleString("en-US")} credits for today; your limit resets at 00:00 UTC`;
  if (limit === "daily") return `Daily credit limit (${env.serperDailyCreditLimit.toLocaleString("en-US")}) reached; extraction resumes tomorrow`;
  return `Credit limit for one run reached (${runCap}); continues on the next run`;
}

interface ClaimedLocation {
  id: string;
  gbp_location_id: string;
  sync_cursor: string | null;
  backfill_completed_at: Date | null;
}

/** Atomically claims one location for this run; null when another run holds it. */
async function claimLocation(id: string): Promise<ClaimedLocation | null> {
  const rows = await getPrisma().$queryRaw<ClaimedLocation[]>`
    update public.locations
    set sync_locked_until = now() + ${`${CLAIM_MS} milliseconds`}::interval
    where id = ${id}::uuid and is_active and removed_at is null
      and (sync_locked_until is null or sync_locked_until < now())
    returning id, gbp_location_id, sync_cursor, backfill_completed_at`;
  return rows[0] ?? null;
}

async function releaseLocation(id: string): Promise<void> {
  await getPrisma().locations.update({ where: { id }, data: { sync_locked_until: null } }).catch(() => undefined);
}

/** Shared by the parallel workers of one run. */
interface RunState {
  runId: string;
  deadline: number;
  /** Credits reserved but not yet spent by this run's workers. */
  creditsLeft: number;
  /** Credits reserved so far by this run (bounded by the per-run cap). */
  creditsReserved: number;
  runCap: number;
  userLimit: number | null;
  limitedBy: CreditLimit | null;
  creditsUsed: number;
  /** Set when every further request would fail (bad key, no credits): workers stop taking work. */
  fatal: string | null;
}

/** Reserves the next chunk when this run's allowance is used up; false when a limit leaves nothing more to spend. */
async function topUp(state: RunState): Promise<boolean> {
  if (state.creditsLeft > 0) return true;
  if (state.limitedBy) return false;
  const want = Math.min(RESERVE_CHUNK, state.runCap - state.creditsReserved);
  if (want <= 0) {
    state.limitedBy = "run";
    return false;
  }
  state.creditsReserved += want; // claimed before the await so parallel workers don't over-ask
  const { granted, limitedBy } = await reserveCredits(state.runId, want, state.userLimit);
  state.creditsReserved += granted - want;
  state.creditsLeft += granted;
  if (granted < want && limitedBy) state.limitedBy = limitedBy;
  return state.creditsLeft > 0;
}

async function syncLocation(
  loc: ClaimedLocation,
  state: RunState,
  fetchPage: PageFetcher,
): Promise<{ complete: boolean; upserted: number; credits: number }> {
  const prisma = getPrisma();
  const key = placeKeyFromLocationId(loc.gbp_location_id);
  if (!key) throw new Error(`Unrecognised location id: ${loc.gbp_location_id}`);

  const backfill = loc.backfill_completed_at === null;
  let cursor = loc.sync_cursor;
  let upserted = 0;
  let credits = 0;
  const startedAt = new Date();
  let pages = 0;
  /** Review ids already read in this run: a page with nothing new means the pages are repeating (a cycle). */
  const seenThisRun = new Set<string>();

  for (;;) {
    // Don't start a page that could not finish inside the time budget (it would be refused anyway).
    if (state.fatal || Date.now() > state.deadline - MIN_REQUEST_MS || !(await topUp(state))) return { complete: false, upserted, credits };
    state.creditsLeft--; // reserve before the call so parallel workers never overshoot the cap
    let page: ReviewPage;
    try {
      page = await fetchPage(key, loc.gbp_location_id, cursor, state.deadline);
    } catch (err) {
      state.creditsLeft++;
      // Out of time is the normal end of a long read, not a failure: what was saved (and its cursor) is kept.
      if (err instanceof SerperTimeBudgetError) return { complete: false, upserted, credits };
      // An expired resume token: start the read over from the newest page (saved reviews are deduplicated).
      if (cursor && err instanceof SerperError && err.status === 400) {
        await prisma.locations.update({ where: { id: loc.id }, data: { sync_cursor: null } });
      }
      throw err;
    }
    state.creditsLeft += 1 - page.credits; // settle the reservation against the real cost
    state.creditsUsed += page.credits;
    credits += page.credits;
    pages++;
    // Keep the run's credit total current (a page can cost more than its reservation; today's spend counts the larger).
    await prisma.sync_runs.update({ where: { id: state.runId }, data: { credits_used: state.creditsUsed } });

    // Incremental / catch-up stop condition: a review on this page is already saved.
    let reachedKnown = false;
    if (!backfill && page.reviews.length > 0) {
      reachedKnown = (await prisma.reviews.count({ where: { gbp_review_id: { in: page.reviews.map((r) => r.reviewId) } } })) > 0;
    }
    upserted += await upsertReviews(loc.id, page.reviews);

    // Safety net: never page forever. A page with no review we haven't already read in this run, or a cursor that did
    // not move, ends the read (it can only be a repeating sequence). Costs at most one extra credit.
    const repeating =
      (page.reviews.length > 0 && page.reviews.every((r) => seenThisRun.has(r.reviewId))) ||
      (page.nextCursor !== null && page.nextCursor === cursor);
    page.reviews.forEach((r) => seenThisRun.add(r.reviewId));

    // Incremental/catch-up reads are short by nature; hitting the cap means the ids are unstable, so end the read.
    const tooLong = !backfill && pages >= MAX_INCREMENTAL_PAGES;
    const done = page.nextCursor === null || reachedKnown || repeating || tooLong;
    cursor = done ? null : page.nextCursor;
    await prisma.locations.update({
      where: { id: loc.id },
      data: {
        sync_cursor: cursor,
        // Extend the claim while working, so a long backfill keeps its lock.
        sync_locked_until: new Date(Date.now() + CLAIM_MS),
        ...(done ? { last_synced_at: startedAt, ...(backfill ? { backfill_completed_at: new Date() } : {}) } : {}),
      },
    });
    if (done) return { complete: true, upserted, credits };
  }
}

export interface RunSyncOptions {
  /** Stop starting new pages after this many ms (keep well under the function's maxDuration). */
  budgetMs: number;
  /** Restrict to these locations (already access-checked by the caller). Omit for every active location. */
  locationIds?: string[];
  /** Injected in tests; defaults to the live Serper client. */
  fetchPage?: PageFetcher;
  maxCredits?: number;
  concurrency?: number;
  /** Who pressed Extract: their own daily credit limit applies. Omit for machine runs (cron). */
  startedBy?: string;
}

export async function runSync(opts: RunSyncOptions): Promise<SyncSummary> {
  if (!opts.fetchPage && !env.serperApiKey) throw new NotConfiguredError();
  const fetchPage = opts.fetchPage ?? fetchReviewPage;
  const prisma = getPrisma();
  await closeStaleRuns();

  const candidates = await prisma.locations.findMany({
    where: {
      is_active: true,
      removed_at: null,
      gbp_location_id: { startsWith: SERPER_PREFIX },
      ...(opts.locationIds ? { id: { in: opts.locationIds } } : {}),
    },
    select: { id: true, sync_cursor: true, backfill_completed_at: true, last_synced_at: true },
  });
  // Unfinished work first (backfills, interrupted catch-ups), then the least recently extracted.
  const queue = candidates.sort((a, b) => {
    const pa = a.backfill_completed_at === null || a.sync_cursor !== null ? 0 : 1;
    const pb = b.backfill_completed_at === null || b.sync_cursor !== null ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a.last_synced_at?.getTime() ?? 0) - (b.last_synced_at?.getTime() ?? 0);
  });

  // Credits are reserved in small chunks as pages are read (topUp), within the shared daily limit, the starter's own
  // daily limit and the per-run cap.
  const runCap = opts.maxCredits ?? env.serperMaxCreditsPerRun;
  const run = await prisma.sync_runs.create({ data: { status: "running", started_by: opts.startedBy ?? null }, select: { id: true } });
  const summary: SyncSummary = {
    run_id: run.id, status: "success", locations_found: queue.length, processed: 0, remaining: 0, failed: 0,
    reviews_upserted: 0, credits_used: 0, error: null, limited_by: null,
  };
  const state: RunState = {
    runId: run.id,
    deadline: Date.now() + opts.budgetMs,
    creditsLeft: 0,
    creditsReserved: 0,
    runCap,
    userLimit: opts.startedBy ? env.serperUserDailyCreditLimit : null,
    limitedBy: null,
    creditsUsed: 0,
    fatal: null,
  };

  try {
    let next = 0;
    const worker = async () => {
      while (!state.fatal && Date.now() <= state.deadline - MIN_REQUEST_MS && (state.creditsLeft > 0 || !state.limitedBy)) {
        const item = queue[next++];
        if (!item) return;
        const loc = await claimLocation(item.id);
        if (!loc) continue; // another run is extracting it right now; counted as remaining
        const locRun = await prisma.sync_runs.create({ data: { status: "running", location_id: loc.id }, select: { id: true } });
        try {
          const r = await syncLocation(loc, state, fetchPage);
          summary.reviews_upserted += r.upserted;
          if (r.complete) summary.processed++;
          await prisma.sync_runs.update({
            where: { id: locRun.id },
            data: {
              status: r.complete ? "success" : "partial",
              error: r.complete ? null : "Stopped at the time or credit limit; continues on the next run",
              finished_at: new Date(),
              reviews_upserted: r.upserted,
              credits_used: r.credits,
            },
          });
        } catch (err) {
          summary.failed++;
          if (err instanceof SerperError && err.isFatal) {
            state.fatal = err.status === 401 ? "Serper rejected the API key (check SERPER_API_KEY)" : "Serper credits are used up";
          }
          await prisma.sync_runs.update({ where: { id: locRun.id }, data: { status: "failed", error: errorText(err), finished_at: new Date() } });
        } finally {
          await releaseLocation(loc.id);
        }
      }
    };
    const workers = Math.min(opts.concurrency ?? env.serperConcurrency, Math.max(queue.length, 1));
    await Promise.all(Array.from({ length: workers }, worker));

    summary.credits_used = state.creditsUsed;
    summary.remaining = queue.length - summary.processed - summary.failed;
    summary.limited_by = state.limitedBy && summary.remaining > 0 ? state.limitedBy : null;
    summary.status = summary.failed > 0 || summary.remaining > 0 ? "partial" : "success";
    // Nothing done because a daily limit left no credits: that is a failure to report, not a partial run.
    if (summary.processed === 0 && (summary.failed > 0 || state.fatal || (summary.limited_by && summary.limited_by !== "run" && state.creditsUsed === 0))) summary.status = "failed";
    summary.error =
      state.fatal ??
      (summary.limited_by ? limitMessage(summary.limited_by, runCap) : null) ??
      (summary.failed > 0 ? `${summary.failed} location(s) failed` : null);

    await prisma.sync_runs.update({
      where: { id: run.id },
      data: { status: summary.status, error: summary.error, finished_at: new Date(), reviews_upserted: summary.reviews_upserted, credits_used: state.creditsUsed, credits_reserved: state.creditsUsed },
    });
    // New or changed reviews: the Google Sheet mirror (if set up) is written at the next scheduler tick.
    if (summary.reviews_upserted > 0) await markSheetDirty();
    return summary;
  } catch (err) {
    await prisma.sync_runs
      .update({ where: { id: run.id }, data: { status: "failed", error: errorText(err), finished_at: new Date(), credits_used: state.creditsUsed, credits_reserved: state.creditsUsed } })
      .catch(() => undefined);
    throw err;
  }
}

/** Whole-run rows still "running" long after any function could have lasted belong to crashed invocations. */
export async function closeStaleRuns(): Promise<void> {
  // Their unspent reservation goes back to the budget too.
  await getPrisma().$executeRaw`
    update public.sync_runs
    set status = 'failed', finished_at = now(), error = 'Run did not finish (timed out or crashed)', credits_reserved = credits_used
    where status = 'running' and started_at < now() - interval '10 minutes'`;
}

/** Latest whole-run row, for the status header. */
export async function latestRun() {
  return getPrisma().sync_runs.findFirst({
    where: { location_id: null, kind: "extract" },
    orderBy: { started_at: "desc" },
    select: { id: true, status: true, started_at: true, finished_at: true, error: true, reviews_upserted: true, credits_used: true },
  });
}

