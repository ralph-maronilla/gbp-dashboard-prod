"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Rating from "@mui/material/Rating";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { DateRange } from "@/components/ui/date-range";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { RetryAlert } from "@/components/ui/retry-alert";
import { SelectField } from "@/components/ui/select-field";
import { useLocationReviews } from "@/lib/client/hooks";
import { useDebouncedField } from "@/lib/client/use-debounced";
import { formatDate } from "@/lib/format";
import { DEFAULT_DETAIL_FILTER, useUiStore } from "@/lib/store/ui-store";
import type { ReviewRow } from "@/lib/schemas/location-detail";

function ReviewItem({ review }: { review: ReviewRow }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
        <Rating value={review.rating} readOnly size="small" />
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {review.reviewer_name ?? "Anonymous"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatDate(review.create_time)}
        </Typography>
        {review.reply_comment === null && <Chip size="small" color="warning" variant="outlined" label="Unanswered" />}
      </Stack>
      <Typography sx={{ mt: 1, whiteSpace: "pre-wrap" }} color={review.comment ? "text.primary" : "text.secondary"}>
        {review.comment ?? "No comment"}
      </Typography>
      {review.reply_comment !== null && (
        <Box sx={{ mt: 1.5, pl: 1.5, borderLeft: 3, borderColor: "primary.main" }}>
          <Typography variant="caption" color="text.secondary">
            Reply{review.reply_time ? ` · ${formatDate(review.reply_time)}` : ""}
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {review.reply_comment}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

export function ReviewList({ locationId, ready }: { locationId: string; ready: boolean }) {
  const filter = useUiStore((s) => s.detailFilter);
  const setFilter = useUiStore((s) => s.setDetailFilter);

  const reviews = useLocationReviews(
    locationId,
    {
      rating: filter.ratings.length > 0 ? [...filter.ratings].sort().join(",") : undefined,
      status: filter.status === "all" ? undefined : filter.status,
      from: filter.from || undefined,
      to: filter.to || undefined,
      q: filter.q || undefined,
    },
    ready,
  );

  const [search, setSearch] = useDebouncedField(filter.q, (q) => setFilter({ q }), ready);

  const rows = reviews.data?.pages.flatMap((p) => p.rows) ?? [];
  const filtersActive =
    filter.ratings.length > 0 || filter.status !== "all" || !!filter.from || !!filter.to || !!filter.q;

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Reviews</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" }, flexWrap: "wrap", rowGap: 2 }}>
        <ToggleButtonGroup
          size="small"
          value={filter.ratings}
          onChange={(_e, v: number[]) => setFilter({ ratings: v })}
          aria-label="Filter by rating"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <ToggleButton key={n} value={n} aria-label={`${n} star`}>
              {n}★
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <SelectField
          label="Replies"
          value={filter.status}
          width={150}
          options={[{ value: "all", label: "All" }, { value: "replied", label: "Replied" }, { value: "unanswered", label: "Unanswered" }]}
          onChange={(status) => setFilter({ status: status as typeof filter.status })}
        />
        <DateRange from={filter.from} to={filter.to} onChange={setFilter} />
        <TextField size="small" label="Search reviews" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 200 }} />
        {filtersActive && (
          <Button
            onClick={() => {
              setSearch("");
              setFilter({ ...DEFAULT_DETAIL_FILTER, granularity: filter.granularity });
            }}
          >
            Clear filters
          </Button>
        )}
      </Stack>

      {reviews.isError ? (
        <RetryAlert what="reviews" onRetry={() => void reviews.refetch()} />
      ) : reviews.isPending ? (
        <LoadingOverlay active>
          <Stack spacing={1.5}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={96} />
            ))}
          </Stack>
        </LoadingOverlay>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            {filtersActive ? "No reviews match these filters." : "No reviews yet for this location."}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
          {reviews.hasNextPage && (
            <Button variant="outlined" onClick={() => void reviews.fetchNextPage()} disabled={reviews.isFetchingNextPage} sx={{ alignSelf: "center" }}>
              {reviews.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
