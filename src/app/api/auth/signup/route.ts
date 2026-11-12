import { publicRoute } from "@/server/api/with-auth";
import { ok } from "@/server/api/response";
import { signupSchema } from "@/lib/schemas/auth";
import { signUp } from "@/server/auth/service";

export const POST = publicRoute(
  { body: signupSchema, rateLimit: { key: "signup", limit: 5, windowSec: 3600 } },
  async ({ body, req }) => {
    await signUp(body, req.headers);
    // Email confirmation is always required, so there is never a session yet; an existing address looks identical (no enumeration).
    return ok({ requires_email_confirmation: true }, 201);
  },
);
