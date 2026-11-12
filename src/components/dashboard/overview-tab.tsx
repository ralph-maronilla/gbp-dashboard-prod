"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { KpiCard } from "@/components/kpi-card";
import { DataTable, type Column, type SortState } from "@/components/ui/data-table";
import { CountBarChart } from "@/components/ui/simple-charts";
import { ToggleSelect } from "@/components/ui/toggle-select";
import { HELP, overviewKpiHelp, ratingRule } from "@/lib/insights/help";
import { changeBetween, enoughReviews } from "@/lib/insights/compare";
import type { LocationPerformance, OverviewInsights, WithCompare } from "@/lib/schemas/insights";
import { VsChange } from "./change-text";
import { BulletList, SectionCard } from "./section-card";
import { SignalText } from "./signal";

type SortKey = "name" | "avg_rating" | "reviews";
type Shown = LocationPerformance & { fromGoogle: boolean };

export type OverviewSource = "google" | "extracted";

export function OverviewTab({ data, source, onSource }: { data: WithCompare<OverviewInsights>; source: OverviewSource; onSource: (s: OverviewSource) => void }) {
  const [sort, setSort] = useState<SortState & { key: SortKey }>({ key: "reviews", dir: "desc" });
  const google = source === "google";
  // In the Google view, refreshed locations show Google's public figures; the rest keep their extracted figures (marked).
  const shown = useMemo<Shown[]>(
    () =>
      data.locations.map((l) =>
        google && l.google_checked_at ? { ...l, reviews: l.google_reviews ?? 0, avg_rating: l.google_rating, signal: l.google_signal, fromGoogle: true } : { ...l, fromGoogle: false },
      ),
    [data.locations, google],
  );
  const totals = google ? data.google : data;
  // Compare to: extracted figures only (Google totals have no dates).
  const b = google ? null : (data.compare?.data ?? null);
  const bLoc = useMemo(() => new Map((b?.locations ?? []).map((l) => [l.id, l])), [b]);
  const stars = (v: number | null) => (v === null ? "-" : `${v.toFixed(2)}★`);
  const kpiHelp = overviewKpiHelp(source);
  const readout = google ? data.google.readout : data.readout;
  const rows = useMemo(() => {
    const val = (l: LocationPerformance) => (sort.key === "name" ? l.name : sort.key === "avg_rating" ? (l.avg_rating ?? -1) : l.reviews);
    return [...shown].sort((a, b) => {
      const c = typeof val(a) === "string" ? String(val(a)).localeCompare(String(val(b))) : (val(a) as number) - (val(b) as number);
      return sort.dir === "asc" ? c : -c;
    });
  }, [shown, sort]);
  const top = [...shown].filter((l) => l.reviews > 0).sort((a, b) => b.reviews - a.reviews).slice(0, 5).reverse();
  const columns: Column<Shown>[] = [
    {
      key: "name",
      label: "Location",
      cellSx: { maxWidth: 320 },
      cell: (l) => (
        <>
          <MuiLink component={Link} href={`/locations/${l.id}`} underline="hover" color="inherit">
            {l.name}
          </MuiLink>
          {google && !l.fromGoogle && (
            <Tooltip title="No Google totals yet: extracted figures for the selected period">
              <span> *</span>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      key: "avg_rating",
      label: "Rating",
      info: HELP.locationRating,
      align: "right",
      cellSx: { fontWeight: 600 },
      // Same precision as the signal: Google gives one decimal, our averages two (4.47 is Stable, not "4.5").
      cell: (l) => {
        const was = bLoc.get(l.id);
        return (
          <>
            {l.avg_rating === null ? "-" : l.avg_rating.toFixed(l.fromGoogle ? 1 : 2)}
            {was && (
              <Typography component="div" variant="caption" sx={{ fontWeight: 400, display: "flex", justifyContent: "flex-end" }}>
                <VsChange block={false} change={changeBetween("stars", "up", l.avg_rating, was.avg_rating, enoughReviews(l.reviews, was.reviews))} was={stars(was.avg_rating)} />
              </Typography>
            )}
          </>
        );
      },
    },
    {
      key: "reviews",
      label: "Reviews",
      info: kpiHelp.total_reviews,
      align: "right",
      cell: (l) => {
        const was = bLoc.get(l.id);
        return (
          <>
            {l.reviews.toLocaleString()}
            {was && (
              <Typography component="div" variant="caption" sx={{ display: "flex", justifyContent: "flex-end" }}>
                <VsChange volume block={false} change={changeBetween("count", "up", l.reviews, was.reviews)} was={was.reviews.toLocaleString()} />
              </Typography>
            )}
          </>
        );
      },
    },
    {
      key: "signal",
      label: "Signal",
      info: HELP.locationSignal,
      cell: (l) =>
        l.extraction === "never" && !l.fromGoogle ? (
          <Chip size="small" variant="outlined" label="Not extracted" />
        ) : (
          <>
            <SignalText signal={l.signal} />
            {l.extraction === "partial" && !l.fromGoogle && (
              <Tooltip title="Extraction has not finished; figures are incomplete">
                <Chip size="small" variant="outlined" color="warning" label="Incomplete" sx={{ ml: 1 }} />
              </Tooltip>
            )}
          </>
        ),
    },
  ];
  const kpis: [string, string, string, ReactNode][] = [
    [totals.profiles.toLocaleString(), "Profiles surfaced", kpiHelp.profiles, null],
    [
      totals.profiles_with_reviews.toLocaleString(),
      "Profiles with reviews",
      kpiHelp.with_reviews,
      b && <VsChange volume change={changeBetween("count", "up", totals.profiles_with_reviews, b.profiles_with_reviews)} was={b.profiles_with_reviews.toLocaleString()} />,
    ],
    [
      totals.total_reviews.toLocaleString(),
      "Total reviews",
      kpiHelp.total_reviews,
      b && <VsChange volume change={changeBetween("count", "up", totals.total_reviews, b.total_reviews)} was={b.total_reviews.toLocaleString()} />,
    ],
    [
      totals.weighted_rating === null ? "-" : `${totals.weighted_rating.toFixed(2)} / 5`,
      "Weighted rating",
      kpiHelp.weighted_rating,
      b && (
        <VsChange
          change={changeBetween("stars", "up", totals.weighted_rating, b.weighted_rating, enoughReviews(totals.total_reviews, b.total_reviews))}
          was={stars(b.weighted_rating)}
        />
      ),
    ],
    [
      totals.profiles_without_reviews.toLocaleString(),
      "Profiles with no reviews",
      kpiHelp.without_reviews,
      b && <VsChange volume change={changeBetween("count", "down", totals.profiles_without_reviews, b.profiles_without_reviews)} was={b.profiles_without_reviews.toLocaleString()} />,
    ],
  ];

  return (
    <Grid container spacing={2}>
      <Grid size={12} sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", justifyContent: "space-between" }}>
        <ToggleSelect
          label="Figures"
          value={source}
          options={[{ value: "google", label: "Google totals" }, { value: "extracted", label: "Extracted reviews (period)" }]}
          onChange={onSource}
        />
        <Typography variant="caption" color="text.secondary">
          {google
            ? data.google.refreshed === 0
              ? "No location has Google totals yet: an admin can click Refresh Google totals on the Extraction page. Extracted figures are shown meanwhile."
              : `Google's public rating and review count, as of ${new Date(data.google.oldest_checked_at as string).toLocaleDateString()} or later (${data.google.refreshed} of ${data.profiles} locations refreshed${data.google.refreshed < data.profiles ? "; the others show extracted figures, marked *" : ""}). The period filter does not apply to Google totals${data.compare ? ", so changes against Compare to are shown under Extracted reviews" : ""}.`
            : "Reviews stored by this app for the selected period."}
        </Typography>
      </Grid>
      {totals.not_extracted > 0 && (
        <Grid size={12}>
          <Alert severity="warning">
            {totals.not_extracted} of {totals.profiles} locations have not been extracted yet, so their reviews are missing from every figure on
            the Dashboard{google ? " (and they have no Google totals yet)" : ""}. Extract them on the Extraction page
            {google ? "" : ", or switch to Google totals after a Refresh Google totals"}.
          </Alert>
        </Grid>
      )}
      {kpis.map(([value, label, info, change]) => (
        <Grid key={label} size={{ xs: 6, sm: 4, md: 2.4 }}>
          <KpiCard value={value} label={label} info={info} change={change} />
        </Grid>
      ))}

      <Grid size={{ xs: 12, md: 7 }}>
        <SectionCard title="Location Performance" info={HELP.locationPerformance}>
          <DataTable
            maxHeight={520}
            hover
            columns={columns}
            rows={rows}
            rowKey={(l) => l.id}
            sort={sort}
            sortable={["name", "avg_rating", "reviews"]}
            onSort={(key) => setSort((s) => ({ key: key as SortKey, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Signal: {ratingRule}
          </Typography>
        </SectionCard>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SectionCard title="Largest Review Volumes" info={HELP.largestVolumes}>
          {top.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No reviews in this period.
            </Typography>
          ) : (
            <CountBarChart
              horizontal
              labelWidth={150}
              height={Math.max(180, top.length * 52)}
              labels={top.map((l) => l.name.replace(/^Healthway\s+/i, ""))}
              values={top.map((l) => l.reviews)}
              name="Reviews"
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            />
          )}
        </SectionCard>
        <SectionCard title="Dashboard readout" info={HELP.readout}>
          <BulletList items={readout} />
        </SectionCard>
      </Grid>
    </Grid>
  );
}
