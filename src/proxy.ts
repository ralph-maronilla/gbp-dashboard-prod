import { NextResponse, type NextRequest } from "next/server";
import { getSessionWithCookies } from "@/server/auth/service";
import { withRls } from "@/server/db/with-rls";

const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];
/** Reachable without a session (the signed-out pages). */
const OPEN_PATHS = AUTH_PAGES;
/** Reachable by anyone, signed in or not: the email links. A signed-in pending user must still be able to use them. */
const EMAIL_LINK_PATHS = ["/reset-password", "/auth/verify"];

const isDev = process.env.NODE_ENV !== "production";

/**
 * Page CSP with a fresh nonce per request: only scripts carrying the nonce (Next adds it to its own) and what they load
 * may run, so an injected inline script is blocked. Styles stay 'unsafe-inline' (MUI/Emotion inject them at run time;
 * inline styles cannot run code). `/api/*` gets its own static policy in next.config.ts.
 */
function pageCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
    "report-uri /api/csp-report",
  ].join("; ");
}

/** Every response this proxy returns (pages, redirects, errors) carries the page CSP. */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = pageCsp(nonce);
  const res = await gate(request, csp);
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

/**
 * UX-level gate only. API handlers enforce the same rules independently (withAuth).
 *  - email links          → always pass (/reset-password?token=…, /auth/verify?token=…)
 *  - no session           → /login (except /login, /signup, /forgot-password)
 *  - pending / rejected   → /pending-approval
 *  - approved             → proceeds; auth pages bounce to /; /admin/* needs role admin
 */
async function gate(request: NextRequest, csp: string) {
  // Next reads the nonce from the request's CSP header while rendering and puts it on its scripts.
  const pass = () => {
    const headers = new Headers(request.headers);
    headers.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  const response = pass();

  const redirect = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    for (const c of response.headers.getSetCookie()) res.headers.append("set-cookie", c); // keep the refreshed session cookie
    return res;
  };

  const path = request.nextUrl.pathname;
  if (EMAIL_LINK_PATHS.includes(path)) return response;

  let session;
  try {
    session = await getSessionWithCookies(request.headers);
  } catch (err) {
    console.error("[proxy] session lookup failed:", err instanceof Error ? err.message : "unknown error");
    return new NextResponse("Service temporarily unavailable. Please try again.", { status: 503 });
  }
  // The session slides forward on use; pass the refreshed cookie to the browser or its 7 days would never extend.
  for (const c of session.setCookies) response.headers.append("set-cookie", c);

  if (!session.user) {
    return OPEN_PATHS.includes(path) ? response : redirect("/login");
  }

  const userId = session.user.id;
  let profile: { role: string; status: string } | null;
  try {
    // Same RLS-scoped Prisma path as the API handlers (Next 16 proxy runs on the Node runtime).
    profile = await withRls(userId, (tx) =>
      tx.profiles.findUnique({ where: { id: userId }, select: { role: true, status: true } }),
    );
  } catch (err) {
    // A failed lookup is not the same as "not approved": don't mislead the user.
    console.error("[proxy] profile lookup failed:", err instanceof Error ? err.message : "unknown error");
    return new NextResponse("Service temporarily unavailable. Please try again.", { status: 503 });
  }

  if (!profile || profile.status !== "approved") {
    return path === "/pending-approval" ? response : redirect("/pending-approval");
  }
  if (AUTH_PAGES.includes(path) || path === "/pending-approval") return redirect("/");
  if (path.startsWith("/admin") && profile.role !== "admin") return redirect("/");
  return response;
}

export const config = {
  // Skip API routes (they authenticate themselves and get their CSP from next.config.ts), Next internals and static files.
  matcher: ["/((?!api(?:/|$)|_next/static/|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
