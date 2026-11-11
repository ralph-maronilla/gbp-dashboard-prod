/**
 * Signal rules for the Dashboard, calibrated to the Healthway sample dashboard (David & Golyat):
 * 4.9 / 4.7 Strong, 4.2 Stable, 3.6 / 3.0 Watch, 2.8 / 1.6 Priority; theme negatives 6-9% Strength, 13-19% Watch,
 * 35-50% Priority. Kept in one place so every tab uses the same thresholds (the Dashboard's help tooltips in
 * lib/insights/help.ts read the same constants).
 */

export type Tone = "success" | "info" | "warning" | "error" | "neutral";
export interface Signal {
  label: string;
  tone: Tone;
}

/** Average stars: Strong at or above STRONG, Stable at or above STABLE, Watch at or above WATCH, else Priority. */
export const RATING = { STRONG: 4.5, STABLE: 4.0, WATCH: 3.0 } as const;
/** Share (%) of a theme's mentions that are negative (lib/insights/sentiment.ts): Watch / High from WATCH, Priority / High from PRIORITY. */
export const THEME_NEGATIVE = { WATCH: 10, PRIORITY: 25 } as const;
/** Share (%) of Positive Commendations mentions that are positive. */
export const COMMENDATION = { STRENGTH: 80, STABLE: 60 } as const;
/** Reviews per location per month. */
export const ACTIVITY = { HIGH: 20, MODERATE: 5 } as const;
/** Share (%) of reviews with an owner reply. */
export const REPLY = { GOOD: 80, FAIR: 50 } as const;
/** Median days from review to owner reply. */
export const SPEED_DAYS = { ON_TRACK: 7, NEEDS_ATTENTION: 21 } as const;
/** Share (%) of 1-2 star reviews in the last 30 days: High above HIGH, Watch from WATCH. */
export const ATTENTION = { HIGH: 10, WATCH: 5 } as const;
/** Measured replies needed before the measured median replaces the approximate one. */
export const MIN_MEASURED_REPLIES = 20;
/** Days of daily collection the measured replies must span before they replace the approximate median. */
export const MIN_MEASURED_SPAN_DAYS = 30;
/** Themes with too few mentions are not ranked as drivers (one angry review is not a pattern). */
export const MIN_DRIVER_MENTIONS = 10;
/** Month comparison: a location needs at least MIN_REVIEWS reviews in both months before its change is shown. */
export const COMPARE = { MIN_REVIEWS: 5 } as const;
/**
 * Recommended Actions name the locations where a flagged theme is worst: at least MIN_MENTIONS mentions there, more
 * negative than the theme overall and than THEME_NEGATIVE.WATCH, and at most MAX_SHOWN of them by name.
 */
export const HOTSPOT = { MIN_MENTIONS: 8, MAX_SHOWN: 3 } as const;
/**
 * Smallest change from the previous period that the Reputation highlights mention, and the reviews (per group, both
 * periods) or mentions (per theme, both periods) needed before a group or theme is compared at all.
 */
export const CHANGE = {
  NETWORK_STARS: 0.05,
  GROUP_STARS: 0.2,
  REPLY_POINTS: 5,
  SPEED_DAYS: 1,
  THEME_POINTS: 5,
  COMMEND_POINTS: 3,
  MIN_GROUP_REVIEWS: 10,
  MIN_THEME_MENTIONS: 20,
} as const;

const s = (label: string, tone: Tone): Signal => ({ label, tone });
export const NO_DATA = s("No data", "neutral");

/** Average star rating of a location or group. */
export function ratingSignal(avg: number | null): Signal {
  if (avg === null) return NO_DATA;
  if (avg >= RATING.STRONG) return s("Strong", "success");
  if (avg >= RATING.STABLE) return s("Stable", "info");
  if (avg >= RATING.WATCH) return s("Watch", "warning");
  return s("Priority", "error");
}

/** Issue theme by the share (0-100) of its mentions that are negative. */
export function themeSignal(negativePct: number | null): Signal {
  if (negativePct === null) return NO_DATA;
  if (negativePct < THEME_NEGATIVE.WATCH) return s("Strength", "success");
  if (negativePct < THEME_NEGATIVE.PRIORITY) return s("Watch", "warning");
  return s("Priority", "error");
}

/** Positive Commendations by the share (0-100) of its mentions that are positive. */
export function commendationSignal(positivePct: number | null): Signal {
  if (positivePct === null) return NO_DATA;
  if (positivePct >= COMMENDATION.STRENGTH) return s("Strength", "success");
  if (positivePct >= COMMENDATION.STABLE) return s("Stable", "info");
  return s("Watch", "warning");
}

/** Heatmap cell for an issue theme: how negative its mentions are in that group. */
export function issueLevel(negativePct: number | null): Signal {
  if (negativePct === null) return s("-", "neutral");
  if (negativePct >= THEME_NEGATIVE.PRIORITY) return s("High", "error");
  if (negativePct >= THEME_NEGATIVE.WATCH) return s("Moderate", "warning");
  return s("Low", "success");
}

/** Reviews per location per month. */
export function activitySignal(perLocationPerMonth: number | null): Signal {
  if (perLocationPerMonth === null) return NO_DATA;
  if (perLocationPerMonth >= ACTIVITY.HIGH) return s("High", "success");
  if (perLocationPerMonth >= ACTIVITY.MODERATE) return s("Moderate", "warning");
  return s("Low", "error");
}

/** Share (0-100) of reviews with an owner reply. */
export function responseStatus(replyPct: number | null): Signal {
  if (replyPct === null) return NO_DATA;
  if (replyPct >= REPLY.GOOD) return s("On Track", "success");
  if (replyPct >= REPLY.FAIR) return s("Needs Attention", "warning");
  return s("Off Track", "error");
}

export function responseCoverage(replyPct: number | null): Signal {
  if (replyPct === null) return NO_DATA;
  if (replyPct >= REPLY.GOOD) return s("High", "success");
  if (replyPct >= REPLY.FAIR) return s("Moderate", "warning");
  return s("Low", "error");
}

/** Median days from review to owner reply (approximate: Serper gives reply dates as "3 weeks ago"). */
export function responseSpeed(medianDays: number | null): Signal {
  if (medianDays === null) return NO_DATA;
  if (medianDays <= SPEED_DAYS.ON_TRACK) return s("On Track", "success");
  if (medianDays <= SPEED_DAYS.NEEDS_ATTENTION) return s("Needs Attention", "warning");
  return s("Slow", "error");
}

/** Share (0-100) of 1-2 star reviews in the last 30 days. */
export function attentionLevel(lowPct: number | null): Signal {
  if (lowPct === null) return s("Low", "success");
  if (lowPct > ATTENTION.HIGH) return s("High", "error");
  if (lowPct >= ATTENTION.WATCH) return s("Watch", "warning");
  return s("Low", "success");
}
