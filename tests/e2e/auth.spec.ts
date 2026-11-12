import { expect, test, newContext } from "./fixtures";
import { E2E } from "./env";
import { USERS } from "./global-setup";
import { linkIn, loginViaForm, mailCount, waitForMail } from "./helpers";

const unique = (tag: string) => `${tag}.${Date.now()}@e2e.test`;

async function signUp(page: import("@playwright/test").Page, email: string, password = "First-passw0rd!", name = "Sam Signup") {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("We sent a confirmation link")).toBeVisible();
}

test.describe("sign-up, confirmation and approval", () => {
  test("a new person signs up, confirms by email, waits for approval, and gets in once an admin approves", async ({ page, browser }) => {
    test.slow(); // a long journey through two browsers; triples the time limit on a busy machine
    const email = unique("signup");
    const before = mailCount();
    await signUp(page, email);

    // 1. They cannot sign in before confirming.
    await loginViaForm(page, email, "First-passw0rd!");
    await expect(page.getByText("Please confirm your email address first")).toBeVisible();

    // 2. The emailed link confirms the address and lands on the sign-in page.
    const mail = await waitForMail(email, /confirm your email/i, before);
    await page.goto(linkIn(mail));
    await expect(page).toHaveURL(/\/login\?verified=1/);
    await expect(page.getByText("Your email is confirmed")).toBeVisible();

    // 3. They sign in but see only the waiting page, and no data.
    await loginViaForm(page, email, "First-passw0rd!");
    await expect(page).toHaveURL(/\/pending-approval/);
    await expect(page.getByText("Waiting for approval")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/pending-approval/);
    expect((await page.request.get("/api/stats/overview")).status()).toBe(403);

    // 4. An admin approves them on the Users page.
    const adminCtx = await newContext(browser);
    const admin = await adminCtx.newPage();
    await loginViaForm(admin, USERS.admin.email);
    await expect(admin).toHaveURL(E2E.appUrl + "/");
    await admin.goto("/admin/users");
    const row = admin.getByRole("row").filter({ has: admin.getByRole("switch", { name: `Manual extraction for ${email}` }) });
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(row.getByText("approved")).toBeVisible();
    await adminCtx.close();

    // 5. Their next page load lets them in.
    await page.goto("/");
    await expect(page).toHaveURL(E2E.appUrl + "/");
    await expect(page.getByText("Waiting for approval")).toHaveCount(0);
  });

  test("a second sign-up with the same address looks the same and sends no second email", async ({ page }) => {
    const email = unique("dup");
    await signUp(page, email);
    await waitForMail(email, /confirm your email/i);
    const sent = mailCount();
    await signUp(page, email, "Another-passw0rd!");
    await page.waitForTimeout(500);
    expect(mailCount()).toBe(sent);
  });

  test("a too-short password is refused before anything is sent", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(unique("short"));
    await page.getByLabel(/^Password/).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/at least 8 characters/i).first()).toBeVisible();
    await expect(page.getByText("We sent a confirmation link")).toHaveCount(0);
  });
});

test.describe("signing in and out", () => {
  test("a wrong password shows one generic error; the right one signs in", async ({ page }) => {
    await loginViaForm(page, USERS.viewer.email, "not-the-password");
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await loginViaForm(page, "nobody.like.this@e2e.test");
    await expect(page.getByText("Invalid email or password")).toBeVisible(); // same message for an unknown address
    await loginViaForm(page, USERS.viewer.email);
    await expect(page).toHaveURL(E2E.appUrl + "/");
  });

  test("signed-out visitors are sent to the sign-in page, and the session cookie is HttpOnly", async ({ page, context }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get("/api/me")).status()).toBe(401);

    await loginViaForm(page, USERS.viewer.email);
    await expect(page).toHaveURL(E2E.appUrl + "/");
    const cookie = (await context.cookies()).find((c) => c.name.includes("session_token"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    // The browser's own script cannot read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");
  });

  test("signing out ends the session everywhere it is used", async ({ page }) => {
    await loginViaForm(page, USERS.viewer.email);
    await expect(page).toHaveURL(E2E.appUrl + "/");
    await page.waitForLoadState("networkidle"); // the page must be interactive before the click means anything (dev builds hydrate slowly)
    await page.getByRole("button", { name: /sign out|log out/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get("/api/me")).status()).toBe(401);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a pending person is held on the waiting page and gets no data", async ({ page }) => {
    await loginViaForm(page, USERS.pending.email);
    await expect(page).toHaveURL(/\/pending-approval/);
    await page.goto("/extraction");
    await expect(page).toHaveURL(/\/pending-approval/);
    expect((await page.request.get("/api/locations")).status()).toBe(403);
  });
});

test.describe("password reset", () => {
  test("the emailed link sets a new password, ends other sessions, and works once", async ({ page, browser }) => {
    const email = USERS.resetter.email;
    // A second device is signed in when the reset happens.
    const other = await newContext(browser);
    const otherPage = await other.newPage();
    await loginViaForm(otherPage, email);
    await expect(otherPage).toHaveURL(E2E.appUrl + "/");

    const before = mailCount();
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for that address")).toBeVisible();

    const mail = await waitForMail(email, /reset your .* password/i, before);
    const link = linkIn(mail);
    expect(link).toContain("/reset-password?token=");

    await page.goto(link);
    await page.getByLabel(/^New password/).fill("Second-passw0rd!");
    await page.getByLabel("Confirm new password").fill("Second-passw0rd!");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await expect(page.getByText("Your password was changed")).toBeVisible();

    // Old password and the old device's session are both dead; the new password works.
    expect((await otherPage.request.get("/api/me")).status()).toBe(401);
    await other.close();
    await loginViaForm(page, email, E2E.password);
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await loginViaForm(page, email, "Second-passw0rd!");
    await expect(page).toHaveURL(E2E.appUrl + "/");

    // The link cannot be used a second time.
    // (A fresh browser profile: clearing cookies under a live signed-in page would race with the app's own redirect to sign-in.)
    const stranger = await newContext(browser);
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(link);
    await strangerPage.getByLabel(/^New password/).fill("Third-passw0rd!");
    await strangerPage.getByLabel("Confirm new password").fill("Third-passw0rd!");
    await strangerPage.getByRole("button", { name: "Save password" }).click();
    await expect(strangerPage.getByText(/expired or was already used/i)).toBeVisible();
    await stranger.close();
  });

  test("asking for a reset for an unknown address gives the same answer and sends nothing", async ({ page }) => {
    const sent = mailCount();
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("ghost@e2e.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for that address")).toBeVisible();
    await page.waitForTimeout(500);
    expect(mailCount()).toBe(sent);
  });

  test("a reset page without a token says so", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/link is incomplete/i)).toBeVisible();
  });
});
