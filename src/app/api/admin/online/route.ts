import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { ACTIVE_WINDOW_MS } from "@/lib/presence";
import type { OnlineUser } from "@/lib/schemas/admin";

// Approved users who reported in within the last hour (see lib/presence.ts), most recent first.
export const GET = withAuth({ roles: ["admin"] }, async ({ ctx }) => {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const rows = await ctx.db((tx) =>
    tx.profiles.findMany({
      where: { status: "approved", last_seen_at: { gte: since } },
      orderBy: { last_seen_at: "desc" },
      select: { id: true, email: true, full_name: true, role: true, last_seen_at: true, last_path: true },
    }),
  );
  const active: OnlineUser[] = rows.map((r) => ({ ...r, last_seen_at: r.last_seen_at!.toISOString() }));
  return ok({ active });
});
