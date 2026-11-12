import { publicRoute } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { loginSchema } from "@/lib/schemas/auth";
import { ApiError } from "@/server/api/errors";
import { allowRequest } from "@/server/api/rate-limit";
import { signIn } from "@/server/auth/service";

export const POST = publicRoute(
  { body: loginSchema, rateLimit: { key: "login-ip", limit: 10, windowSec: 60 } },
  async ({ body, req }) => {
    // Also throttle per target email to slow credential stuffing across IPs.
    if (!(await allowRequest({ key: "login-email", limit: 10, windowSec: 600 }, body.email))) {
      throw new ApiError(429, "RATE_LIMITED", "Too many attempts, please try again later");
    }
    await signIn(body, req.headers);
    return ok({ ok: true });
  },
);
