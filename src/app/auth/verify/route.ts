import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { verifyEmail } from "@/server/auth/service";

/** Landing page of the confirmation email: marks the address confirmed, then sends the user to sign in. */
export async function GET(req: NextRequest) {
  const origin = env.appUrl ?? req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("token");
  const verified = token ? await verifyEmail(token, req.headers) : false;
  return NextResponse.redirect(`${origin}/login?${verified ? "verified=1" : "verify_error=1"}`);
}
