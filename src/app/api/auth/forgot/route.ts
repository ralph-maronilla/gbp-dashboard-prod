import { publicRoute } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { allowRequest } from "@/server/api/rate-limit";
import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { requestPasswordReset } from "@/server/auth/service";

/** Emails a link to /reset-password?token=… (valid 1 hour, works once). */
export const POST = publicRoute(
  { body: forgotPasswordSchema, rateLimit: { key: "forgot-ip", limit: 5, windowSec: 3600 } },
  async ({ body, req }) => {
    // Throttle per target email too, so one address can't be mail-bombed from many IPs.
    if (await allowRequest({ key: "forgot-email", limit: 3, windowSec: 3600 }, body.email)) {
      await requestPasswordReset(body.email, req.headers);
    }
    // Same answer whether or not the address has an account (no enumeration).
    return ok({ ok: true });
  },
);
