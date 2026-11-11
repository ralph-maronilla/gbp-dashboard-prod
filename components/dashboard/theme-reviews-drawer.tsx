"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MuiLink from "@mui/material/Link";
import Rating from "@mui/material/Rating";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { RetryAlert } from "@/components/ui/retry-alert";
import { useMoreThemeReviews, useThemeReviews } from "@/lib/client/hooks";
import { useDebounced } from "@/lib/client/use-debounced";
import { formatDate } from "@/lib/format";
import type { Sentiment } from "@/lib/insights/sentiment";
import type { Tone } from "@/lib/insights/signals";
import type { ThemeKey } from "@/lib/insights/themes";
import type { InsightsQuery, ThemeReview, ThemeReviewLocation, ThemeSentimentFilter } from "@/lib/schemas/insights";
import { toneBg, toneColor } from "./signal";
import { ThemeExportButton } from "./theme-export-button";

const PAGE = 10;
const MORE = 20;

const SENTIMENT: Record<Sentiment, { label: string; tone: Tone }> = {
  negative: { label: "Negative", tone: "error" },
  mixed: { label: "Mixed", tone: "warning" },
  positive: { label: "Positive", tone: "success" },
};
const FILTERS: { value: ThemeSentimentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "negative", label: "Negative" },
  { value: "mixed", label: "Mixed" },
  { value: "positive", label: "Positive" },
];

/** The review text with the theme's keywords marked. */
function Highlighted({ text, marks }: { text: string; marks: [number, number][] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of marks) {
    if (start < at) continue;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <Box key={start} component="mark" sx={{ bgcolor: (t) => toneBg(t, "warning"), color: "inherit", borderRadius: 0.5, px: 0.25 }}>
        {text.slice(start, end)}
      </Box>,
    );
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function ReviewItem({ review }: { review: ThemeReview }) {
  const s = SENTIMENT[review.sentiment];
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
        <Rating value={review.rating} readOnly size="small" />
        <Typography variant="caption" color="text.secondary">
          {formatDate(review.created_at)}
        </Typography>
        <Chip size="small" label={s.label} sx={{ color: (t) => toneColor(t, s.tone), bgcolor: (t) => toneBg(t, s.tone), fontWeight: 600 }} />
        {review.unanswered && <Chip size="small" color="warning" variant="outlined" label="Unanswered" />}
      </Stack>
      <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: "pre-wrap" }}>
        <Highlighted text={review.comment} marks={review.marks} />
      </Typography>
    </Box>
  );
}

function LocationSection({ loc, query, expanded, issue }: { loc: ThemeReviewLocation; query: Partial<InsightsQuery> & object; expanded: boolean; issue: boolean }) {
  const [extra, setExtra] = useState<ThemeReview[]>([]);
  const more = useMoreThemeReviews();
  const shown = [...loc.reviews, ...extra];
  const pct = issue ? loc.negative_pct : loc.positive_pct;
  return (
    <Accordion defaultExpanded={expanded} disableGutters variant="outlined" sx={{ "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2">{loc.location}</Typography>
          <Typography variant="caption" color="text.secondary">
            {loc.matching.toLocaleString()} review{loc.matching === 1 ? "" : "s"} shown · {loc.mentions.toLocaleString()} mention{loc.mentions === 1 ? "" : "s"}
            {pct !== null && ` · ${pct}% ${issue ? "negative" : "positive"}`}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2} divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {shown.map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 1 }}>
          {shown.length < loc.matching ? (
            <Button
              size="small"
              variant="outlined"
              loading={more.isPending}
              onClick={() =>
                more.mutate(
                  { ...query, location_id: loc.location_id, offset: shown.length, limit: MORE },
                  { onSuccess: (d) => setExtra((e) => [...e, ...(d.locations[0]?.reviews ?? [])]) },
                )
              }
            >
              Show more ({(loc.matching - shown.length).toLocaleString()} left)
            </Button>
          ) : (
            <span />
          )}
          <MuiLink component={Link} href={`/locations/${loc.location_id}`} variant="body2" underline="hover">
            Open location
          </MuiLink>
        </Stack>
        {more.isError && (
          <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
            Could not load more reviews. Try again.
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/**
 * Right-hand panel (full screen on phones) listing every review that mentions `theme` under the Dashboard's filters,
 * grouped by location, worst first. Opened from a theme tile on the Review Intelligence tab.
 */
export function ThemeReviewsDrawer({
  theme,
  sentiment,
  onSentiment,
  onClose,
  filters,
  period,
}: {
  theme: ThemeKey | null;
  sentiment: ThemeSentimentFilter;
  onSentiment: (s: ThemeSentimentFilter) => void;
  onClose: () => void;
  filters: Partial<InsightsQuery>;
  /** "Last 12 months" */
  period: string;
}) {
  const [search, setSearch] = useState("");
  // A new theme starts with an empty search box.
  const [forTheme, setForTheme] = useState(theme);
  if (forTheme !== theme) {
    setForTheme(theme);
    setSearch("");
  }
  const q = useDebounced(search.trim());
  const query = { ...filters, theme: theme ?? undefined, sentiment, q: q || undefined };
  const data = useThemeReviews({ ...query, limit: PAGE }, theme !== null);
  const d = data.data?.theme === theme ? data.data : undefined;
  const issue = d?.kind !== "commendation";

  return (
    <Drawer
      anchor="right"
      open={theme !== null}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 640 }, maxWidth: "100%" } } }}
    >
      <Stack sx={{ p: 2.5, gap: 2, borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <div>
            <Typography variant="h6" component="h2">
              {d?.label ?? "Reviews"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {d ? `${d.counts.all.toLocaleString()} review${d.counts.all === 1 ? "" : "s"} mention this theme · ${period}` : period}
            </Typography>
          </div>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
            {theme && <ThemeExportButton label="Export" params={{ ...filters, theme, sentiment, q: q || undefined }} />}
            <IconButton aria-label="Close" onClick={onClose} edge="end">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sentiment}
          onChange={(_e, v: ThemeSentimentFilter | null) => v && onSentiment(v)}
          aria-label="Sentiment"
          sx={{ flexWrap: "wrap" }}
        >
          {FILTERS.map((f) => (
            <ToggleButton key={f.value} value={f.value} sx={{ px: 1.5 }}>
              {f.label}
              {d && ` (${d.counts[f.value].toLocaleString()})`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder="Search these reviews"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { maxLength: 100, "aria-label": "Search these reviews" },
          }}
        />
      </Stack>

      <Box sx={{ p: 2.5, overflowY: "auto", flex: 1 }}>
        {data.isError ? (
          <RetryAlert what="these reviews" onRetry={() => void data.refetch()} />
        ) : !d ? (
          <Stack spacing={1.5}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={88} />
            ))}
          </Stack>
        ) : d.locations.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No reviews match{q ? ` "${q}"` : ""} in this period. Try another sentiment or a longer period.
          </Typography>
        ) : (
          <LoadingOverlay active={data.isPlaceholderData}>
            {/* Remounted when the filters change, so pages loaded with Show more do not leak into the new list. */}
            <Stack spacing={1.5} key={JSON.stringify(query)}>
              {d.locations.map((loc, i) => (
                <LocationSection key={loc.location_id} loc={loc} query={query} expanded={i === 0} issue={issue} />
              ))}
            </Stack>
          </LoadingOverlay>
        )}
      </Box>
    </Drawer>
  );
}
