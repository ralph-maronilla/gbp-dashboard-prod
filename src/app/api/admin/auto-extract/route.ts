import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { getAutoExtract, saveAutoExtract } from "@/lib/data/auto-extract";
import { autoExtractSchema } from "@/lib/schemas/auto-extract";

/** Admin: automatic extraction settings, next run, last automatic run and whether the scheduler is calling. */
export const GET = withAuth({ roles: ["admin"] }, async ({ ctx }) => ok(await ctx.db((tx) => getAutoExtract(tx))));

/** Admin: switch automatic extraction on/off, its Manila time and its daily credit limit (audit-logged). */
export const PUT = withAuth(
  { roles: ["admin"], body: autoExtractSchema, rateLimit: { key: "admin", limit: 30, windowSec: 60 } },
  async ({ ctx, body }) =>
    ok(
      await ctx.db(async (tx) => {
        await saveAutoExtract(tx, ctx.profile.id, body);
        return getAutoExtract(tx);
      }),
    ),
);
