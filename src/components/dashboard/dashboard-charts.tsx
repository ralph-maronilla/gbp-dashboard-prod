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

export function MonthlyVolumeChart({ monthly }: { monthly: DashboardMonth[] }) {
  return <CountBarChart labels={monthly.map((m) => monthLabel(m.month))} values={monthly.map((m) => m.total)} name="Reviews" />;
}

export function MonthlyRatingChart({ monthly }: { monthly: DashboardMonth[] }) {
  if (!monthly.some((m) => m.avg_rating !== null)) return null;
  return <RatingLineChart labels={monthly.map((m) => monthLabel(m.month))} values={monthly.map((m) => m.avg_rating)} />;
}

export function LowRatingChart({ monthly }: { monthly: DashboardMonth[] }) {
  const t = useTheme();
  return <CountBarChart labels={monthly.map((m) => monthLabel(m.month))} values={monthly.map((m) => m.low)} name="1-2 star reviews" color={t.palette.error.main} />;
}
