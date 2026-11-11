import { describe, expect, it } from "vitest";
import { formatRelative } from "./format";

const NOW = Date.parse("2026-11-11T12:00:00Z");

describe("formatRelative", () => {
  it("returns 'never' for a missing date", () => {
    expect(formatRelative(null, NOW)).toBe("never");
    expect(formatRelative(undefined, NOW)).toBe("never");
  });

  it("returns 'just now' under a minute", () => {
    expect(formatRelative("2026-11-11T11:59:30Z", NOW)).toBe("just now");
  });

  it("uses the largest fitting unit", () => {
    expect(formatRelative("2026-11-11T11:55:00Z", NOW)).toBe("5 minutes ago");
    expect(formatRelative("2026-11-11T09:00:00Z", NOW)).toBe("3 hours ago");
    expect(formatRelative("2026-11-10T12:00:00Z", NOW)).toBe("yesterday");
    expect(formatRelative("2026-11-01T12:00:00Z", NOW)).toBe("10 days ago");
  });
});
