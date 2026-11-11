"use client";

import { CountBarChart, RatingLineChart } from "@/components/ui/simple-charts";
import type { Granularity, TrendPoint } from "@/lib/schemas/location-detail";

function bucketLabel(iso: string, granularity: Granularity) {
  const d = new Date(iso);
  return granularity === "month"
    ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TrendChart({ trend, granularity }: { trend: TrendPoint[]; granularity: Granularity }) {
  if (!trend.some((p) => p.avg_rating !== null)) return null;
  return <RatingLineChart labels={trend.map((p) => bucketLabel(p.bucket, granularity))} values={trend.map((p) => p.avg_rating)} fill={0.18} stroke={2.5} />;
}

export function DistributionChart({ distribution }: { distribution: number[] }) {
  if (distribution.every((n) => n === 0)) return null;
  const stars = [5, 4, 3, 2, 1];
  return <CountBarChart horizontal labelWidth={40} radius={6} labels={stars.map((s) => `${s}★`)} values={stars.map((s) => distribution[s - 1] ?? 0)} name="Reviews" />;
}
