import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { owner } from "../../../tests/db/helpers";
import type { Mail } from "@/server/mail/send";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
  process.env.APP_URL = "http://localhost:3000";
});

// Real Better Auth, real database; only the client is pointed at the test DB and outgoing mail is captured.
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => owner }));
const outbox: Mail[] = [];
vi.mock("@/server/mail/send", () => ({ sendMail: async (m: Mail) => void outbox.push(m) }));

import { getAuth } from "./auth";
import * as service from "./service";
import { withAuth } from "@/server/api/with-auth";
import { ApiError } from "@/server/api/errors";

type Row = Record<string, unknown>;
const H = new Headers();
const PASSWORD = "correct horse battery";
const tokenFrom = (mail: Mail) => new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
const lastMail = () => outbox[outbox.length - 1];
const mailsTo = (to: string) => outbox.filter((m) => m.to === to);

/** Cookie header ("name=value; …") from a sign-in, as the browser would send it back. */
async function signInCookie(email: string, password = PASSWORD) {
  const { headers } = await getAuth().api.signInEmail({ body: { email, password }, returnHeaders: true });
  return headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/** Creates a confirmed account; `status` is the profile's approval state. */
async function createUser(email: string, status: "pending" | "approved" = "approved", role: "viewer" | "admin" = "viewer") {
  await service.signUp({ email, password: PASSWORD, full_name: "Test User" }, H);
  await service.verifyEmail(tokenFrom(mailsTo(email)[0]), H);
  const [u] = await owner.$queryRawUnsafe<{ id: string }[]>(`select id from public.auth_user where email = '${email}'`);
  await owner.$executeRawUnsafe(`update public.profiles set status = '${status}', role = '${role}' where id = '${u.id}'`);
  return u.id;
}

const call = (cookie: string | null, handler: ReturnType<typeof withAuth>) =>
  handler(new NextRequest("http://localhost:3000/api/test", { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({}) });

beforeAll(() => owner.$executeRawUnsafe(`truncate public.auth_user, public.profiles cascade`));
beforeEach(async () => {
  outbox.length = 0;
  await owner.$executeRawUnsafe(`truncate public.auth_user, public.profiles cascade`);
});
afterAll(() => owner.$disconnect());

describe("sign-up", () => {
  it("creates an unconfirmed account, a bcrypt credential, a pending viewer profile, and sends one confirmation email", async () => {
    await service.signUp({ email: "new@t.test", password: PASSWORD, full_name: "Nia Cruz" }, H);

    const [user] = await owner.$queryRawUnsafe<Row[]>(`select id, name, email, email_verified from public.auth_user`);
    expect(user).toMatchObject({ name: "Nia Cruz", email: "new@t.test", email_verified: false });

    const [account] = await owner.$queryRawUnsafe<Row[]>(`select provider_id, account_id, password from public.auth_account`);
    expect(account.provider_id).toBe("credential");
    expect(account.account_id).toBe(user.id);
    expect(String(account.password)).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare(PASSWORD, String(account.password))).toBe(true);

    const [profile] = await owner.$queryRawUnsafe<Row[]>(`select id, email, full_name, role, status, can_extract from public.profiles`);
    expect(profile).toEqual({ id: user.id, email: "new@t.test", full_name: "Nia Cruz", role: "viewer", status: "pending", can_extract: false });

    expect(await owner.$queryRawUnsafe<Row[]>(`select 1 from public.auth_session`)).toHaveLength(0); // no session until confirmed
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("new@t.test");
    expect(outbox[0].text).toContain("http://localhost:3000/auth/verify?token=");
  });

  it("without a name the profile's full_name stays empty", async () => {
    await service.signUp({ email: "anon@t.test", password: PASSWORD }, H);
    const [p] = await owner.$queryRawUnsafe<Row[]>(`select full_name from public.profiles`);
    expect(p.full_name).toBeNull();
  });

  it("an existing address answers the same way, creates nothing new and emails no one", async () => {
    await service.signUp({ email: "dup@t.test", password: PASSWORD }, H);
    outbox.length = 0;
    await expect(service.signUp({ email: "dup@t.test", password: "another password 1" }, H)).resolves.toBeUndefined();
    expect(await owner.$queryRawUnsafe<Row[]>(`select 1 from public.auth_user`)).toHaveLength(1);
    expect(outbox).toHaveLength(0);
    const [a] = await owner.$queryRawUnsafe<Row[]>(`select password from public.auth_account`);
    expect(await bcrypt.compare(PASSWORD, String(a.password))).toBe(true); // the first password is untouched
  });
});

describe("email confirmation and sign-in", () => {
  it("cannot sign in before confirming, with a distinct error", async () => {
    await service.signUp({ email: "u@t.test", password: PASSWORD }, H);
    await expect(service.signIn({ email: "u@t.test", password: PASSWORD }, H)).rejects.toMatchObject({ status: 403, code: "EMAIL_NOT_CONFIRMED" });
  });

  it("confirms with the emailed link, then signs in", async () => {
    await service.signUp({ email: "u@t.test", password: PASSWORD }, H);
    expect(await service.verifyEmail(tokenFrom(lastMail()), H)).toBe(true);
    const [u] = await owner.$queryRawUnsafe<Row[]>(`select email_verified from public.auth_user`);
    expect(u.email_verified).toBe(true);
    expect(await owner.$queryRawUnsafe<Row[]>(`select 1 from public.auth_session`)).toHaveLength(0); // confirming does not sign in
    await expect(service.signIn({ email: "u@t.test", password: PASSWORD }, H)).resolves.toBeUndefined();
  });

  it("rejects a garbage or tampered confirmation token", async () => {
    expect(await service.verifyEmail("nope", H)).toBe(false);
    await service.signUp({ email: "u@t.test", password: PASSWORD }, H);
    expect(await service.verifyEmail(tokenFrom(lastMail()) + "x", H)).toBe(false);
  });

  it("a wrong password and an unknown address give the same error", async () => {
    await createUser("u@t.test");
    const wrong = await service.signIn({ email: "u@t.test", password: "not the password" }, H).catch((e) => e);
    const unknown = await service.signIn({ email: "ghost@t.test", password: PASSWORD }, H).catch((e) => e);
    for (const e of [wrong, unknown]) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ status: 401, code: "UNAUTHENTICATED", message: "Invalid email or password" });
    }
  });

  it("sets a secure-by-default session cookie that lasts 7 days and a session row to match", async () => {
    await createUser("u@t.test");
    const { headers } = await getAuth().api.signInEmail({ body: { email: "u@t.test", password: PASSWORD }, returnHeaders: true });
    const cookie = headers.getSetCookie().find((c) => c.startsWith("gbp.session_token="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=604800/);
    const [s] = await owner.$queryRawUnsafe<{ days: number }[]>(`select extract(epoch from (expires_at - now())) / 86400 as days from public.auth_session`);
    expect(Number(s.days)).toBeGreaterThan(6.9);
    expect(Number(s.days)).toBeLessThanOrEqual(7);
  });

  it("signs in a migrated legacy account with its existing $2a$ bcrypt hash", async () => {
    const hash = bcrypt.hashSync("from legacy 99", bcrypt.genSaltSync(10)).replace(/^\$2b\$/, "$2a$");
    await owner.$executeRawUnsafe(`
      insert into public.auth_user (id, name, email, email_verified) values ('00000000-0000-4000-8000-0000000000aa', 'Old User', 'old@t.test', true);
      insert into public.auth_account (id, account_id, provider_id, user_id, password, updated_at)
        values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000aa', 'credential', '00000000-0000-4000-8000-0000000000aa', '${hash}', now());`);
    await expect(service.signIn({ email: "old@t.test", password: "from legacy 99" }, H)).resolves.toBeUndefined();
    await expect(service.signIn({ email: "old@t.test", password: "from legacy 98" }, H)).rejects.toMatchObject({ status: 401 });
  });

  it("treats a corrupt stored hash as a wrong password, not a server error", async () => {
    const id = await createUser("u@t.test");
    await owner.$executeRawUnsafe(`update public.auth_account set password = 'garbage' where user_id = '${id}'`);
    await expect(service.signIn({ email: "u@t.test", password: PASSWORD }, H)).rejects.toMatchObject({ status: 401 });
  });
});

