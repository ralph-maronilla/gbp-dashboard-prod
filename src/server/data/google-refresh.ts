import "server-only";
import { getPrisma } from "@/server/db/prisma";
import { env } from "@/server/env";
import { detectRegion, typeFromGoogle } from "@/lib/ph-regions";
import { lookupPlace, type PlaceDetails } from "@/server/serper/client";
import { MIN_REQUEST_MS, SerperError } from "@/server/serper/errors";
import { limitMessage, placeKeyFromLocationId, reserveCredits, settleCredits } from "@/server/sync/engine";
import { CREDITS_PER_LOOKUP, type GoogleRefreshResult, type GoogleRefreshSummary } from "@/lib/schemas/google-refresh";

const BUDGET_MS = 45_000;

/**
 * Looks up Google's public rating and review count for the given locations (admin action, ~3 credits each) and saves
 * them; fills address, region and type only where they are empty. Each lookup's credits are reserved first, within the
 * shared daily limit and the admin's own daily limit; at most SERPER_CONCURRENCY at a time, within a 45 s budget.
 * Credits are recorded in a `google_refresh` sync_runs row so both budgets count them.
 */
export async function refreshGoogleTotals(locationIds: string[] | null, startedBy: string): Promise<GoogleRefreshSummary> {
  const db = getPrisma();
  const locations = await db.locations.findMany({
    where: { removed_at: null, ...(locationIds ? { id: { in: locationIds } } : {}) },
    select: { id: true, name: true, gbp_location_id: true, address: true, region: true, location_type: true },
    orderBy: { name: "asc" },
  });
  const todo = locations;
  const deadline = Date.now() + BUDGET_MS;

  const run = await db.sync_runs.create({ data: { status: "running", kind: "google_refresh", started_by: startedBy }, select: { id: true } });
  let credits = 0;
  const results: GoogleRefreshResult[] = [];
  let next = 0;
  let fatal: string | null = null;
  let limited: string | null = null;

  const worker = async () => {
    while (next < todo.length && !fatal && !limited && deadline - Date.now() > MIN_REQUEST_MS) {
      const { granted, limitedBy } = await reserveCredits(run.id, CREDITS_PER_LOOKUP, env.serperUserDailyCreditLimit);
      if (granted < CREDITS_PER_LOOKUP) {
        limited = limitMessage(limitedBy ?? "daily");
        break;
      }
      if (next >= todo.length) break; // another worker took the last one; the reservation is returned when settling
      const loc = todo[next++]!;
      const key = placeKeyFromLocationId(loc.gbp_location_id);
      if (!key || !("cid" in key)) {
        results.push({ id: loc.id, name: loc.name, status: "skipped", rating: null, review_count: null, filled: [], error: "No Maps CID" });
        continue;
      }
      let place: PlaceDetails;
      try {
        place = await lookupPlace(key.cid, deadline);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Lookup failed";
        if (err instanceof SerperError && err.isFatal) fatal = message;
        results.push({ id: loc.id, name: loc.name, status: "failed", rating: null, review_count: null, filled: [], error: message });
        continue;
      }
      credits += place.credits;
      await db.sync_runs.update({ where: { id: run.id }, data: { credits_used: credits } });
      if (place.rating === null && place.ratingCount === null) {
        results.push({ id: loc.id, name: loc.name, status: "not_found", rating: null, review_count: null, filled: [] });
        continue;
      }
      const filled: string[] = [];
      const data: Record<string, unknown> = { google_rating: place.rating, source_review_count: place.ratingCount ?? 0, google_checked_at: new Date() };
      if (!loc.address && place.address) {
        data.address = place.address;
        filled.push("address");
      }
      const region = loc.region ? null : detectRegion(place.address) ?? detectRegion(loc.name);
      if (region) {
        data.region = region;
        filled.push("region");
      }
      const type = loc.location_type ? null : typeFromGoogle(place.type);
      if (type) {
        data.location_type = type;
        filled.push("type");
      }
      await db.locations.update({ where: { id: loc.id }, data });
      results.push({ id: loc.id, name: loc.name, status: "updated", rating: place.rating, review_count: place.ratingCount, filled });
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(env.serperConcurrency, todo.length) }, worker));
  } finally {
    const failed = results.filter((r) => r.status === "failed").length;
    await db.sync_runs.update({
      where: { id: run.id },
      data: {
        status: fatal || (failed > 0 && failed === results.length) ? "failed" : failed > 0 || results.length < locations.length ? "partial" : "success",
        finished_at: new Date(),
        error: fatal ?? limited,
      },
    });
    await settleCredits(run.id, credits);
  }
  return { results, credits_used: credits, not_done: locations.length - results.length, limit: limited };
}

/**
 * Fills empty regions from each location's address or name. Free (no Serper calls). The updates and their audit entry
 * commit together. Returns what was set.
 */
export async function autofillRegions(actorId: string): Promise<{ id: string; name: string; region: string }[]> {
  return getPrisma().$transaction(async (tx) => {
    const empty = await tx.locations.findMany({ where: { removed_at: null, region: null }, select: { id: true, name: true, address: true } });
    const set: { id: string; name: string; region: string }[] = [];
    for (const l of empty) {
      const region = detectRegion(l.address) ?? detectRegion(l.name);
      if (!region) continue;
      await tx.locations.update({ where: { id: l.id }, data: { region } });
      set.push({ id: l.id, name: l.name, region });
    }
    if (set.length > 0) await tx.audit_log.create({ data: { actor_id: actorId, action: "location.regions_autofilled", target: null, details: { set } } });
    return set;
  }, { timeout: 30_000, maxWait: 5_000 });
}
