import { describe, expect, it } from "vitest";
import { isDue, lastRunOnAfterSave, nextRunAt, zonedClock, type AutoSchedule } from "./schedule";

const TZ = "Asia/Manila"; // UTC+8 all year
const at = (iso: string) => new Date(iso);
const base: AutoSchedule = { enabled: true, time: "06:00", lastRunOn: null };

describe("zonedClock", () => {
  it("reads the wall clock in the given zone", () => {
    expect(zonedClock(at("2026-11-11T22:30:00Z"), TZ)).toEqual({ date: "2026-11-12", time: "06:30" });
    expect(zonedClock(at("2026-11-11T15:59:00Z"), TZ)).toEqual({ date: "2026-11-11", time: "23:59" });
  });
});

describe("isDue", () => {
  it("is not due before the chosen time", () => {
    expect(isDue(base, at("2026-11-11T21:30:00Z"), TZ)).toBe(false); // 05:30 Manila
  });
  it("is due at or after the chosen time when today was not claimed", () => {
    expect(isDue(base, at("2026-11-11T22:00:00Z"), TZ)).toBe(true); // 06:00
    expect(isDue(base, at("2026-11-11T22:30:00Z"), TZ)).toBe(true);
  });
  it("is not due once today was claimed, but is due again the next day", () => {
    expect(isDue({ ...base, lastRunOn: "2026-11-12" }, at("2026-11-11T22:30:00Z"), TZ)).toBe(false);
    expect(isDue({ ...base, lastRunOn: "2026-11-11" }, at("2026-11-11T22:30:00Z"), TZ)).toBe(true);
  });
  it("is never due when switched off", () => {
    expect(isDue({ ...base, enabled: false }, at("2026-11-11T22:30:00Z"), TZ)).toBe(false);
  });
});

describe("nextRunAt", () => {
  it("is null when switched off", () => {
    expect(nextRunAt({ ...base, enabled: false }, at("2026-11-11T22:30:00Z"), TZ)).toBeNull();
  });
  it("is now when due", () => {
    const now = at("2026-11-11T22:30:00Z");
    expect(nextRunAt(base, now, TZ)).toEqual(now);
  });
  it("is later today when the time has not come", () => {
    expect(nextRunAt(base, at("2026-11-11T21:30:00Z"), TZ)).toEqual(at("2026-11-11T22:00:00Z"));
  });
  it("is tomorrow once today was claimed", () => {
    expect(nextRunAt({ ...base, lastRunOn: "2026-11-12" }, at("2026-11-11T22:30:00Z"), TZ)).toEqual(at("2026-11-12T22:00:00Z"));
  });
});

describe("lastRunOnAfterSave", () => {
  const now = at("2026-11-11T22:30:00Z"); // 06:30 on 2026-11-12 in Manila
  it("counts a run that already happened today", () => {
    expect(lastRunOnAfterSave("09:00", at("2026-11-11T22:10:00Z"), now, TZ)).toBe("2026-11-12");
  });
  it("starts tomorrow when the time has already passed today", () => {
    expect(lastRunOnAfterSave("06:00", null, now, TZ)).toBe("2026-11-12");
  });
  it("runs today when the time is still ahead", () => {
    expect(lastRunOnAfterSave("07:00", null, now, TZ)).toBeNull();
  });
});
