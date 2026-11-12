import { expect, test } from "@playwright/test"; // the plain test: this one is about the tour, so it is not switched off
import { E2E } from "./env";
import { USERS } from "./global-setup";
import { loginViaApi } from "./helpers";

test.describe("guided tour", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "X-Real-IP": "203.0.113.150" });
  });

  test("starts on a person's first visit, can be skipped, and does not come back", async ({ page }) => {
    await loginViaApi(page, USERS.nobody.email);
    await page.goto("/");
    const tour = page.getByRole("dialog");
    await expect(tour).toBeVisible();
    await expect(tour.getByRole("button", { name: "Skip tour" })).toBeVisible();
    await expect(tour.getByRole("button", { name: "Next" })).toBeVisible();
    await tour.getByRole("button", { name: "Next" }).click();
    await tour.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible(); // the app has loaded
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500); // a tour that was going to start would have by now
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the user guide page explains the screens for the signed-in role", async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k: string) {
        return k.startsWith("tour-done:") ? "e2e" : original.call(this, k);
      };
    });
    await loginViaApi(page, USERS.viewer.email);
    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: /guide/i }).first()).toBeVisible();
    await expect(page).toHaveURL(E2E.appUrl + "/guide");
  });
});
