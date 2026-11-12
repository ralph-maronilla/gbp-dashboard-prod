import { Client } from "pg";
import { expect, test } from "./fixtures";
import { E2E } from "./env";
import { USERS } from "./global-setup";
import { loginViaApi, loginViaForm } from "./helpers";

const json = { "Content-Type": "application/json" };

test.describe("rate limiting", () => {
  test("the 11th sign-in attempt in a minute from one address is refused, and the form says so; another address is unaffected", async ({ page, playwright }) => {
    const ip = "203.0.113.200";
    const api = await playwright.request.newContext({ baseURL: E2E.appUrl, extraHTTPHeaders: { Origin: E2E.appUrl, "X-Real-IP": ip, ...json } });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await api.post("/api/auth/login", { data: { email: `rl${i}@e2e.test`, password: "whatever-123" } })).status());
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);

    // The browser on that same address sees the message.
    await page.context().setExtraHTTPHeaders({ "X-Real-IP": ip });
    await loginViaForm(page, USERS.viewer.email);
    await expect(page.getByText(/Too many/i)).toBeVisible();

    // A different address is fine.
    await page.context().setExtraHTTPHeaders({ "X-Real-IP": "203.0.113.201" });
    await loginViaForm(page, USERS.viewer.email);
    await expect(page).toHaveURL(E2E.appUrl + "/");
    await api.dispose();
  });

  test("a spoofed X-Forwarded-For does not give an attacker a fresh allowance", async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: E2E.appUrl, extraHTTPHeaders: { Origin: E2E.appUrl, "X-Real-IP": "203.0.113.210", ...json } });
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await api.post("/api/auth/login", { headers: { "X-Forwarded-For": `9.9.9.${i}` }, data: { email: `sp${i}@e2e.test`, password: "whatever-123" } })).status();
    expect(last).toBe(429);
    await api.dispose();
  });

  test("one email address cannot be attacked from many addresses", async ({ playwright }) => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const api = await playwright.request.newContext({ baseURL: E2E.appUrl, extraHTTPHeaders: { Origin: E2E.appUrl, "X-Real-IP": `203.0.113.${20 + i}`, ...json } });
      last = (await api.post("/api/auth/login", { data: { email: "victim@e2e.test", password: "wrong-password-1" } })).status();
      await api.dispose();
    }
    expect(last).toBe(429);
  });
});

test.describe("request checks", () => {
  test("a request from another site is refused, and so is one that is not JSON", async ({ request }) => {
    const evil = await request.post("/api/auth/login", { headers: { Origin: "https://evil.example", ...json }, data: { email: "a@b.co", password: "x" } });
    expect(evil.status()).toBe(403);
    expect((await evil.json()).error.code).toBe("CSRF");
    const noOrigin = await request.post("/api/auth/login", { headers: json, data: { email: "a@b.co", password: "x" } });
    expect(noOrigin.status()).toBe(403);
    const form = await request.post("/api/auth/login", { headers: { Origin: E2E.appUrl, "Content-Type": "application/x-www-form-urlencoded" }, data: "email=a@b.co&password=x" });
    expect(form.status()).toBe(415);
  });

  test("malformed input gets a validation error, not a server error", async ({ request }) => {
    const res = await request.post("/api/auth/signup", { headers: { Origin: E2E.appUrl, ...json, "X-Real-IP": "203.0.113.230" }, data: { email: "not-an-email", password: "x" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("health is open and says only 'ok'", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "ok" } });
  });
});

test.describe("browser protections", () => {
  test("pages carry a nonce-based policy and the usual headers; API answers carry a deny-all policy", async ({ page }) => {
    const res = await page.goto("/login");
    const h = res!.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
    const api = await page.request.get("/api/health");
    expect(api.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  test("walking through every page raises no policy violations or script errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    await loginViaApi(page, USERS.admin.email);
    for (const path of ["/", "/dashboard", "/extraction", "/admin/users", "/guide"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });

  test("review text from outside is shown as text and never runs", async ({ page }) => {
    // Plant a hostile review straight in the database, the way a malicious Google reviewer's text would arrive.
    const db = new Client({ connectionString: E2E.dbUrl });
    await db.connect();
    const loc = await db.query("insert into public.locations (gbp_account_id, gbp_location_id, name) values ('serper', 'serper:1000000000000000666', 'Evil Clinic') returning id");
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
    await db.query("insert into public.reviews (location_id, gbp_review_id, reviewer_name, rating, comment, create_time) values ($1, 'seed:evil', $2, 1, $3, now())", [loc.rows[0].id, `<b onmouseover="window.__xss=3">Mallory</b>`, payload]);
    await db.end();

    await loginViaApi(page, USERS.admin.email);
    await page.goto(`/locations/${loc.rows[0].id}`);
    await expect(page.getByText(payload, { exact: false })).toBeVisible(); // visible as literal text
    await page.getByText("Mallory").first().hover();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});
