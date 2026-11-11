import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { env } from "@/server/env";
import { listUsersQuerySchema, type AdminUser } from "@/lib/schemas/admin";
import type { Prisma } from "@/generated/prisma/client";

export const GET = withAuth({ roles: ["admin"], query: listUsersQuerySchema }, async ({ ctx, query }) => {
  const where: Prisma.profilesWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: "insensitive" } },
            { full_name: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { profiles, total, assignments, credits } = await ctx.db(async (tx) => {
    const [profiles, total] = await Promise.all([
      tx.profiles.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: query.page * query.pageSize,
        take: query.pageSize,
        select: { id: true, email: true, full_name: true, role: true, status: true, created_at: true, approved_at: true, last_seen_at: true, last_path: true },
      }),
      tx.profiles.count({ where }),
    ]);
    const assignments = await tx.user_locations.findMany({
      where: { user_id: { in: profiles.map((p) => p.id) } },
      select: { user_id: true, location_id: true, group_id: true },
    });
    const ids = profiles.map((p) => p.id);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    // Reservations of runs still going count as spent, like the daily limits do (migration 0017).
    const credits = ids.length
      ? await tx.$queryRaw<{ user_id: string; today: number; last30: number }[]>`
          select started_by as user_id,
                 coalesce(sum(greatest(credits_used, credits_reserved)) filter (where started_at >= ${today}), 0)::int as today,
                 coalesce(sum(greatest(credits_used, credits_reserved)), 0)::int as last30
          from public.sync_runs
          where location_id is null and started_by = any(${ids}::uuid[]) and started_at >= now() - interval '30 days'
          group by started_by`
      : [];
    return { profiles, total, assignments, credits };
  });

  const rows: AdminUser[] = profiles.map((p) => ({
    ...p,
    created_at: p.created_at.toISOString(),
    approved_at: p.approved_at?.toISOString() ?? null,
    last_seen_at: p.last_seen_at?.toISOString() ?? null,
    credits_today: credits.find((c) => c.user_id === p.id)?.today ?? 0,
    credits_30d: credits.find((c) => c.user_id === p.id)?.last30 ?? 0,
    location_ids: assignments.filter((a) => a.user_id === p.id && a.location_id).map((a) => a.location_id as string),
    group_ids: assignments.filter((a) => a.user_id === p.id && a.group_id).map((a) => a.group_id as string),
  }));
  return ok({ rows, total, user_daily_credit_limit: env.serperUserDailyCreditLimit });
});
