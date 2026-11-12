"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import type { ReactNode } from "react";
import type { DashboardData } from "@/lib/schemas/dashboard";
import Chip from "@mui/material/Chip";
import type { GroupBy, GroupPerformance, ReputationInsights, StatusCard, WithCompare } from "@/lib/schemas/insights";
import { changeBetween, enoughReviews, type Change } from "@/lib/insights/compare";
import { useCompareLabel, VsChange } from "./change-text";
import { HELP } from "@/lib/insights/help";
import { LowRatingChart, MonthlyRatingChart, MonthlyVolumeChart, type CompareMonths } from "./dashboard-charts";
import { LabelWithTip } from "./info-tip";
import { LowRatingList } from "./low-rating-list";
import { BulletList, SectionCard } from "./section-card";
import { SignalDot, toneColor } from "./signal";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ToggleSelect } from "@/components/ui/toggle-select";

const ICONS: Record<StatusCard["key"], ReactNode> = {
  coverage: <HubOutlinedIcon />,
  rating: <StarBorderIcon />,
  response_coverage: <ChatBubbleOutlineIcon />,
  response_speed: <ScheduleIcon />,
  escalation: <ShieldOutlinedIcon />,
};

const TILE_HELP: Record<StatusCard["key"], string> = {
  coverage: HELP.coverage,
  rating: HELP.ratingHealth,
  response_coverage: HELP.responseCoverage,
  response_speed: HELP.responseSpeed,
  escalation: HELP.escalation,
};

/** A tile's change against the same tile for the Compare-to dates, and the compared value as shown. */
function tileChange(a: StatusCard, b: StatusCard): { change: Change; was: string } {
  const v = b.value;
  switch (a.key) {
    case "coverage":
      return { change: changeBetween("count", "up", a.value, v), was: `${v ?? 0} profiles` };
    case "rating":
      return { change: changeBetween("stars", "up", a.value, v, enoughReviews(a.reviews, b.reviews)), was: v === null ? "-" : `${v.toFixed(2)}★` };
    case "response_coverage":
      return { change: changeBetween("pts", "up", a.value, v, enoughReviews(a.reviews, b.reviews)), was: v === null ? "-" : `${v.toFixed(0)}%` };
    case "response_speed":
      // Measured and approximate reply times are not comparable with each other.
      return { change: changeBetween("days", "down", a.value, v, a.note === b.note && enoughReviews(a.reviews, b.reviews)), was: v === null ? "-" : `${v.toFixed(1)} days` };
    case "escalation":
      return { change: changeBetween("count", "down", a.value, v), was: `${v ?? 0}` };
  }
}

function StatusTile({ card, compared }: { card: StatusCard; compared?: StatusCard }) {
  const vs = compared && tileChange(card, compared);
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column", gap: 0.75 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          <LabelWithTip label={card.title} text={TILE_HELP[card.key]} />
        </Typography>
        <Box aria-hidden sx={{ color: "primary.main", display: "flex", "& svg": { fontSize: 18 } }}>{ICONS[card.key]}</Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ color: (t) => toneColor(t, card.signal.tone) }}>
          {card.signal.label}
          {card.note && <Chip label={card.note} size="small" variant="outlined" sx={{ ml: 0.75, height: 18, fontSize: 11 }} />}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {card.detail}
        </Typography>
        {vs && <VsChange volume={card.key === "coverage" || card.key === "escalation"} change={vs.change} was={vs.was} />}
      </Box>
    </Paper>
  );
}

/** Reviews and rating of a group against the same group in the Compare-to dates (a group with none there counts 0). */
function GroupChange({ a, b }: { a: GroupPerformance; b: GroupPerformance | undefined }) {
  const reviews = b?.reviews ?? 0;
  const rating = b?.avg_rating ?? null;
  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", fontWeight: 400 }}>
      <VsChange volume block={false} change={changeBetween("count", "up", a.reviews, reviews)} was={`${reviews.toLocaleString()} reviews`} />
      <VsChange block={false} change={changeBetween("stars", "up", a.avg_rating, rating, enoughReviews(a.reviews, reviews))} was={rating === null ? "-" : `${rating.toFixed(2)}★`} />
    </Box>
  );
}

export type Granularity = "auto" | "month" | "quarter" | "year";
const GROUP_LABEL: Record<GroupBy, string> = { area: "Area", segment: "Segment", region: "Region", island: "Island group", type: "Type" };

const GROUP_OPTIONS = (Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }));
const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export function GroupToggle({ value, onChange }: { value: GroupBy; onChange: (g: GroupBy) => void }) {
  return <ToggleSelect label="Group by" value={value} options={GROUP_OPTIONS} onChange={onChange} />;
}

