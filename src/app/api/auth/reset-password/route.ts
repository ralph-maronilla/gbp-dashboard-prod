import { publicRoute } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { resetPasswordSchema } from "@/lib/schemas/auth";
import { resetPassword } from "@/server/auth/service";

/** Sets a new password from the emailed token, and signs the account out everywhere. The user then signs in again. */
export const POST = publicRoute(
  { body: resetPasswordSchema, rateLimit: { key: "reset-password", limit: 5, windowSec: 600 } },
  async ({ body, req }) => {
    await resetPassword(body, req.headers);
    return ok({ ok: true });
  },
);
