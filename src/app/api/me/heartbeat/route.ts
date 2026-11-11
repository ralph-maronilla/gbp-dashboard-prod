import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { heartbeatSchema } from "@/lib/schemas/admin";
import { ROLES } from "@/lib/schemas/common";

// "I'm here": the browser calls this on app open and about once an hour. Writes through touch_last_seen (migration 0015),
// the only thing a non-admin may change about their own profile.
export const POST = withAuth(
  { roles: ROLES, body: heartbeatSchema, rateLimit: { key: "heartbeat", limit: 10, windowSec: 3600 } },
  async ({ ctx, body }) => {
    await ctx.db((tx) => tx.$executeRaw`select public.touch_last_seen(${body.path})`);
    return ok({ ok: true });
  },
);
