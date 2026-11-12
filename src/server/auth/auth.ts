import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/server/env";
import { getPrisma } from "@/server/db/prisma";
import { sendMail } from "@/server/mail/send";
import { resetPasswordEmail, verificationEmail } from "@/server/mail/templates";
import { hashPassword, verifyPassword } from "./password";

const DAY = 24 * 60 * 60;

/** The address links in emails point to. Better Auth's own URLs are not used: its HTTP handler is not mounted. */
export const appOrigin = () => env.appUrl ?? "http://localhost:3000";

/** Emails are sent without waiting, so a known and an unknown address take the same time to answer (no enumeration). */
function fireAndForget(mail: Promise<void>) {
  mail.catch((err) => console.error("[mail] send failed:", err instanceof Error ? err.message : "unknown error"));
}

function create() {
  return betterAuth({
    appName: "GBP Review Dashboard",
    baseURL: appOrigin(),
    secret: env.authSecret,
    trustedOrigins: [appOrigin()],
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    // Better Auth's built-in limiter only guards its own HTTP handler; our routes use the app's limiter (api/rate-limit.ts).
    rateLimit: { enabled: false },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: env.isProd,
      cookiePrefix: "gbp",
    },
    session: {
      expiresIn: 7 * DAY, // sliding: refreshed on use, at most once a day
      updateAge: DAY,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true, // no session until the email is confirmed; also makes sign-up enumeration-safe
      minPasswordLength: 8,
      maxPasswordLength: 72,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const url = `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
        fireAndForget(sendMail(resetPasswordEmail(user.email, user.name, url)));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false, // after confirming, the user signs in as usual (and waits for approval)
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, token }) => {
        const url = `${appOrigin()}/auth/verify?token=${encodeURIComponent(token)}`;
        fireAndForget(sendMail(verificationEmail(user.email, user.name, url)));
      },
    },
    plugins: [nextCookies()], // must stay last
  });
}

type Auth = ReturnType<typeof create>;
const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Lazy, like getPrisma(): builds and tests without a database or secrets still work until auth is actually used. */
export function getAuth(): Auth {
  globalForAuth.auth ??= create();
  return globalForAuth.auth;
}
