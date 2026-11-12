"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MedicalServicesOutlinedIcon from "@mui/icons-material/MedicalServicesOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import type { ReactNode } from "react";
import { HELP, themeTileHelp } from "@/lib/insights/help";
import type { ThemeKey } from "@/lib/insights/themes";
import { issueLevel, type Signal } from "@/lib/insights/signals";
import type { ActionLocation, GroupBy, InsightsQuery, RecommendedAction, ThemeInsights, ThemeStat, WithCompare } from "@/lib/schemas/insights";
import { changeBetween, enoughReviews } from "@/lib/insights/compare";
import { useCompareLabel, VsChange } from "./change-text";
import { DataTable } from "@/components/ui/data-table";
import { LabelWithTip } from "./info-tip";
import { GroupToggle } from "./reputation-tab";
import { SectionCard } from "./section-card";
import { SignalPill, toneBg, toneColor } from "./signal";
import { ThemeExportButton } from "./theme-export-button";

const ICONS: Record<ThemeKey, ReactNode> = {
  waiting: <AccessTimeIcon fontSize="large" />,
  doctors: <MedicalServicesOutlinedIcon fontSize="large" />,
  staff: <GroupsOutlinedIcon fontSize="large" />,
  billing: <ReceiptLongOutlinedIcon fontSize="large" />,
  facilities: <LocalHospitalOutlinedIcon fontSize="large" />,
  appointments: <EventAvailableOutlinedIcon fontSize="large" />,
  diagnostics: <ScienceOutlinedIcon fontSize="large" />,
  commendations: <StarBorderIcon fontSize="large" />,
};

/** The share behind a tile's signal (negative for issues, positive for commendations) against the Compare-to dates. */
function TileChange({ theme, was }: { theme: ThemeStat; was: ThemeStat | undefined }) {
  if (!was) return null;
  const k = theme.kind === "commendation" ? "positive_pct" : "negative_pct";
  const change = changeBetween("pts", theme.kind === "commendation" ? "up" : "down", theme[k], was[k], enoughReviews(theme.mentions, was.mentions));
  return (
    <Box sx={{ display: "flex", justifyContent: "center" }}>
      <VsChange block={false} change={change} was={`${was[k] === null ? "-" : `${Math.round(was[k])}%`} ${theme.kind === "commendation" ? "positive" : "negative"}`} />
    </Box>
  );
}

/** The guide's tile wording: Watch on a theme tile reads "Watch Area". */
const tileSignal = (s: Signal): Signal => (s.label === "Watch" ? { ...s, label: "Watch Area" } : s);

/** A location named under an action, tinted by how negative it is (High from 25%, Moderate from 10%) and linking to its page. */
function AffectedChip({ a }: { a: ActionLocation }) {
  const level = issueLevel(a.negative_pct);
  return (
    <Chip
      component={Link}
      href={`/locations/${a.location_id}`}
      clickable
      size="small"
      title={`${a.negative_pct}% of ${a.mentions} mentions are negative`}
      label={
        <>
          {a.location.replace(/^Healthway\s*-?\s*/i, "")} <strong>{a.negative_pct}%</strong>
          <Box component="span" sx={{ opacity: 0.75 }}> of {a.mentions}</Box>
        </>
      }
      sx={{ color: (t) => toneColor(t, level.tone), bgcolor: (t) => toneBg(t, level.tone), border: 1, borderColor: (t) => toneColor(t, level.tone), fontWeight: 500, "&:hover": { bgcolor: (t) => toneBg(t, level.tone) } }}
    />
  );
}