describe("sessions", () => {
  it("getSessionUser resolves the cookie to the user, and nothing without one", async () => {
    const id = await createUser("u@t.test");
    const cookie = await signInCookie("u@t.test");
    expect(await service.getSessionUser(new Headers({ cookie }))).toEqual({ id, email: "u@t.test" });
    expect(await service.getSessionUser(new Headers())).toBeNull();
    expect(await service.getSessionUser(new Headers({ cookie: "gbp.session_token=forged.value" }))).toBeNull();
  });

  it("sign-out ends the session", async () => {
    await createUser("u@t.test");
    const cookie = await signInCookie("u@t.test");
    await service.signOut(new Headers({ cookie }));
    expect(await service.getSessionUser(new Headers({ cookie }))).toBeNull();
    expect(await owner.$queryRawUnsafe<Row[]>(`select 1 from public.auth_session`)).toHaveLength(0);
  });

  it("an expired session is rejected", async () => {
    await createUser("u@t.test");
    const cookie = await signInCookie("u@t.test");
    await owner.$executeRawUnsafe(`update public.auth_session set expires_at = now() - interval '1 minute'`);
    expect(await service.getSessionUser(new Headers({ cookie }))).toBeNull();
  });

  it("slides the expiry forward once a day has passed, and hands back a refreshed cookie", async () => {
    await createUser("u@t.test");
    const cookie = await signInCookie("u@t.test");
    // Pretend the session was last extended 2 days ago (expires in 5 days).
    await owner.$executeRawUnsafe(`update public.auth_session set expires_at = now() + interval '5 days', updated_at = now() - interval '2 days'`);
    const { user, setCookies } = await service.getSessionWithCookies(new Headers({ cookie }));
    expect(user).not.toBeNull();
    const [s] = await owner.$queryRawUnsafe<{ days: number }[]>(`select extract(epoch from (expires_at - now())) / 86400 as days from public.auth_session`);
    expect(Number(s.days)).toBeGreaterThan(6.9);
    expect(setCookies.some((c) => c.startsWith("gbp.session_token=") && /Max-Age=604800/.test(c))).toBe(true);
  });
});