const signalColumn = (key: "health" | "activity" | "response" | "attention", label: string, info: string): Column<GroupPerformance> => ({
  key,
  label,
  info,
  cell: (g) => <SignalDot signal={g[key]} />,
});

export function ReputationTab({
  data,
  charts,
  groupBy,
  onGroupBy,
  granularity,
  onGranularity,
}: {
  data: WithCompare<ReputationInsights>;
  charts: WithCompare<DashboardData> | undefined;
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
}) {
  const per = charts ? ({ month: "month", quarter: "quarter", year: "year" } as const)[charts.granularity] : "month";
  const b = data.compare?.data;
  const bCards = new Map((b?.cards ?? []).map((c) => [c.key, c]));
  const bGroups = new Map((b?.groups ?? []).map((g) => [g.group, g]));
  // Gated on the page's Compare to (useCompareLabel) so the old second series goes as soon as Compare is turned off.
  const compareOn = useCompareLabel() !== null;
  const chartsB: CompareMonths | undefined = compareOn && charts?.compare ? { monthly: charts.compare.data.monthly, label: charts.compare.label } : undefined;
  const hasCharts = !!charts && (charts.totals.total > 0 || (charts.compare?.data.totals.total ?? 0) > 0);
  return (
    <Grid container spacing={2}>
      {data.cards.map((c) => (
        <Grid key={c.key} size={{ xs: 12, sm: 6, md: 2.4 }}>
          <StatusTile card={c} compared={bCards.get(c.key)} />
        </Grid>
      ))}

      <Grid size={{ xs: 12, md: 8 }}>
        <SectionCard
          title="Location Performance View"
          info={HELP.groupPerformance}
          action={<GroupToggle value={groupBy} onChange={onGroupBy} />}
        >
          <DataTable
            rows={data.groups}
            rowKey={(g) => g.group}
            columns={[
              {
                key: "group",
                label: GROUP_LABEL[groupBy],
                cellSx: { fontWeight: 600 },
                cell: (g) => (
                  <>
                    {g.group}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {g.locations} location{g.locations === 1 ? "" : "s"} · {g.reviews.toLocaleString()} reviews{g.avg_rating !== null ? ` · ${g.avg_rating.toFixed(2)}★` : ""}
                    </Typography>
                    {b && <GroupChange a={g} b={bGroups.get(g.group)} />}
                  </>
                ),
              },
              signalColumn("health", "Reputation Health", HELP.colHealth),
              signalColumn("activity", "Review Activity", HELP.colActivity),
              signalColumn("response", "Response Status", HELP.colResponse),
              signalColumn("attention", "Attention Level", HELP.colAttention),
            ]}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Activity: reviews per location per month over the last 90 days (High ≥ 20, Moderate 5–19). Response: share of reviews with an owner
            reply (On Track ≥ 80%). Attention: share of 1–2★ reviews in the last 30 days (High above 10%). Response speed is measured from replies an
            extraction catches within 3 days (only the newest page per location is re-read); older replies use Google&apos;s &quot;3 weeks
            ago&quot; style dates. Set regions and types in Extraction → Edit location or with Auto-fill regions.
          </Typography>
        </SectionCard>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <SectionCard title="Monthly Highlights" info={HELP.highlights}>
          <BulletList items={data.highlights} />
        </SectionCard>
      </Grid>

      {charts && hasCharts && (
        <>
          <Grid size={12} sx={{ display: "flex", justifyContent: "flex-end" }}>
            <ToggleSelect label="Chart buckets" value={granularity} options={GRANULARITY_OPTIONS} onChange={onGranularity} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <SectionCard title={`Reviews per ${per}`} info={HELP.volumeChart(per)}>
              <MonthlyVolumeChart monthly={charts.monthly} compare={chartsB} />
            </SectionCard>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <SectionCard title={`Average rating per ${per}`} info={HELP.ratingChart(per)}>
              <MonthlyRatingChart monthly={charts.monthly} compare={chartsB} />
            </SectionCard>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <SectionCard title={`1–2★ reviews per ${per}`} info={HELP.lowChart(per)}>
              <LowRatingChart monthly={charts.monthly} compare={chartsB} />
            </SectionCard>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <SectionCard title="Latest 1–2★ reviews" info={HELP.latestLow}>
              <Box sx={{ maxHeight: 300, overflow: "auto" }}>
                <LowRatingList rows={charts.recent_low} />
              </Box>
            </SectionCard>
          </Grid>
        </>
      )}
    </Grid>
  );
}
