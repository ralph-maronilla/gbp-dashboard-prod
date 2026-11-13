import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E } from "./env";
import { LOCATIONS, USERS } from "./global-setup";
import { loginViaApi } from "./helpers";

const stub = {
  calls: async (): Promise<{ path: string; key: string; body: { cid?: string } }[]> => (await fetch(`${E2E.serperUrl}/calls`)).json(),
  reset: () => fetch(`${E2E.serperUrl}/calls`, { method: "DELETE" }),
};

/** The row for a location in the Extraction page's locations table. */
const row = (page: Page, name: string) => page.getByRole("grid").filter({ hasText: "Last extracted" }).getByRole("row", { name: new RegExp(name) });

async function openExtraction(page: Page) {
  await page.goto("/extraction");
  await expect(page.getByRole("heading", { name: "Extraction", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function extractSelected(page: Page, name: string) {
  // The first checkbox in the row is the grid's row selector (admins also have an Active switch, which is a different control).
  await row(page, name).getByRole("checkbox").first().check();
  // A click made before the page has finished starting up does nothing; retry until the request really goes out.
  await expect(async () => {
    const sent = page.waitForResponse((r) => r.url().endsWith("/api/extract") && r.request().method() === "POST", { timeout: 8_000 });
    await page.getByRole("button", { name: /Extract selected \(1\)/ }).click();
    await sent;
  }).toPass({ timeout: 40_000 });
}

test.describe("admin: add locations and extract", () => {
  test("adds a location by its Maps ID, skips it when pasted again, extracts it from the (stubbed) source, and does not duplicate on a second run", async ({ page }) => {
    const cid = "1000000000000000009";
    await stub.reset();
    await loginViaApi(page, USERS.admin.email);
    await openExtraction(page);

    // Add.
    await page.getByRole("button", { name: "Add locations" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Google Maps links or CIDs/).fill(`Zeta Clinic | ${cid}`);
    await dialog.getByRole("button", { name: /^Add 1 location/ }).click();
    await expect(dialog.getByRole("alert").first()).toContainText(/added|1 location/i);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(row(page, "Zeta Clinic")).toHaveCount(1);
    expect(await stub.calls(), "adding a location is free: nothing is asked of the source").toHaveLength(0);

    // Pasting the same place again adds nothing.
    await page.getByRole("button", { name: "Add locations" }).click();
    await page.getByRole("dialog").getByLabel(/Google Maps links or CIDs/).fill(`Another Name | ${cid}`);
    await page.getByRole("dialog").getByRole("button", { name: /^Add 1 location/ }).click();
    await expect(page.getByRole("dialog").getByRole("alert").first()).toContainText(/already|skipped|duplicate/i);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(row(page, "Zeta Clinic")).toHaveCount(1);
    await expect(row(page, "Another Name")).toHaveCount(0);

    // Extract it.
    await extractSelected(page, "Zeta Clinic");
    await expect(row(page, "Zeta Clinic")).toContainText(/Up to date\s*3/, { timeout: 30_000 });
    const calls = await stub.calls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.path === "/reviews" && c.body.cid === cid && c.key === "e2e-key")).toBe(true);

    // The reviews are saved with their text, reviewer and reply.
    const { data: list } = await (await page.request.get("/api/locations?pageSize=100")).json();
    const id = (list.rows as { id: string; name: string }[]).find((r) => r.name === "Zeta Clinic")!.id;
    await page.goto(`/locations/${id}`);
    await expect(page.getByText("Long waiting time, we waited two hours.")).toBeVisible();
    await expect(page.getByText("Great doctor and very caring staff.")).toBeVisible();
    await expect(page.getByText("Thank you!")).toBeVisible();

    // Extracting again finds nothing new and does not duplicate.
    await openExtraction(page);
    await extractSelected(page, "Zeta Clinic");
    await expect(page.getByRole("button", { name: /Extract selected/ })).toBeEnabled({ timeout: 30_000 });
    await expect(row(page, "Zeta Clinic")).toContainText(/Up to date\s*3/);
    const after = await (await page.request.get(`/api/locations/${id}`)).json();
    expect(after.data.total_reviews).toBe(3);
  });

  test("the daily credit limits are shown and count what was spent", async ({ page }) => {
    await loginViaApi(page, USERS.admin.email);
    await openExtraction(page);
    await expect(page.getByRole("meter", { name: "Yours" })).toHaveAttribute("aria-valuetext", /^\d+ of 200 credits$/);
    await expect(page.getByRole("meter", { name: "Everyone" })).toHaveCount(0); // only the admin's own credits are shown
  });
});

test.describe("a person an admin allowed to extract", () => {
  test("sees and extracts only their own location", async ({ page }) => {
    await stub.reset();
    await loginViaApi(page, USERS.extractor.email);
    await openExtraction(page);
    await expect(row(page, "Delta Clinic")).toHaveCount(1);
    await expect(row(page, "Alpha Clinic")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Extract all/ })).toBeVisible();

    await extractSelected(page, "Delta Clinic");
    await expect(row(page, "Delta Clinic")).toContainText(/Up to date\s*3/, { timeout: 30_000 });
    expect((await stub.calls()).every((c) => c.body.cid === LOCATIONS.delta.cid)).toBe(true);
    await expect(page.getByRole("meter")).toHaveCount(0); // credit figures are for admins only
  });

  test("cannot extract someone else's location through the API either", async ({ page }) => {
    await stub.reset();
    await loginViaApi(page, USERS.extractor.email);
    const res = await page.request.post("/api/extract", { headers: { Origin: E2E.appUrl }, data: { location_ids: [LOCATIONS.alpha.id] } });
    expect(res.status()).toBe(404);
    expect(await stub.calls(), "nothing was bought from the source").toHaveLength(0);
  });

  test("cannot refresh Google totals for someone else's location, or edit or delete locations", async ({ page }) => {
    await stub.reset();
    await loginViaApi(page, USERS.extractor.email);
    const h = { Origin: E2E.appUrl };
    expect((await page.request.post("/api/admin/locations/google-refresh", { headers: h, data: { location_ids: [LOCATIONS.alpha.id] } })).status()).toBe(404);
    expect(await stub.calls(), "nothing was bought from the source").toHaveLength(0);
    expect((await page.request.patch(`/api/admin/locations/${LOCATIONS.delta.id}`, { headers: h, data: { name: "Renamed" } })).status()).toBe(403);
    expect((await page.request.delete(`/api/admin/locations/${LOCATIONS.delta.id}`, { headers: h, data: {} })).status()).toBe(403);
  });

  test("cannot file a location under a client that is not assigned to them", async ({ page }) => {
    await loginViaApi(page, USERS.extractor.email);
    const res = await page.request.post("/api/admin/locations", { headers: { Origin: E2E.appUrl }, data: { client_name: "A client they do not have", items: [{ input: "1000000000000000078" }] } });
    expect(res.status()).toBe(400);
  });
});

test.describe("a person who is not allowed to extract", () => {
  test("sees no extract buttons, and the API refuses and spends nothing", async ({ page }) => {
    await stub.reset();
    await loginViaApi(page, USERS.viewer.email);
    await openExtraction(page);
    await expect(page.getByRole("button", { name: /Extract (selected|all|these)/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add locations" })).toHaveCount(0);
    const res = await page.request.post("/api/extract", { headers: { Origin: E2E.appUrl }, data: { location_ids: [LOCATIONS.beta.id] } });
    expect(res.status()).toBe(403);
    expect(await stub.calls()).toHaveLength(0);
  });

  test("cannot add locations or refresh Google totals", async ({ page }) => {
    await stub.reset();
    await loginViaApi(page, USERS.viewer.email);
    const h = { Origin: E2E.appUrl };
    expect((await page.request.post("/api/admin/locations", { headers: h, data: { items: [{ input: "1000000000000000077" }] } })).status()).toBe(403);
    expect((await page.request.post("/api/admin/locations/google-refresh", { headers: h, data: {} })).status()).toBe(403);
    expect(await stub.calls()).toHaveLength(0);
  });
});
