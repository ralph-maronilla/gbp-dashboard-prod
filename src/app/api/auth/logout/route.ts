import { withAuth } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { ROLES } from "@/lib/schemas/common";

export const POST = withAuth(
  { roles: [ROLES[0], ROLES[1], ROLES[2]], requireApproved: false },
  async ({ ctx }) => {
    await ctx.supabase.auth.signOut();
    return ok({ ok: true });
  },
);
