import { test as base, type Browser, type BrowserContext } from "@playwright/test";

/** The guided tour starts by itself on a user's first visit and covers the page. Tests that are not about it mark it as seen. */
const markTourSeen = (context: BrowserContext) =>
  context.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      return key.startsWith("tour-done:") ? "e2e" : original.call(this, key);
    };
  });

/**
 * Every browser context presents its own client address (the header Caddy sets in production), so the sign-in rate limit,
 * which is per address, does not trip just because the whole suite runs from one machine. Tests of the limit itself use a fixed one.
 */
let nextIp = 10;
export const uniqueIp = () => `198.51.100.${(nextIp++ % 240) + 10}`;

export const test = base.extend({
  context: async ({ context }, run) => {
    await markTourSeen(context);
    await context.setExtraHTTPHeaders({ "X-Real-IP": uniqueIp() });
    await run(context);
  },
});

/** A second signed-in person in the same test (another browser profile), with the tour out of the way. */
export async function newContext(browser: Browser, opts: { tour?: boolean } = {}) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Real-IP": uniqueIp() } });
  if (!opts.tour) await markTourSeen(ctx);
  return ctx;
}

export { expect } from "@playwright/test";
