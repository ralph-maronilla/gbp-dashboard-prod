import { describe, expect, it } from "vitest";
import { ACTIVE_WINDOW_MS, HEARTBEAT_MS, IDLE_LIMIT_MS, IDLE_WARNING_MS, idleState, isActive, pageLabel } from "./presence";

const MIN = 60_000;
const NOW = Date.parse("2026-11-11T12:00:00Z");

describe("isActive", () => {
  it("is active within the heartbeat plus five minutes", () => {
    expect(ACTIVE_WINDOW_MS).toBe(HEARTBEAT_MS + 5 * MIN);
    expect(isActive(new Date(NOW - 64 * MIN).toISOString(), NOW)).toBe(true);
    expect(isActive(new Date(NOW - 66 * MIN).toISOString(), NOW)).toBe(false);
  });
  it("is not active without a last-seen time", () => {
    expect(isActive(null, NOW)).toBe(false);
    expect(isActive(undefined, NOW)).toBe(false);
  });
});

describe("pageLabel", () => {
  it.each([
    ["/", "Overview"],
    ["/dashboard?tab=compare", "Dashboard"],
    ["/locations/abc", "Locations"],
    ["/extraction", "Extraction"],
    ["/admin/users", "Users"],
    ["/something-else", "App"],
    [null, ""],
    [undefined, ""],
  ])("%s -> %s", (path, label) => {
    expect(pageLabel(path)).toBe(label);
  });
});

describe("idleState", () => {
  it("signs out after 60 minutes with a warning 5 minutes before", () => {
    expect(IDLE_LIMIT_MS).toBe(60 * MIN);
    expect(IDLE_WARNING_MS).toBe(55 * MIN);
    expect(idleState(NOW - 54 * MIN, NOW)).toBe("active");
    expect(idleState(NOW - 55 * MIN, NOW)).toBe("warn");
    expect(idleState(NOW - 59 * MIN, NOW)).toBe("warn");
    expect(idleState(NOW - 60 * MIN, NOW)).toBe("expired");
  });
});
