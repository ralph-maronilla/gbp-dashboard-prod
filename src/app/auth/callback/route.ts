import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE_SEC } from "@/lib/auth-recovery";

/** Landing page of the recovery email: swaps the one-time code for a session, then asks for the new password. */
export async function GET(req: NextRequest) {
  const origin = env.appUrl ?? req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Marks this session as one the recovery email created: only it may set a new password (see /api/auth/reset-password).
      const res = NextResponse.redirect(`${origin}/reset-password`);
      res.cookies.set(RECOVERY_COOKIE, "1", { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/api/auth", maxAge: RECOVERY_MAX_AGE_SEC });
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/forgot-password?expired=1`);
}
