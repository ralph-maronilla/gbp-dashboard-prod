import { publicRoute } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { allowRequest } from "@/lib/api/rate-limit";
import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/** Emails a recovery link (/auth/callback signs the user in, then /reset-password sets the new password). */
export const POST = publicRoute(
  { body: forgotPasswordSchema, rateLimit: { key: "forgot-ip", limit: 5, windowSec: 3600 } },
  async ({ body, req }) => {
    // Throttle per target email too, so one address can't be mail-bombed from many IPs.
    if (await allowRequest({ key: "forgot-email", limit: 3, windowSec: 3600 }, body.email)) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.resetPasswordForEmail(body.email, { redirectTo: `${env.appUrl ?? req.nextUrl.origin}/auth/callback` });
    }
    // Same answer whether or not the address has an account (no enumeration).
    return ok({ ok: true });
  },
);
