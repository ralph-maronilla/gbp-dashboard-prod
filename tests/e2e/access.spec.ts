import { expect, test, newContext } from "./fixtures";
import { E2E } from "./env";
import { LOCATIONS, USERS } from "./global-setup";
import { loginViaApi, loginViaForm } from "./helpers";

const NAMES: string[] = Object.values(LOCATIONS).map((l) => l.name);
const originHeaders = { Origin: E2E.appUrl };

/** Opens the Overview once its location list has loaded and returns the location names in the table. */
async function visibleLocationNames(page: import("@playwright/test").Page) {
  const loaded = page.waitForResponse((r) => /\/api\/locations\?/.test(r.url()) && r.request().method() === "GET");
  await page.goto("/");
  expect((await loaded).status()).toBe(200);
  const grid = page.getByRole("grid");
  await expect(page.getByText("Total reviews")).toBeVisible(); // the summary cards render with the same response
  await page.waitForTimeout(400); // let the grid render the rows it just received (it is not shown at all when empty)
  if ((await grid.count()) === 0) return [];
  const found = await Promise.all(NAMES.map(async (n) => ((await grid.getByText(n, { exact: true }).count()) > 0 ? n : null)));
  return found.filter((n): n is string => n !== null);
}

test.describe("who sees which locations", () => {
  test("an admin sees every location", async ({ page }) => {
    await loginViaApi(page, USERS.admin.email);
    expect(await visibleLocationNames(page)).toEqual(NAMES);
    await expect(page.getByText("Total reviews")).toBeVisible();
  });

  test("a manager sees only the location assigned to them", async ({ page }) => {
    await loginViaApi(page, USERS.manager.email);
    expect(await visibleLocationNames(page)).toEqual([LOCATIONS.alpha.name]);
    await expect(page.getByText("1 assigned location")).toBeVisible();
  });

  test("a viewer assigned a client sees that client's locations", async ({ page }) => {
    await loginViaApi(page, USERS.viewer.email);
    expect(await visibleLocationNames(page)).toEqual([LOCATIONS.beta.name]);
  });

  test("an approved person with no assignment sees no locations", async ({ page }) => {
    await loginViaApi(page, USERS.nobody.email);
    expect(await visibleLocationNames(page)).toEqual([]);
  });
});

test.describe("a location you are not assigned to does not exist for you", () => {
  test("the page says no access, and the API answers 404 for the details and the reviews", async ({ page }) => {
    await loginViaApi(page, USERS.manager.email);
    await page.goto(`/locations/${LOCATIONS.gamma.id}`);
    await expect(page.getByText("No access")).toBeVisible();
    await expect(page.getByText("This location doesn't exist or you don't have access to it.")).toBeVisible();

    expect((await page.request.get(`/api/locations/${LOCATIONS.gamma.id}`)).status()).toBe(404);
    expect((await page.request.get(`/api/locations/${LOCATIONS.gamma.id}/reviews`)).status()).toBe(404);
    // Their own location works.
    expect((await page.request.get(`/api/locations/${LOCATIONS.alpha.id}`)).status()).toBe(200);
    await page.goto(`/locations/${LOCATIONS.alpha.id}`);
    await expect(page.getByRole("heading", { name: LOCATIONS.alpha.name })).toBeVisible();
  });

  test("a made-up location id gets the same answer as a real one they cannot see", async ({ page }) => {
    await loginViaApi(page, USERS.manager.email);
    const fake = await page.request.get("/api/locations/00000000-0000-4000-8000-000000000999");
    const hidden = await page.request.get(`/api/locations/${LOCATIONS.gamma.id}`);
    expect(fake.status()).toBe(hidden.status());
    expect(await fake.json()).toEqual(await hidden.json());
  });

  test("a CSV export holds only the rows the person may see", async ({ page }) => {
    await loginViaApi(page, USERS.manager.email);
    const res = await page.request.get("/api/export/reviews");
    expect(res.status()).toBe(200);
    const rows = (await res.text()).trim().split(/\r?\n/).slice(1);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.includes(",ALP,"))).toBe(true);

    // Asking for another location explicitly does not widen what they get.
    const other = await page.request.get(`/api/export/reviews?location_id=${LOCATIONS.gamma.id}`);
    const otherRows = other.status() === 200 ? (await other.text()).trim().split(/\r?\n/).slice(1) : [];
    expect(otherRows.filter((r) => r.includes(",GAM,"))).toHaveLength(0);
  });
});

test.describe("admin-only areas", () => {
  for (const who of ["manager", "viewer"] as const) {
    test(`a ${who} cannot open the Users page or use its API`, async ({ page }) => {
      await loginViaApi(page, USERS[who].email);
      await page.goto("/admin/users");
      await expect(page).toHaveURL(E2E.appUrl + "/");
      expect((await page.request.get("/api/admin/users")).status()).toBe(403);
      const me = await (await page.request.get("/api/me")).json();
      const escalate = await page.request.patch(`/api/admin/users/${me.data.id}`, { headers: originHeaders, data: { action: "set_role", role: "admin" } });
      expect(escalate.status()).toBe(403);
      expect((await (await page.request.get("/api/me")).json()).data.role).toBe(who);
    });
  }

  test("an admin cannot change their own role or approval", async ({ page }) => {
    await loginViaApi(page, USERS.admin.email);
    const me = await (await page.request.get("/api/me")).json();
    const res = await page.request.patch(`/api/admin/users/${me.data.id}`, { headers: originHeaders, data: { action: "set_role", role: "viewer" } });
    expect(res.ok()).toBe(false);
    expect((await (await page.request.get("/api/me")).json()).data.role).toBe("admin");
  });
});

test.describe("an admin grants and removes access", () => {
  test("assigning a client to someone makes its locations appear for them, and removing it takes them away", async ({ page, browser }) => {
    const email = USERS.nobody.email;
    const person = await newContext(browser);
    const personPage = await person.newPage();
    await loginViaForm(personPage, email);
    await expect(personPage).toHaveURL(E2E.appUrl + "/");
    expect(await visibleLocationNames(personPage)).toEqual([]);

    await loginViaApi(page, USERS.admin.email);
    const rowFor = () => page.getByRole("row").filter({ has: page.getByRole("switch", { name: `Manual extraction for ${email}` }) });
    await page.goto("/admin/users");
    await rowFor().getByRole("button", { name: "Assign access" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Clients").click();
    await page.getByRole("option", { name: "Client X" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowFor().getByRole("button", { name: /Edit \(1\)/ })).toBeVisible();

    expect(await visibleLocationNames(personPage)).toEqual([LOCATIONS.beta.name]);

    // Take it away again: they see nothing.
    await rowFor().getByRole("button", { name: /Edit \(1\)/ }).click();
    await dialog.locator(".MuiChip-root", { hasText: "Client X" }).getByTestId("CancelIcon").click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await visibleLocationNames(personPage)).toEqual([]);
    await person.close();
  });
});
