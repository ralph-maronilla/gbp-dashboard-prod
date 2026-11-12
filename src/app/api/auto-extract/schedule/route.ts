import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { env } from "@/server/env";
import { ROLES } from "@/lib/schemas/common";
import type { AutoExtractSchedule } from "@/lib/schemas/auto-extract";

/**
 * Any approved user: whether automatic extraction is on and when it runs (Manila time). Read through
 * public.auto_extract_schedule() (migration 0021): the settings table itself is admin-only.
 */
export const GET = withAuth({ roles: [ROLES[0], ROLES[1], ROLES[2]] }, async ({ ctx }) => {
  const rows = await ctx.db((tx) => tx.$queryRaw<{ enabled: boolean; run_time: string }[]>`select enabled, run_time from public.auto_extract_schedule()`);
  const row = rows[0];
  const schedule: AutoExtractSchedule = { enabled: row?.enabled ?? false, time: row?.run_time ?? null, time_zone: env.exportTimeZone };
  return ok(schedule);
});
