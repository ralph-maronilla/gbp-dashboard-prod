"use client";

import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import type { Theme } from "@mui/material/styles";
import { axisSx, CHART_MARGIN } from "@/lib/chart";
import { BRAND, chartAccent } from "@/lib/design-tokens";

/** Bars of one series: vertical by default, horizontal (labels down the side) with `horizontal`. */
export function CountBarChart({
  labels,
  values,
  name,
  color = chartAccent,
  horizontal,
  labelWidth,
  height = 280,
  radius = 2,
  margin = CHART_MARGIN,
}: {
  labels: string[];
  values: number[];
  name: string;
  color?: string;
  horizontal?: boolean;
  labelWidth?: number;
  height?: number;
  radius?: number;
  margin?: typeof CHART_MARGIN;
}) {
  const common = {
    height,
    series: [{ data: values, label: name, color }],
    hideLegend: true as const,
    margin,
    sx: (t: Theme) => ({ ...axisSx(t), "& .MuiBarElement-root": { rx: radius } }),
  };
  return horizontal ? (
    <BarChart {...common} layout="horizontal" yAxis={[{ scaleType: "band", data: labels, width: labelWidth }]} />
  ) : (
    <BarChart {...common} xAxis={[{ scaleType: "band", data: labels }]} />
  );
}

/** Average rating (1–5) over time as a filled line; gaps (null) are bridged. */
export function RatingLineChart({ labels, values, fill = 0.1, stroke = 2 }: { labels: string[]; values: (number | null)[]; fill?: number; stroke?: number }) {
  return (
    <LineChart
      height={280}
      xAxis={[{ scaleType: "point", data: labels }]}
      yAxis={[{ min: 1, max: 5, width: 36 }]}
      series={[
        {
          data: values,
          label: "Average rating",
          connectNulls: true,
          color: chartAccent,
          area: true,
          showMark: false,
          valueFormatter: (v) => (v === null ? "No reviews" : v.toFixed(2)),
        },
      ]}
      hideLegend
      margin={CHART_MARGIN}
      sx={(t) => ({ ...axisSx(t), "& .MuiAreaElement-root": { fillOpacity: fill }, "& .MuiLineElement-root": { strokeWidth: stroke } })}
    />
  );
}

/** Colours of the two compared months: teal and amber stay apart in both themes and for colour-blind viewers. */
export const COMPARE_COLORS = [chartAccent, BRAND.amber] as const;

/** Grouped horizontal bars: one row per label, one bar per series (the compared months). Null values draw no bar. */
export function CompareBarChart({
  labels,
  series,
  labelWidth = 160,
  rowHeight = 40,
}: {
  labels: string[];
  series: { name: string; values: (number | null)[]; color: string; format: (v: number | null) => string }[];
  labelWidth?: number;
  /** Height per label; the chart grows with the number of rows. */
  rowHeight?: number;
}) {
  return (
    <BarChart
      height={Math.max(260, labels.length * rowHeight + 70)}
      layout="horizontal"
      yAxis={[{ scaleType: "band", data: labels, width: labelWidth }]}
      series={series.map((s) => ({ data: s.values, label: s.name, color: s.color, valueFormatter: (v: number | null) => s.format(v) }))}
      margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
      sx={(t) => ({ ...axisSx(t), "& .MuiBarElement-root": { rx: 2 } })}
    />
  );
}
