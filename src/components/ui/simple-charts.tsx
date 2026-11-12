"use client";

import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import type { Theme } from "@mui/material/styles";
import { axisSx, CHART_MARGIN } from "@/lib/chart";
import { chartAccent, chartCompare } from "@/lib/design-tokens";

/** A second series drawn against the first (Dashboard Compare to): same positions, its own name and colour. */
export interface CompareSeries {
  name: string;
  values: (number | null)[];
  color?: string;
}

/**
 * Bars of one series: vertical by default, horizontal (labels down the side) with `horizontal`. With `compare`, a second
 * bar per label and a legend.
 */
export function CountBarChart({
  labels,
  values,
  name,
  compare,
  color = chartAccent,
  horizontal,
  labelWidth,
  height = 280,
  radius = 2,
  margin = CHART_MARGIN,
}: {
  labels: string[];
  values: (number | null)[];
  name: string;
  compare?: CompareSeries;
  color?: string;
  horizontal?: boolean;
  labelWidth?: number;
  height?: number;
  radius?: number;
  margin?: typeof CHART_MARGIN;
}) {
  const common = {
    height,
    series: [
      { data: values, label: name, color },
      ...(compare ? [{ data: compare.values, label: compare.name, color: compare.color ?? COMPARE_COLORS[1] }] : []),
    ],
    hideLegend: !compare,
    margin,
    sx: (t: Theme) => ({ ...axisSx(t), "& .MuiBarElement-root": { rx: radius } }),
  };
  return horizontal ? (
    <BarChart {...common} layout="horizontal" yAxis={[{ scaleType: "band", data: labels, width: labelWidth }]} />
  ) : (
    <BarChart {...common} xAxis={[{ scaleType: "band", data: labels }]} />
  );
}

/** Average rating (1–5) over time as a filled line; gaps (null) are bridged. `compare` adds a dashed line and a legend. */
export function RatingLineChart({
  labels,
  values,
  compare,
  name = "Average rating",
  fill = 0.1,
  stroke = 2,
}: {
  labels: string[];
  values: (number | null)[];
  compare?: CompareSeries;
  name?: string;
  fill?: number;
  stroke?: number;
}) {
  const format = (v: number | null) => (v === null ? "No reviews" : v.toFixed(2));
  return (
    <LineChart
      height={280}
      xAxis={[{ scaleType: "point", data: labels }]}
      yAxis={[{ min: 1, max: 5, width: 36 }]}
      series={[
        { id: "a", data: values, label: name, connectNulls: true, color: chartAccent, area: !compare, showMark: false, valueFormatter: format },
        ...(compare
          ? [{ id: "b", data: compare.values, label: compare.name, connectNulls: true, color: compare.color ?? COMPARE_COLORS[1], showMark: false, valueFormatter: format }]
          : []),
      ]}
      hideLegend={!compare}
      margin={CHART_MARGIN}
      sx={(t) => ({
        ...axisSx(t),
        // Class names of MUI X Charts 9 (MuiLineChart-*) and older (Mui*Element-root).
        "& .MuiAreaElement-root, & .MuiLineChart-area": { fillOpacity: fill },
        "& .MuiLineElement-root, & .MuiLineChart-line": { strokeWidth: stroke },
        "& [data-series=\"b\"].MuiLineChart-line, & [data-series=\"b\"].MuiLineElement-root": { strokeDasharray: "6 4" },
      })}
    />
  );
}

/** Colours of the two compared months: teal and the primary blue. */
export const COMPARE_COLORS = [chartAccent, chartCompare] as const;

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
