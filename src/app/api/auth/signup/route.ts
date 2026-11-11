import { publicRoute } from "@/lib/api/with-auth";
import { ok } from "@/lib/api/response";
import { signupSchema } from "@/lib/schemas/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";

export const POST = publicRoute(
  { body: signupSchema, rateLimit: { key: "signup", limit: 5, windowSec: 3600 } },
  async ({ body, req }) => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: body.full_name ? { full_name: body.full_name } : undefined,
        emailRedirectTo: `${env.appUrl ?? req.nextUrl.origin}/login`,
      },
    });
    if (error) {
      // Weak password etc. is user-fixable; anything else stays generic.
      if (error.code === "weak_password") throw new ApiError(400, "BAD_REQUEST", "Password is too weak");
      throw new ApiError(400, "BAD_REQUEST", "Could not create the account");
    }
    // With email confirmation on there is no session yet; existing emails look identical (no enumeration).
    return ok({ requires_email_confirmation: !data.session }, 201);
  },
);
