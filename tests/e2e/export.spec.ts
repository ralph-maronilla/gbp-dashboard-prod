import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { expect, test } from "./fixtures";
import { LOCATIONS, USERS } from "./global-setup";
import { loginViaApi } from "./helpers";

const CX_HEADER = "REFERENCE #,DATETIME (MM/DD/YYYY H:MM),HOSPITAL CLINIC BRANCH (PREFIX),FIRST NAME,MIDDLE NAME,LAST NAME,AGE,LOCATION,GENDER,RATING,COMMENTS";

/** Splits CSV text into rows of cells (handles quoted cells with commas, quotes and line breaks). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

test.describe("CSV export", () => {
  test("an admin downloads every review in the CX Pulse layout, with spreadsheet formulas made harmless", async ({ page }) => {
    await loginViaApi(page, USERS.admin.email);
    await page.goto("/extraction");
    await expect(page.getByText(/^Reviews \(\d+\)/)).toBeVisible();

    await page.getByRole("button", { name: "Export CSV" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("File name").fill("e2e-all");
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^e2e-all.*\.csv$/);
    const text = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "");

    const rows = parseCsv(text).filter((r) => r.length > 1);
    const [header, ...data] = rows;
    expect(header.join(",")).toContain(CX_HEADER);
    expect(data.length).toBeGreaterThanOrEqual(36); // 3 locations x 12 seeded reviews (more if extraction tests ran first)

    // REFERENCE # is a unique 6-digit number.
    const refs = data.map((r) => r[0]);
    expect(refs.every((r) => /^\d{6}$/.test(r))).toBe(true);
    expect(new Set(refs).size).toBe(refs.length);
    // Dates look like 11/06/2026 8:59.
    expect(data[0][1]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}$/);
    // Google reviews have no age or gender.
    expect(data.every((r) => r[6] === "N/A" && r[8] === "N/A")).toBe(true);
    // The comment that starts with "=" is prefixed so a spreadsheet will not run it.
    const comments = data.map((r) => r[10]);
    expect(comments).toContain("'=SUM(1,1) average experience");
    expect(comments.some((c) => c.startsWith("="))).toBe(false);
  });

  test("a person with limited access exports only their rows, from the same screen", async ({ page }) => {
    await loginViaApi(page, USERS.viewer.email);
    await page.goto("/extraction");
    await expect(page.getByText(/^Reviews \(\d+\)/)).toBeVisible();
    await page.getByRole("button", { name: "Export CSV" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("dialog").getByRole("button", { name: "Download" }).click()]);
    const rows = parseCsv(readFileSync((await download.path())!, "utf8").replace(/^﻿/, "")).filter((r) => r.length > 1).slice(1);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r[2] === "BET")).toBe(true);
  });

  test("signed-out visitors cannot download either export", async ({ page }) => {
    expect((await page.request.get("/api/export/reviews")).status()).toBe(401);
    expect((await page.request.get("/api/insights/themes/export")).status()).toBe(401);
  });
});

test.describe("Excel export of the Review Intelligence themes", () => {
  async function exportWorkbook(page: import("@playwright/test").Page) {
    await page.goto("/dashboard");
    await page.getByRole("tab", { name: "Review Intelligence" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export to Excel" }).first().click()]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe("PK"); // a real zip container
    const files = unzipSync(new Uint8Array(bytes));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    return [...workbook.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
  }

  test("an admin gets a Summary tab and one tab per location", async ({ page }) => {
    await loginViaApi(page, USERS.admin.email);
    const sheets = await exportWorkbook(page);
    expect(sheets).toContain("Summary");
    for (const name of [LOCATIONS.alpha.name, LOCATIONS.beta.name, LOCATIONS.gamma.name]) expect(sheets).toContain(name);
  });

  test("a person with limited access gets only their own location's tab", async ({ page }) => {
    await loginViaApi(page, USERS.viewer.email);
    const sheets = await exportWorkbook(page);
    expect(sheets).toContain("Summary");
    expect(sheets).toContain(LOCATIONS.beta.name);
    expect(sheets).not.toContain(LOCATIONS.alpha.name);
    expect(sheets).not.toContain(LOCATIONS.gamma.name);
  });
});
