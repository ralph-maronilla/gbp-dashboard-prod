"use client";

import { useTheme } from "@mui/material/styles";
import { CountBarChart, RatingLineChart } from "@/components/ui/simple-charts";
import type { DashboardMonth } from "@/lib/schemas/dashboard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03" → "Mar 26", "2026-Q1" → "Q1 2026", "2026" → "2026" (plain string work, so the browser's time zone can't shift it). */
export function monthLabel(bucket: string): string {
  const [y, part] = bucket.split("-");
  if (!part) return String(y);
  if (part.startsWith("Q")) return `${part} ${y}`;
  return `${MONTHS[Number(part) - 1] ?? part} ${String(y).slice(2)}`;
}

/**
 * The Compare-to buckets, lined up with the period's by position (1st with 1st): the two ranges have different dates, so
 * their labels never match. A side with fewer buckets has gaps (no bar or point) at the end.
 */
export interface CompareMonths {
  monthly: DashboardMonth[];
  /** "Sep 1 – 30, 2026". */
  label: string;
}
/** Bucket positions: the longer of the two sides, so neither loses buckets. */
const slots = (a: DashboardMonth[], b?: DashboardMonth[]) => Array.from({ length: Math.max(a.length, b?.length ?? 0) }, (_, i) => i);
const at = <T,>(list: DashboardMonth[], i: number, pick: (m: DashboardMonth) => T): T | null => (list[i] ? pick(list[i]) : null);
/** Axis label "Oct 26"; with Compare to "Oct 26 / Sep 26" (the period's bucket / the compared one in the same position). */
const labelsOf = (monthly: DashboardMonth[], compare?: CompareMonths) =>
  slots(monthly, compare?.monthly).map((i) => [monthly[i], compare?.monthly[i]].filter((m) => m).map((m) => monthLabel(m!.month)).join(" / "));
const PERIOD = "Period";
const compareName = (c: CompareMonths) => `Compare to (${c.label})`;

export function MonthlyVolumeChart({ monthly, compare }: { monthly: DashboardMonth[]; compare?: CompareMonths }) {
  return (
    <CountBarChart
      labels={labelsOf(monthly, compare)}
      values={slots(monthly, compare?.monthly).map((i) => at(monthly, i, (m) => m.total))}
      name={compare ? PERIOD : "Reviews"}
      compare={compare && { name: compareName(compare), values: slots(monthly, compare.monthly).map((i) => at(compare.monthly, i, (m) => m.total)) }}
    />
  );
}

export function MonthlyRatingChart({ monthly, compare }: { monthly: DashboardMonth[]; compare?: CompareMonths }) {
  if (!monthly.some((m) => m.avg_rating !== null) && !compare?.monthly.some((m) => m.avg_rating !== null)) return null;
  return (
    <RatingLineChart
      labels={labelsOf(monthly, compare)}
      values={slots(monthly, compare?.monthly).map((i) => at(monthly, i, (m) => m.avg_rating))}
      name={compare ? PERIOD : "Average rating"}
      compare={compare && { name: compareName(compare), values: slots(monthly, compare.monthly).map((i) => at(compare.monthly, i, (m) => m.avg_rating)) }}
    />
  );
}

export function LowRatingChart({ monthly, compare }: { monthly: DashboardMonth[]; compare?: CompareMonths }) {
  const t = useTheme();
  return (
    <CountBarChart
      labels={labelsOf(monthly, compare)}
      values={slots(monthly, compare?.monthly).map((i) => at(monthly, i, (m) => m.low))}
      name={compare ? PERIOD : "1-2 star reviews"}
      color={t.palette.error.main}
      compare={compare && { name: compareName(compare), values: slots(monthly, compare.monthly).map((i) => at(compare.monthly, i, (m) => m.low)), color: t.palette.warning.main }}
    />
  );
}
