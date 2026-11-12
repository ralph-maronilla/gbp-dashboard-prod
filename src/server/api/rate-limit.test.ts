import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowRequest, clientIp } from "./rate-limit";

let n = 0;
const rule = (limit: number, windowSec = 60) => ({ key: `t${++n}`, limit, windowSec });

describe("allowRequest", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit, then refuses", async () => {
    const r = rule(3);
    expect(await allowRequest(r, "a")).toBe(true);
    expect(await allowRequest(r, "a")).toBe(true);
    expect(await allowRequest(r, "a")).toBe(true);
    expect(await allowRequest(r, "a")).toBe(false);
    expect(await allowRequest(r, "a")).toBe(false);
  });

  it("counts each identity separately", async () => {
    const r = rule(1);
    expect(await allowRequest(r, "ip-1")).toBe(true);
    expect(await allowRequest(r, "ip-1")).toBe(false);
    expect(await allowRequest(r, "ip-2")).toBe(true);
  });

  it("counts each rule separately, even for the same identity", async () => {
    const a = rule(1);
    const b = rule(1);
    expect(await allowRequest(a, "x")).toBe(true);
    expect(await allowRequest(a, "x")).toBe(false);
    expect(await allowRequest(b, "x")).toBe(true);
  });

  it("allows requests again once the window has passed", async () => {
    const r = rule(2, 60);
    await allowRequest(r, "a");
    await allowRequest(r, "a");
    expect(await allowRequest(r, "a")).toBe(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await allowRequest(r, "a")).toBe(true);
  });

  it("treats a rule with the same key but a different limit as a different limiter", async () => {
    expect(await allowRequest({ key: "same", limit: 1, windowSec: 60 }, "a")).toBe(true);
    expect(await allowRequest({ key: "same", limit: 5, windowSec: 60 }, "a")).toBe(true);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x.test", { headers });
  afterEach(() => vi.unstubAllEnvs());

  it("uses X-Real-IP, the header the reverse proxy sets", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("in production ignores a client-supplied X-Forwarded-For", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6" }))).toBe("unknown");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("in development falls back to X-Forwarded-For", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(clientIp(req({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }))).toBe("10.0.0.1");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
