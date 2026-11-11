import { publicRoute } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { loginSchema } from "@/lib/schemas/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";
import { allowRequest } from "@/lib/api/rate-limit";

export const POST = publicRoute(
  { body: loginSchema, rateLimit: { key: "login-ip", limit: 10, windowSec: 60 } },
  async ({ body }) => {
    // Also throttle per target email to slow credential stuffing across IPs.
    if (!(await allowRequest({ key: "login-email", limit: 10, windowSec: 600 }, body.email))) {
      throw new ApiError(429, "RATE_LIMITED", "Too many attempts, please try again later");
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(body);
    if (error) {
      if (error.code === "email_not_confirmed") {
        throw new ApiError(403, "EMAIL_NOT_CONFIRMED", "Please confirm your email address first");
      }
      throw new ApiError(401, "UNAUTHENTICATED", "Invalid email or password");
    }
    return ok({ ok: true });
  },
);
