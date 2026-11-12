import "server-only";
import { ApiError } from "@/server/api/errors";
import { appOrigin, getAuth } from "./auth";

/** Our five auth operations on top of Better Auth. Routes call these; nothing else talks to Better Auth directly. */

/**
 * HTTP status of a Better Auth error. Read from the object, not via `instanceof APIError`: the bundler can load that
 * class twice (once inside Better Auth, once here), which makes the check fail in the running app but not in tests.
 */
function status(err: unknown): number | undefined {
  const code = typeof err === "object" && err !== null ? (err as { statusCode?: unknown }).statusCode : undefined;
  return typeof code === "number" ? code : undefined;
}

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in user for these request headers (cookies), or null. Also slides the session expiry forward. */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const result = await getAuth().api.getSession({ headers });
  return result ? { id: result.user.id, email: result.user.email } : null;
}

/** Same, but also returns the Set-Cookie headers (a refreshed session cookie) for callers that cannot set cookies themselves, like the proxy. */
export async function getSessionWithCookies(headers: Headers): Promise<{ user: SessionUser | null; setCookies: string[] }> {
  const { headers: out, response } = await getAuth().api.getSession({ headers, returnHeaders: true });
  return { user: response ? { id: response.user.id, email: response.user.email } : null, setCookies: out.getSetCookie() };
}

export async function signUp(input: { email: string; password: string; full_name?: string }, headers: Headers) {
  try {
    await getAuth().api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.full_name ?? "", callbackURL: `${appOrigin()}/login` },
      headers,
    });
  } catch (err) {
    // Existing addresses do not error (Better Auth answers as if it succeeded); anything else stays generic.
    console.error("[auth] sign-up failed:", status(err) ?? "unknown");
    throw new ApiError(400, "BAD_REQUEST", "Could not create the account");
  }
}

export async function signIn(input: { email: string; password: string }, headers: Headers) {
  try {
    await getAuth().api.signInEmail({ body: input, headers });
  } catch (err) {
    if (status(err) === 403) throw new ApiError(403, "EMAIL_NOT_CONFIRMED", "Please confirm your email address first");
    if (status(err) === 401 || status(err) === 400) throw new ApiError(401, "UNAUTHENTICATED", "Invalid email or password");
    throw err;
  }
}

export async function signOut(headers: Headers) {
  await getAuth().api.signOut({ headers });
}

/** Emails a reset link if the address has an account. Always resolves the same way. */
export async function requestPasswordReset(email: string, headers: Headers) {
  try {
    await getAuth().api.requestPasswordReset({ body: { email, redirectTo: `${appOrigin()}/reset-password` }, headers });
  } catch (err) {
    console.error("[auth] reset request failed:", status(err) ?? "unknown");
  }
}

/** Sets the new password from the emailed token and signs the user out everywhere. */
export async function resetPassword(input: { token: string; password: string }, headers: Headers) {
  try {
    await getAuth().api.resetPassword({ body: { token: input.token, newPassword: input.password }, headers });
  } catch (err) {
    if (status(err) === 400) throw new ApiError(400, "BAD_REQUEST", "This link has expired or was already used. Request a new one.");
    throw err;
  }
}

/** Marks the email confirmed. Returns false for an expired, used or invalid token. */
export async function verifyEmail(token: string, headers: Headers): Promise<boolean> {
  try {
    await getAuth().api.verifyEmail({ query: { token }, headers });
    return true;
  } catch {
    return false;
  }
}