function ActionList({ actions }: { actions: RecommendedAction[] }) {
  if (actions.length === 0) return <Typography variant="body2" color="text.secondary">No theme needs action in this period.</Typography>;
  return (
    <Stack spacing={1.75} divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
      {actions.map((a) => (
        <Box key={a.theme}>
          <Typography variant="subtitle2">{a.theme}</Typography>
          <Typography variant="body2">{a.advice}</Typography>
          {a.most_affected.length > 0 && (
            <Stack direction="row" useFlexGap spacing={0.75} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                Most affected:
              </Typography>
              {a.most_affected.map((m) => (
                <AffectedChip key={m.location_id} a={m} />
              ))}
              {a.more > 0 && (
                <Typography variant="caption" color="text.secondary">
                  and {a.more} other location{a.more === 1 ? "" : "s"}
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      ))}
      <Typography variant="body2" color="text.secondary">
        Track improvement over the next reporting cycle.
      </Typography>
    </Stack>
  );
}

export function IntelligenceTab({
  data,
  groupBy,
  onGroupBy,
  onTheme,
  exportParams,
}: {
  data: WithCompare<ThemeInsights>;
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  /** Opens the reviews that mention a theme (tile click). */
  onTheme: (key: ThemeKey) => void;
  /** Dashboard filters for the Excel export. */
  exportParams: Partial<InsightsQuery>;
}) {
  const compareLabel = useCompareLabel();
  const was = data.compare ? new Map(data.compare.data.themes.map((t) => [t.key, t])) : null;
  const wasCell = (group: string, key: ThemeKey) => data.compare?.data.heatmap.find((r) => r.group === group)?.cells.find((c) => c.key === key);
  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <SectionCard
          title="Review Theme Signals"
          info={HELP.themeSignals}
          subtitle="Click a theme to read its reviews, by location."
          action={<ThemeExportButton params={exportParams} />}
        >
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)", lg: "repeat(8, 1fr)" } }}>
            {data.themes.map((t) => (
              <Paper
                key={t.key}
                variant="outlined"
                sx={{ position: "relative", p: 1.5, textAlign: "center", display: "flex", flexDirection: "column", gap: 1, "&:hover": { borderColor: "primary.main" } }}
              >
                {/* Covers the whole tile; the ⓘ sits above it so it still opens its own tip. */}
                <ButtonBase
                  aria-label={`Show the reviews that mention ${t.label}`}
                  onClick={() => onTheme(t.key)}
                  sx={{ position: "absolute", inset: 0, borderRadius: "inherit", "&:hover, &.Mui-focusVisible": { bgcolor: "action.hover" } }}
                />
                <Box aria-hidden sx={{ color: "primary.main", "& svg": { fontSize: 28 } }}>{ICONS[t.key]}</Box>
                <Typography variant="subtitle2" sx={{ minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", "& button": { position: "relative", zIndex: 1 } }}>
                  <LabelWithTip label={t.label} text={themeTileHelp(t.key, t.kind)} />
                </Typography>
                <SignalPill signal={tileSignal(t.signal)} fullWidth />
                <Typography variant="caption" color="primary">
                  {t.mentions.toLocaleString()} review{t.mentions === 1 ? "" : "s"} ›
                </Typography>
                {was && <TileChange theme={t} was={was.get(t.key)} />}
              </Paper>
            ))}
          </Box>
        </SectionCard>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SectionCard
          title="Location & Issue Heatmap"
          info={HELP.heatmap}
          action={<GroupToggle value={groupBy} onChange={onGroupBy} />}
        >
          {data.heatmap.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No review text in this period.
            </Typography>
          ) : (
            <DataTable
              dense
              rows={data.heatmap}
              rowKey={(row) => row.group}
              columns={[
                { key: "group", label: "", cellSx: { fontWeight: 600, whiteSpace: "nowrap" }, cell: (row) => row.group },
                ...data.themes.map((t) => ({
                  key: t.key,
                  label: t.label,
                  align: "center" as const,
                  cell: (row: (typeof data.heatmap)[number]) => {
                    const c = row.cells.find((x) => x.key === t.key);
                    const b = compareLabel ? wasCell(row.group, t.key) : undefined;
                    return c && (
                      <div title={`${c.mentions} mentions` + (compareLabel ? ` (vs ${b ? `${b.mentions} mentions, ${b.level.label}` : "none"} in ${compareLabel})` : "")}>
                        <SignalPill signal={c.level} fullWidth />
                      </div>
                    );
                  },
                })),
              ]}
            />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Cells show how negative each theme&apos;s mentions are in that group (High 25%+, Moderate 10–24%, Low under 10%); Positive Commendations
            shows Strength / Stable / Watch by its positive share. Hover a cell for the number of mentions{compareLabel ? " and the Compare-to figures" : ""}.
          </Typography>
        </SectionCard>
        <SectionCard title="Recommended Actions" info={HELP.actions}>
          <ActionList actions={data.actions} />
        </SectionCard>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <SectionCard title="Management Insight" info={HELP.managementInsight}>
          <Typography variant="body2">{data.insight}</Typography>
        </SectionCard>
      </Grid>
    </Grid>
  );
}
