import { describe, expect, it } from "vitest";
import {
  activitySignal, attentionLevel, commendationSignal, issueLevel, ratingSignal, responseSpeed, responseStatus, themeSignal,
} from "./signals";

const label = (s: { label: string }) => s.label;

describe("ratingSignal", () => {
  it.each([
    [null, "No data"],
    [5, "Strong"],
    [4.5, "Strong"],
    [4.49, "Stable"],
    [4.0, "Stable"],
    [3.99, "Watch"],
    [3.0, "Watch"],
    [2.99, "Priority"],
  ])("%s -> %s", (avg, expected) => {
    expect(label(ratingSignal(avg))).toBe(expected);
  });
});

describe("themeSignal and issueLevel", () => {
  it.each([
    [null, "No data", "-"],
    [9.9, "Strength", "Low"],
    [10, "Watch", "Moderate"],
    [24.9, "Watch", "Moderate"],
    [25, "Priority", "High"],
  ])("%s%% negative -> %s / %s", (pct, theme, level) => {
    expect(label(themeSignal(pct))).toBe(theme);
    expect(label(issueLevel(pct))).toBe(level);
  });
});

describe("commendationSignal", () => {
  it.each([[null, "No data"], [80, "Strength"], [79, "Stable"], [60, "Stable"], [59, "Watch"]])("%s%% -> %s", (pct, expected) => {
    expect(label(commendationSignal(pct))).toBe(expected);
  });
});

describe("activity, replies and speed", () => {
  it("rates reviews per location per month", () => {
    expect(label(activitySignal(20))).toBe("High");
    expect(label(activitySignal(5))).toBe("Moderate");
    expect(label(activitySignal(4.9))).toBe("Low");
  });
  it("rates the reply share", () => {
    expect(label(responseStatus(80))).toBe("On Track");
    expect(label(responseStatus(50))).toBe("Needs Attention");
    expect(label(responseStatus(49))).toBe("Off Track");
  });
  it("rates the median days to reply", () => {
    expect(label(responseSpeed(7))).toBe("On Track");
    expect(label(responseSpeed(21))).toBe("Needs Attention");
    expect(label(responseSpeed(22))).toBe("Slow");
    expect(label(responseSpeed(null))).toBe("No data");
  });
});

describe("attentionLevel", () => {
  it("is High above 10%, Watch from 5%, otherwise Low (also when unknown)", () => {
    expect(label(attentionLevel(10.1))).toBe("High");
    expect(label(attentionLevel(10))).toBe("Watch");
    expect(label(attentionLevel(5))).toBe("Watch");
    expect(label(attentionLevel(4.9))).toBe("Low");
    expect(label(attentionLevel(null))).toBe("Low");
  });
});