describe("password reset", () => {
  it("emails a link straight to /reset-password with a one-time token", async () => {
    await createUser("u@t.test");
    outbox.length = 0;
    await service.requestPasswordReset("u@t.test", H);
    await vi.waitFor(() => expect(outbox).toHaveLength(1));
    expect(outbox[0].to).toBe("u@t.test");
    expect(outbox[0].text).toMatch(/^.*http:\/\/localhost:3000\/reset-password\?token=[^\s&]+/m);
    expect(outbox[0].text).not.toContain("/api/auth"); // Better Auth's own URL is never exposed
  });

  it("answers the same and sends nothing for an unknown address", async () => {
    await expect(service.requestPasswordReset("ghost@t.test", H)).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 50));
    expect(outbox).toHaveLength(0);
  });

  it("sets the new password, signs out every session, and the token works once", async () => {
    await createUser("u@t.test");
    const cookie = await signInCookie("u@t.test");
    await signInCookie("u@t.test"); // a second device
    outbox.length = 0;
    await service.requestPasswordReset("u@t.test", H);
    await vi.waitFor(() => expect(outbox).toHaveLength(1));
    const token = tokenFrom(outbox[0]);

    await service.resetPassword({ token, password: "a brand new password" }, H);

    expect(await owner.$queryRawUnsafe<Row[]>(`select 1 from public.auth_session`)).toHaveLength(0);
    expect(await service.getSessionUser(new Headers({ cookie }))).toBeNull();
    await expect(service.signIn({ email: "u@t.test", password: PASSWORD }, H)).rejects.toMatchObject({ status: 401 });
    await expect(service.signIn({ email: "u@t.test", password: "a brand new password" }, H)).resolves.toBeUndefined();
    await expect(service.resetPassword({ token, password: "yet another password" }, H)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an unknown token and an expired one", async () => {
    await createUser("u@t.test");
    await expect(service.resetPassword({ token: "bogus", password: "a brand new password" }, H)).rejects.toMatchObject({ status: 400 });
    outbox.length = 0;
    await service.requestPasswordReset("u@t.test", H);
    await vi.waitFor(() => expect(outbox).toHaveLength(1));
    await owner.$executeRawUnsafe(`update public.auth_verification set expires_at = now() - interval '1 minute'`);
    await expect(service.resetPassword({ token: tokenFrom(outbox[0]), password: "a brand new password" }, H)).rejects.toMatchObject({ status: 400 });
  });

  it("allows reusing the old password (the 'not used before' rule is gone)", async () => {
    await createUser("u@t.test");
    outbox.length = 0;
    await service.requestPasswordReset("u@t.test", H);
    await vi.waitFor(() => expect(outbox).toHaveLength(1));
    await expect(service.resetPassword({ token: tokenFrom(outbox[0]), password: PASSWORD }, H)).resolves.toBeUndefined();
  });
});

