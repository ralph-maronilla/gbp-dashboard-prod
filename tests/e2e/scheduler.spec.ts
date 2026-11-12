import { Client } from "pg";
import { expect, test } from "./fixtures";
import { E2E } from "./env";
import { USERS } from "./global-setup";
import { loginViaApi } from "./helpers";

// Runs after the specs that count reviews (files run in alphabetical order): the automatic run extracts every location.

const bearer = (secret: string) => ({ headers: { Authorization: `Bearer ${secret}` } });
const h = { Origin: E2E.appUrl };

/** The current Manila time rounded down to the 15-minute step the schedule uses: a time that has already come today. */
function dueTime(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [hh, mm] = parts.split(":").map(Number);
  return `${String(hh % 24).padStart(2, "0")}:${String(Math.floor(mm / 15) * 15).padStart(2, "0")}`;
}

test.describe("automatic extraction (the timer's call to /api/cron/sync)", () => {
  test("refuses a call without the secret, or with a wrong one", async ({ request }) => {
    expect((await request.get("/api/cron/sync")).status()).toBe(401);
    expect((await request.get("/api/cron/sync", bearer("wrong-secret"))).status()).toBe(401);
    expect((await request.get("/api/cron/sync", { headers: { Authorization: E2E.cronSecret } })).status()).toBe(401); // missing "Bearer "
  });

  test("does nothing while it is switched off, but records that the scheduler called", async ({ request, page }) => {
    const res = await request.get("/api/cron/sync", bearer(E2E.cronSecret));
    expect(res.status()).toBe(200);
    expect((await res.json()).data).toEqual({ skipped: "disabled" });

    await loginViaApi(page, USERS.admin.email);
    const status = (await (await page.request.get("/api/admin/auto-extract")).json()).data;
    expect(status.enabled).toBe(false);
    expect(status.scheduler_connected).toBe(true);
  });

  test("only an admin can change the schedule", async ({ page }) => {
    await loginViaApi(page, USERS.manager.email);
    const res = await page.request.put("/api/admin/auto-extract", { headers: h, data: { enabled: true, time: "06:00", credit_limit: 300 } });
    expect(res.status()).toBe(403);
    expect((await page.request.get("/api/admin/auto-extract")).status()).toBe(403);
  });

  test("once an admin switches it on for a time that has come, the next call extracts every location, once a day", async ({ request, page }) => {
    await loginViaApi(page, USERS.admin.email);
    const saved = await page.request.put("/api/admin/auto-extract", { headers: h, data: { enabled: true, time: dueTime(), credit_limit: 300 } });
    expect(saved.status()).toBe(200);
    // By design, saving a time that has already passed today starts the schedule tomorrow. Move the clock to "a new day":
    // forget that today's run happened, so the time that has come is due.
    expect((await saved.json()).data.due).toBe(false);
    const db = new Client({ connectionString: E2E.dbUrl });
    await db.connect();
    await db.query("update public.app_settings set auto_last_run_on = null where id = 1");
    await db.end();

    const run = await request.get("/api/cron/sync", bearer(E2E.cronSecret));
    expect(run.status()).toBe(200);
    const summary = (await run.json()).data;
    expect(summary.skipped).toBeUndefined();
    expect(summary.processed).toBeGreaterThanOrEqual(4); // Alpha, Beta, Gamma, Delta (and any added by earlier tests)
    expect(summary.reviews_upserted).toBeGreaterThan(0);
    expect(summary.failed).toBe(0);

    // The same day, the next call is not due again.
    const again = await request.get("/api/cron/sync", bearer(E2E.cronSecret));
    expect((await again.json()).data).toEqual({ skipped: "not_due" });

    // The Extraction page tells an admin the scheduler is connected and what the last run did.
    await page.goto("/extraction");
    await expect(page.getByText("Scheduler connected")).toBeVisible();
    await expect(page.getByText("Last automatic run")).toBeVisible();
    await expect(page.getByText(/reviews saved/).first()).toBeVisible();
  });

  test("switching it off stops the next call from doing anything", async ({ request, page }) => {
    await loginViaApi(page, USERS.admin.email);
    expect((await page.request.put("/api/admin/auto-extract", { headers: h, data: { enabled: false, time: "06:00", credit_limit: 300 } })).status()).toBe(200);
    const res = await request.get("/api/cron/sync", bearer(E2E.cronSecret));
    expect((await res.json()).data).toEqual({ skipped: "disabled" });
  });
});
