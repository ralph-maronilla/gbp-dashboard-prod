import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { E2E } from "./env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Waits for an email to `to` whose subject matches, and returns it. The app writes its (development) emails to a file. */
export async function waitForMail(to: string, subject: RegExp, after = 0): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(
      () => {
        const lines = readFileSync(E2E.outboxFile, "utf8").split("\n").filter(Boolean).slice(after);
        found = lines.map((l) => JSON.parse(l) as Mail).reverse().find((m) => m.to === to && subject.test(m.subject));
        return Boolean(found);
      },
      { message: `an email to ${to} matching ${subject}`, timeout: 20_000 },
    )
    .toBe(true);
  return found!;
}

export const mailCount = () => readFileSync(E2E.outboxFile, "utf8").split("\n").filter(Boolean).length;

export const linkIn = (mail: Mail) => mail.text.match(/https?:\/\/\S+/)![0];

/** Signs in through the real form. */
export async function loginViaForm(page: Page, email: string, password: string = E2E.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Signs in as a seeded person without going through the sign-in form: reuses the session cookie saved once during global
 * setup. For tests that are not about signing in (which would otherwise spend the per-email sign-in limit).
 */
export async function loginViaApi(page: Page, email: string) {
  const cookies = JSON.parse(readFileSync(path.join(E2E.sessionsDir, `${email}.json`), "utf8"));
  await page.context().addCookies(cookies);
}