describe("withAuth on Better Auth sessions", () => {
  const ok = withAuth({ roles: ["viewer", "manager", "admin"] }, async ({ ctx }) => Response.json({ id: ctx.user.id, role: ctx.profile.role }));
  const adminOnly = withAuth({ roles: ["admin"] }, async () => Response.json({ ok: true }));
  const anyStatus = withAuth({ roles: ["viewer", "manager", "admin"], requireApproved: false }, async ({ ctx }) => Response.json({ status: ctx.profile.status }));

  it("401 without a session, 401 for a forged cookie", async () => {
    expect((await call(null, ok)).status).toBe(401);
    expect((await call("gbp.session_token=forged.value", ok)).status).toBe(401);
  });

  it("runs the handler for an approved user with the right role", async () => {
    const id = await createUser("u@t.test");
    const res = await call(await signInCookie("u@t.test"), ok);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id, role: "viewer" });
  });

  it("403 NOT_APPROVED for a pending user, but routes that allow it still work", async () => {
    await createUser("p@t.test", "pending");
    const cookie = await signInCookie("p@t.test");
    const res = await call(cookie, ok);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_APPROVED");
    expect(await (await call(cookie, anyStatus)).json()).toEqual({ status: "pending" });
  });

  it("403 for the wrong role", async () => {
    await createUser("v@t.test");
    expect((await call(await signInCookie("v@t.test"), adminOnly)).status).toBe(403);
    await createUser("a@t.test", "approved", "admin");
    expect((await call(await signInCookie("a@t.test"), adminOnly)).status).toBe(200);
  });

  it("403 for a rejected user", async () => {
    await createUser("r@t.test");
    await owner.$executeRawUnsafe(`update public.profiles set status = 'rejected' where email = 'r@t.test'`);
    expect((await call(await signInCookie("r@t.test"), ok)).status).toBe(403);
  });

  it("stops working the moment the session is revoked (password reset)", async () => {
    await createUser("u@t.test");
    const cookie = await signInCookie("u@t.test");
    expect((await call(cookie, ok)).status).toBe(200);
    outbox.length = 0;
    await service.requestPasswordReset("u@t.test", H);
    await vi.waitFor(() => expect(outbox).toHaveLength(1));
    await service.resetPassword({ token: tokenFrom(outbox[0]), password: "a brand new password" }, H);
    expect((await call(cookie, ok)).status).toBe(401);
  });
});
