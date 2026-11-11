import { withAuth } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { ApiError, Errors } from "@/server/api/errors";
import { RECOVERY_COOKIE } from "@/lib/auth-recovery";
import { ROLES } from "@/lib/schemas/common";
import { resetPasswordSchema } from "@/lib/schemas/auth";

/** Sets a new password for the signed-in user (the recovery link signs them in first). */
export const POST = withAuth(
  { roles: [ROLES[0], ROLES[1], ROLES[2]], requireApproved: false, body: resetPasswordSchema, rateLimit: { key: "reset-password", limit: 5, windowSec: 600 } },
  async ({ ctx, body, req }) => {
    // A stolen ordinary session must not be able to change the password: only the recovery link's session may.
    if (!req.cookies.get(RECOVERY_COOKIE)) throw Errors.forbidden();
    const { error } = await ctx.supabase.auth.updateUser({ password: body.password });
    if (error) {
      if (error.code === "weak_password") throw new ApiError(400, "BAD_REQUEST", "Password is too weak");
      if (error.code === "same_password") throw new ApiError(400, "BAD_REQUEST", "Choose a password you have not used before");
      throw new ApiError(400, "BAD_REQUEST", "Could not change the password");
    }
    await ctx.supabase.auth.signOut({ scope: "others" });
    const res = ok({ ok: true });
    res.cookies.delete({ name: RECOVERY_COOKIE, path: "/api/auth" });
    return res;
  },
);
