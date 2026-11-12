"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { COMPARE_COLORS, CompareBarChart } from "@/components/ui/simple-charts";
import { ToggleSelect } from "@/components/ui/toggle-select";
import { changeOf, formatValue, MEASURES, valueOf, type Change, type Measure } from "@/lib/insights/compare";
import { HELP } from "@/lib/insights/help";
import { COMPARE } from "@/lib/insights/signals";
import type { CompareInsights, CompareLocation } from "@/lib/schemas/insights";
import { LabelWithTip } from "./info-tip";
import { SectionCard } from "./section-card";
import { ChangeText } from "./change-text";

const MEASURE_HELP: Record<Measure, string> = { reviews: HELP.compareReviews, rating: HELP.compareRating, reply: HELP.compareReply, low: HELP.compareLow };
const MEASURE_OPTIONS = MEASURES.map((m) => ({ value: m.key, label: m.short }));
const shortName = (name: string) => name.replace(/^Healthway\s*-?\s*/i, "");

function ChangeCard({ measure, data }: { measure: (typeof MEASURES)[number]; data: CompareInsights }) {
  const [a, b] = [data.network.a, data.network.b];
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography variant="caption" color="text.secondary" component="div">
        <LabelWithTip label={measure.label} text={MEASURE_HELP[measure.key]} />
      </Typography>
      <Typography variant="h4" sx={{ lineHeight: 1.2, mt: 1 }}>
        {formatValue(measure.key, valueOf(a, measure.key))}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        vs {formatValue(measure.key, valueOf(b, measure.key))} in {data.b.label}
      </Typography>
      <ChangeText change={changeOf(measure.key, a, b)} />
    </Paper>
  );
}

/**
 * Two date ranges side by side, under the Review Overview when "Compare" is ticked (the ranges are picked in
 * the Dashboard filters): network cards, a per-location bar chart for one measure, and a table of all four.
 */
export function CompareSection({ data }: { data: CompareInsights }) {
  const [measure, setMeasure] = useState<Measure>("reviews");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });

  const rows = useMemo(() => {
    const withChanges = data.locations.map((l) => ({ ...l, changes: Object.fromEntries(MEASURES.map((m) => [m.key, changeOf(m.key, l.a, l.b)])) as Record<Measure, Change> }));
    const dir = sort.dir === "asc" ? 1 : -1;
    return withChanges.sort((x, y) => {
      if (sort.key === "name") return dir * x.name.localeCompare(y.name);
      const [dx, dy] = [x.changes[sort.key as Measure].delta, y.changes[sort.key as Measure].delta];
      if (dx === null || dy === null) return dx === dy ? x.name.localeCompare(y.name) : dx === null ? 1 : -1; // no change value: last
      return dir * (dx - dy) || x.name.localeCompare(y.name);
    });
  }, [data.locations, sort]);

  // Chart rows: largest figure in the first range first, locations without one last.
  const chartRows = useMemo(
    () => [...data.locations].sort((x, y) => (valueOf(y.a, measure) ?? -1) - (valueOf(x.a, measure) ?? -1) || x.name.localeCompare(y.name)),
    [data.locations, measure],
  );

  const measureColumn = (m: (typeof MEASURES)[number]): Column<(typeof rows)[number]> => ({
    key: m.key,
    label: m.short,
    info: MEASURE_HELP[m.key],
    align: "right",
    cell: (l) => (
      <>
        <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
          {formatValue(m.key, valueOf(l.a, m.key))}
        </Typography>
        <Typography component="span" variant="caption" color="text.secondary">
          {" "}
          vs {formatValue(m.key, valueOf(l.b, m.key))}
        </Typography>
        <div>
          <ChangeText change={l.changes[m.key]} />
        </div>
      </>
    ),
  });
  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "name",
      label: "Location",
      cell: (l: CompareLocation) => (
        <MuiLink component={Link} href={`/locations/${l.id}`} underline="hover" color="inherit">
          {l.name}
        </MuiLink>
      ),
    },
    ...MEASURES.map(measureColumn),
  ];

  const empty = data.network.a.reviews === 0 && data.network.b.reviews === 0;
  const partial = [data.a, data.b].filter((r) => r.partial).map((r) => r.label);
  const unequal = data.a.days !== data.b.days;
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <Typography variant="h6" component="h2">
          <LabelWithTip label={`Comparison: ${data.a.label} vs ${data.b.label}`} text={HELP.compareMonths} />
        </Typography>
        {partial.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {partial.join(" and ")} {partial.length === 1 ? "includes" : "include"} today, which is not finished, so review volume is not fully comparable. Ratings and rates still are.
          </Typography>
        )}
        {unequal && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            The ranges have different lengths ({days(data.a.days)} vs {days(data.b.days)}), so review volume is not directly comparable. Ratings and rates still are.
          </Typography>
        )}
      </Grid>

      {MEASURES.map((m) => (
        <Grid key={m.key} size={{ xs: 12, sm: 6, md: 3 }}>
          <ChangeCard measure={m} data={data} />
        </Grid>
      ))}

      {empty ? (
        <Grid size={12}>
          <Typography color="text.secondary">No reviews in either range for these filters. Pick other dates or widen the filters.</Typography>
        </Grid>
      ) : (
        <>
          <Grid size={12}>
            <SectionCard title="Locations compared" info={HELP.compareChart} action={<ToggleSelect label="Measure" value={measure} options={MEASURE_OPTIONS} onChange={setMeasure} />}>
              <CompareBarChart
                labels={chartRows.map((l) => shortName(l.name))}
                series={[
                  { name: data.a.label, color: COMPARE_COLORS[0], values: chartRows.map((l) => valueOf(l.a, measure)), format: (v) => formatValue(measure, v) },
                  { name: data.b.label, color: COMPARE_COLORS[1], values: chartRows.map((l) => valueOf(l.b, measure)), format: (v) => formatValue(measure, v) },
                ]}
              />
            </SectionCard>
          </Grid>
          <Grid size={12}>
            <SectionCard title="All locations" info={HELP.compareTable}>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(l) => l.id}
                hover
                sort={sort}
                sortable={["name", ...MEASURES.map((m) => m.key)]}
                onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc" }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Each cell shows {data.a.label}, then {data.b.label} after “vs”, then the change. A change shows - when a location has fewer than {COMPARE.MIN_REVIEWS} reviews in either
                range. Click a heading to sort by change.
              </Typography>
            </SectionCard>
          </Grid>
        </>
      )}
    </Grid>
  );
}
