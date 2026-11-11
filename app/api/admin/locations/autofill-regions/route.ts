import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { autofillRegions } from "@/lib/data/google-refresh";

/** Admin: set empty regions from each location's address or name (no Serper calls). */
export const POST = withAuth({ roles: ["admin"], rateLimit: { key: "admin", limit: 60, windowSec: 60 } }, async ({ ctx }) =>
  ok({ set: await autofillRegions(ctx.profile.id) }),
);
