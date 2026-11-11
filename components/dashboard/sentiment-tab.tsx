"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ThemeInsights, ThemeQuote, ThemeStat } from "@/lib/schemas/insights";
import { HELP } from "@/lib/insights/help";
import { MIN_DRIVER_MENTIONS, type Tone } from "@/lib/insights/signals";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LabelWithTip } from "./info-tip";
import { SectionCard } from "./section-card";
import { SignalText, toneColor } from "./signal";

const fmt = (n: number | null) => (n === null ? "-" : `${Math.round(n)}%`);

function Headline({ tone, title, theme, info }: { tone: Tone; title: string; theme: ThemeStat | undefined; info: string }) {
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
          {fmt(tone === "success" ? theme.positive_pct : tone === "warning" ? theme.mixed_pct : theme.negative_pct)} of {theme.mentions.toLocaleString()} mentions
        </Typography>
      )}
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

const pctColumn = (key: "positive_pct" | "mixed_pct" | "negative_pct", label: string, info: string, tone: Tone): Column<ThemeStat> => ({
  key,
  label,
  info,
  tone,
  align: "right",
  cell: (t) => fmt(t[key]),
});

const THEME_COLUMNS: Column<ThemeStat>[] = [
  { key: "label", label: "Theme", cellSx: { fontWeight: 700 }, cell: (t) => t.label },
  pctColumn("positive_pct", "Positive", HELP.colPositive, "success"),
  pctColumn("mixed_pct", "Mixed", HELP.colMixed, "warning"),
  pctColumn("negative_pct", "Negative", HELP.colNegative, "error"),
  { key: "mentions", label: "Mentions", info: HELP.colMentions, align: "right", cell: (t) => t.mentions.toLocaleString() },
  { key: "signal", label: "Signal", info: HELP.colThemeSignal, cell: (t) => <SignalText signal={t.signal} /> },
];

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

export function SentimentTab({ data }: { data: ThemeInsights }) {
  const issues = data.themes.filter((t) => t.kind === "issue" && t.mentions >= MIN_DRIVER_MENTIONS);
  const best = (key: "positive_pct" | "mixed_pct" | "negative_pct") => [...issues].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Headline tone="success" title="Positive" theme={best("positive_pct")} info={HELP.headlinePositive} />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Headline tone="warning" title="Mixed" theme={best("mixed_pct")} info={HELP.headlineMixed} />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Headline tone="error" title="Negative" theme={best("negative_pct")} info={HELP.headlineNegative} />
      </Grid>

      <Grid size={{ xs: 12, md: 7 }}>
        <SectionCard
          title="Sentiment by Review Theme"
          info={HELP.sentimentTable}
          subtitle={`${data.reviews_with_text.toLocaleString()} reviews with text in this period. A review can mention several themes. The feeling is read from the words for ${data.text_share_pct === null ? 0 : Math.round(data.text_share_pct)}% of mentions; the rest follow the review's stars.`}
        >
          <DataTable columns={THEME_COLUMNS} rows={data.themes} rowKey={(t) => t.key} />
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
