import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { autofillRegions } from "@/server/data/google-refresh";

/** Admin: set empty regions from each location's address or name (no Serper calls). */
export const POST = withAuth({ roles: ["admin"], rateLimit: { key: "admin", limit: 60, windowSec: 60 } }, async ({ ctx }) =>
  ok({ set: await autofillRegions(ctx.profile.id) }),
);
