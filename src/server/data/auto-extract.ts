import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { Errors } from "@/lib/api/errors";
import { getPrisma } from "@/lib/db/prisma";
import type { Tx } from "@/lib/db/with-rls";
import { env } from "@/lib/env";
import type { AutoExtractInput, AutoExtractStatus } from "@/lib/schemas/auto-extract";
import { lastRunOnAfterSave, nextRunAt, zonedClock } from "@/lib/sync/schedule";

/** The scheduler calls every 15 minutes; two missed calls in a row means it is not set up (or not working). */
const CONNECTED_WINDOW_MS = 30 * 60_000;

/** Automatic runs are the top-level extraction runs nobody started (the cron route's), since the day was claimed. */
const AUTO_RUNS = Prisma.sql`from public.sync_runs where location_id is null and kind = 'extract' and started_by is null`;

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Scheduler call: records it, then claims today's automatic run if it is due (switched on, the time has come, today
 * not claimed yet). The claim is one conditional update, so two calls at once cannot both start a run.
 * SECURITY: privileged client; only for the cron route (CRON_SECRET checked).
 */
export async function tickAndClaim(now = new Date()): Promise<"claimed" | "disabled" | "not_due"> {
  const prisma = getPrisma();
  const c = zonedClock(now, env.exportTimeZone);
  const claimed = await prisma.$queryRaw<{ id: number }[]>`
    update public.app_settings
       set auto_last_run_on = ${c.date}::date, auto_last_run_at = now(), scheduler_last_tick_at = now()
     where id = 1 and auto_extract_enabled and auto_extract_time <= ${c.time}
       and (auto_last_run_on is null or auto_last_run_on < ${c.date}::date)
    returning id`;
  if (claimed.length > 0) return "claimed";
  const rows = await prisma.$queryRaw<{ enabled: boolean }[]>`
    update public.app_settings set scheduler_last_tick_at = now() where id = 1 returning auto_extract_enabled as enabled`;
  return rows[0]?.enabled ? "not_due" : "disabled";
}

/**
 * Credits today's automatic run may still spend (its limit minus what its runs have used or reserved), or null when
 * automatic extraction is off or no run was claimed. Checked before every run of the chain.
 */
export async function autoCreditsLeft(): Promise<number | null> {
  const rows = await getPrisma().$queryRaw<{ enabled: boolean; limit: number; since: Date | null; spent: number }[]>`
    select s.auto_extract_enabled as enabled, s.auto_extract_credit_limit as "limit", s.auto_last_run_at as since,
      coalesce((select sum(greatest(credits_used, credits_reserved)) ${AUTO_RUNS} and started_at >= s.auto_last_run_at), 0)::int as spent
    from public.app_settings s where s.id = 1`;
  const s = rows[0];
  if (!s?.enabled || !s.since) return null;
  return Math.max(0, s.limit - s.spent);
}

export async function getAutoExtract(tx: Tx, now = new Date()): Promise<AutoExtractStatus> {
  const s = await tx.app_settings.findUnique({ where: { id: 1 } });
  if (!s) throw Errors.conflict("Automatic extraction settings are missing: apply migration 0018");
  const runs = s.auto_last_run_at
    ? await tx.$queryRaw<{ started_at: Date; finished_at: Date | null; status: string; error: string | null; credits_used: number; reviews_upserted: number }[]>`
        select started_at, finished_at, status, error, credits_used, reviews_upserted ${AUTO_RUNS} and started_at >= ${s.auto_last_run_at}
        order by started_at`
    : [];
  const last = runs.at(-1);
  const next = nextRunAt({ enabled: s.auto_extract_enabled, time: s.auto_extract_time, lastRunOn: dateOnly(s.auto_last_run_on) }, now, env.exportTimeZone);
  const tick = s.scheduler_last_tick_at;
  return {
    enabled: s.auto_extract_enabled,
    time: s.auto_extract_time,
    credit_limit: s.auto_extract_credit_limit,
    time_zone: env.exportTimeZone,
    next_run_at: next?.toISOString() ?? null,
    due: next !== null && next.getTime() <= now.getTime(),
    scheduler_last_tick_at: tick?.toISOString() ?? null,
    scheduler_connected: !!tick && now.getTime() - tick.getTime() < CONNECTED_WINDOW_MS,
    last_run:
      runs.length > 0 && last
        ? {
            started_at: runs[0]!.started_at.toISOString(),
            finished_at: last.finished_at?.toISOString() ?? null,
            runs: runs.length,
            credits_used: runs.reduce((a, r) => a + r.credits_used, 0),
            reviews_upserted: runs.reduce((a, r) => a + r.reviews_upserted, 0),
            status: last.status,
            error: last.error,
          }
        : null,
  };
}

/** Saves the schedule with its audit entry (same transaction, RLS: admins only). */
export async function saveAutoExtract(tx: Tx, actorId: string, input: AutoExtractInput, now = new Date()): Promise<void> {
  const before = await tx.app_settings.findUnique({ where: { id: 1 } });
  if (!before) throw Errors.conflict("Automatic extraction settings are missing: apply migration 0018");
  const lastRunOn = lastRunOnAfterSave(input.time, before.auto_last_run_at, now, env.exportTimeZone);
  await tx.app_settings.update({
    where: { id: 1 },
    data: {
      auto_extract_enabled: input.enabled,
      auto_extract_time: input.time,
      auto_extract_credit_limit: input.credit_limit,
      auto_last_run_on: lastRunOn ? new Date(`${lastRunOn}T00:00:00Z`) : null,
      updated_by: actorId,
      updated_at: now,
    },
  });
  await tx.audit_log.create({
    data: {
      actor_id: actorId,
      action: "auto_extract.updated",
      details: {
        before: { enabled: before.auto_extract_enabled, time: before.auto_extract_time, credit_limit: before.auto_extract_credit_limit },
        after: input,
      },
    },
  });
}
