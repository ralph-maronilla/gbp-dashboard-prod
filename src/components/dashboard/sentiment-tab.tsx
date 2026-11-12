"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ThemeInsights, ThemeQuote, ThemeStat, WithCompare } from "@/lib/schemas/insights";
import { changeBetween, enoughReviews } from "@/lib/insights/compare";
import { VsChange } from "./change-text";
import { HELP } from "@/lib/insights/help";
import { MIN_DRIVER_MENTIONS, type Tone } from "@/lib/insights/signals";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LabelWithTip } from "./info-tip";
import { SectionCard } from "./section-card";
import { SignalText, toneColor } from "./signal";

const fmt = (n: number | null) => (n === null ? "-" : `${Math.round(n)}%`);

type PctKey = "positive_pct" | "mixed_pct" | "negative_pct";
const KEY_OF: Record<"success" | "warning" | "error", PctKey> = { success: "positive_pct", warning: "mixed_pct", error: "negative_pct" };
/** Good news: more positive, fewer mixed or negative mentions. */
const BETTER: Record<PctKey, "up" | "down"> = { positive_pct: "up", mixed_pct: "down", negative_pct: "down" };

/** A theme's share against the same theme in the Compare-to dates (shares need enough mentions on both sides). */
function PctChange({ theme, was, k, block = true }: { theme: ThemeStat; was: ThemeStat | undefined; k: PctKey; block?: boolean }) {
  if (!was) return null;
  return <VsChange block={block} change={changeBetween("pts", BETTER[k], theme[k], was[k], enoughReviews(theme.mentions, was.mentions))} was={fmt(was[k])} />;
}

function Headline({ tone, title, theme, info, was }: { tone: "success" | "warning" | "error"; title: string; theme: ThemeStat | undefined; info: string; was?: ThemeStat }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ color: (t) => toneColor(t, tone) }}>
          <LabelWithTip label={title} text={info} />
        </Typography>
        <Typography sx={{ fontWeight: 600 }}>{theme?.label ?? "Not enough reviews"}</Typography>
      </Stack>
      {theme && (
        <Typography variant="caption" color="text.secondary">
          {fmt(theme[KEY_OF[tone]])} of {theme.mentions.toLocaleString()} mentions
        </Typography>
      )}
      {theme && <PctChange theme={theme} was={was} k={KEY_OF[tone]} />}
    </Paper>
  );
}

function Quote({ q }: { q: ThemeQuote }) {
  return (
    <Box sx={{ borderLeft: 3, borderColor: "divider", pl: 1.5, my: 1 }}>
      <Typography variant="body2" sx={{ fontStyle: "italic" }}>
        “{q.comment}
        {q.comment.length >= 280 ? "…" : ""}”
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.25 }}>
        <Rating value={q.rating} readOnly size="small" />
        <MuiLink component={Link} href={`/locations/${q.location_id}`} variant="caption" underline="hover">
          {q.location}
        </MuiLink>
      </Stack>
    </Box>
  );
}

/** The theme table; with Compare to, each figure has its change under it. */
function themeColumns(was: Map<string, ThemeStat> | null): Column<ThemeStat>[] {
  const pctColumn = (key: PctKey, label: string, info: string, tone: Tone): Column<ThemeStat> => ({
    key,
    label,
    info,
    tone,
    align: "right",
    cell: (t) => (
      <>
        {fmt(t[key])}
        {was && (
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <PctChange theme={t} was={was.get(t.key)} k={key} block={false} />
          </Box>
        )}
      </>
    ),
  });
  return [
    { key: "label", label: "Theme", cellSx: { fontWeight: 700 }, cell: (t) => t.label },
    pctColumn("positive_pct", "Positive", HELP.colPositive, "success"),
    pctColumn("mixed_pct", "Mixed", HELP.colMixed, "warning"),
    pctColumn("negative_pct", "Negative", HELP.colNegative, "error"),
    {
      key: "mentions",
      label: "Mentions",
      info: HELP.colMentions,
      align: "right",
      cell: (t) => {
        const b = was?.get(t.key);
        return (
          <>
            {t.mentions.toLocaleString()}
            {b && (
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <VsChange block={false} change={changeBetween("count", null, t.mentions, b.mentions)} was={b.mentions.toLocaleString()} />
              </Box>
            )}
          </>
        );
      },
    },
    { key: "signal", label: "Signal", info: HELP.colThemeSignal, cell: (t) => <SignalText signal={t.signal} /> },
  ];
}

/** A tone-colored list of driver themes, each with its quotes (`quotes` caps how many). */
function Drivers({ title, tone, empty, drivers, quotes }: { title: string; tone: Tone; empty: string; drivers: ThemeInsights["positive_drivers"]; quotes?: number }) {
  return (
    <>
      <Typography variant="overline" sx={{ color: (t) => toneColor(t, tone), fontWeight: 700, display: "block", mt: tone === "error" ? 1 : 0 }}>
        {title}
      </Typography>
      {drivers.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      )}
      {drivers.map((d) => (
        <Box key={d.key} sx={{ mb: 1 }}>
          <Typography variant="subtitle2">• {d.label}</Typography>
          {d.quotes.slice(0, quotes).map((q) => (
            <Quote key={q.id} q={q} />
          ))}
        </Box>
      ))}
    </>
  );
}

export function SentimentTab({ data }: { data: WithCompare<ThemeInsights> }) {
  const issues = data.themes.filter((t) => t.kind === "issue" && t.mentions >= MIN_DRIVER_MENTIONS);
  const was = data.compare ? new Map(data.compare.data.themes.map((t) => [t.key, t])) : null;
  const wasOf = (t: ThemeStat | undefined) => (t && was ? was.get(t.key) : undefined);
  const best = (key: PctKey) => [...issues].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Headline tone="success" title="Positive" theme={best("positive_pct")} was={wasOf(best("positive_pct"))} info={HELP.headlinePositive} />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Headline tone="warning" title="Mixed" theme={best("mixed_pct")} was={wasOf(best("mixed_pct"))} info={HELP.headlineMixed} />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Headline tone="error" title="Negative" theme={best("negative_pct")} was={wasOf(best("negative_pct"))} info={HELP.headlineNegative} />
      </Grid>

      <Grid size={{ xs: 12, md: 7 }}>
        <SectionCard
          title="Sentiment by Review Theme"
          info={HELP.sentimentTable}
          subtitle={`${data.reviews_with_text.toLocaleString()} reviews with text in this period. A review can mention several themes. The feeling is read from the words for ${data.text_share_pct === null ? 0 : Math.round(data.text_share_pct)}% of mentions; the rest follow the review's stars.`}
        >
          <DataTable columns={themeColumns(was)} rows={data.themes} rowKey={(t) => t.key} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Theme detection is keyword-based (English and Tagalog). Sentiment comes from the review&apos;s stars: 4–5 positive, 3 mixed, 1–2 negative.
            Signal: Strength under 10% negative, Watch 10–24%, Priority 25% and above.
          </Typography>
        </SectionCard>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <SectionCard title="What the sentiment layer adds" info={HELP.drivers}>
          <Drivers title="Positive drivers" tone="success" empty="Not enough reviews yet." drivers={data.positive_drivers} quotes={1} />
          <Drivers title="Negative drivers" tone="error" empty="No recurring negative themes." drivers={data.negative_drivers} />
        </SectionCard>
      </Grid>
    </Grid>
  );
}
