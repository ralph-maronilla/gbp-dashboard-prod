"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { ExportButton } from "@/components/export-dialog";
import { KPI_GRID_SX, KpiCard } from "@/components/kpi-card";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { RetryAlert } from "@/components/ui/retry-alert";
import { ToggleSelect } from "@/components/ui/toggle-select";
import { NoAccess } from "@/components/no-access";
import { ApiClientError } from "@/lib/client/api-client";
import { useLocationDetail } from "@/lib/client/hooks";
import { useDetailUrlSync } from "@/lib/client/use-detail-url-sync";
import { formatRelative } from "@/lib/format";
import { useUiStore } from "@/lib/store/ui-store";
import type { LocationDetail } from "@/lib/schemas/location-detail";
import { DistributionChart, TrendChart } from "./charts";
import { ReviewList } from "./review-list";

function Summary({ d }: { d: LocationDetail }) {
  return (
    <Box sx={KPI_GRID_SX}>
      <KpiCard label="Average rating" value={d.avg_rating === null ? "–" : d.avg_rating.toFixed(2)} />
      <KpiCard label="Total reviews" value={d.total_reviews.toLocaleString()} />
      <KpiCard label="New (7 days)" value={d.new_reviews_7d.toLocaleString()} />
      <KpiCard label="Unanswered" value={d.unanswered.toLocaleString()} tone={d.unanswered > 0 ? "warning" : "primary"} />
      <KpiCard label="1–2 star" value={d.low_rating.toLocaleString()} tone={d.low_rating > 0 ? "error" : "primary"} />
    </Box>
  );
}

export function LocationDetailView({ id }: { id: string }) {
  const ready = useDetailUrlSync();
  const granularity = useUiStore((s) => s.detailFilter.granularity);
  const setFilter = useUiStore((s) => s.setDetailFilter);
  const detail = useLocationDetail(id, granularity, ready);

  if (detail.error instanceof ApiClientError && (detail.error.status === 404 || detail.error.isForbidden)) {
    return (
      <Stack spacing={2}>
        <BackLink />
        <NoAccess message="This location doesn't exist or you don't have access to it." />
      </Stack>
    );
  }

  const d = detail.data;
  return (
    <Stack spacing={3}>
      <BackLink />

      {detail.isError ? (
        <RetryAlert what="this location" onRetry={() => void detail.refetch()} />
      ) : !d ? (
        <LoadingOverlay active>
          <Stack spacing={2}>
            <Skeleton width={280} height={40} />
            <Skeleton variant="rounded" height={84} />
            <Skeleton variant="rounded" height={280} />
          </Stack>
        </LoadingOverlay>
      ) : (
        <>
          <Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
              <Typography variant="h5" component="h1">
                {d.name}
              </Typography>
              {d.removed && <Chip size="small" color="error" variant="outlined" label="Removed" />}
              {!d.is_active && <Chip size="small" variant="outlined" label="Inactive" />}
              <Box sx={{ ml: "auto" }}>
                <ExportButton locationId={id} locationName={d.name} />
              </Box>
            </Stack>
            <Typography color="text.secondary">
              {d.address ?? "No address"} · Last synced {formatRelative(d.last_synced_at)}
            </Typography>
          </Box>

          <Summary d={d} />

          <LoadingOverlay active={detail.isPlaceholderData}>
          <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" } }}>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Typography variant="h6">Rating trend</Typography>
                <ToggleSelect
                  label="Trend granularity"
                  value={granularity}
                  options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]}
                  onChange={(v) => setFilter({ granularity: v })}
                />
              </Stack>
              {d.trend.some((p) => p.avg_rating !== null) ? (
                <TrendChart trend={d.trend} granularity={d.granularity} />
              ) : (
                <EmptyChart text="No reviews in this period." />
              )}
            </Paper>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Rating distribution
              </Typography>
              {d.total_reviews > 0 ? <DistributionChart distribution={d.distribution} /> : <EmptyChart text="No reviews yet." />}
            </Paper>
          </Box>
          </LoadingOverlay>
        </>
      )}

      <ReviewList locationId={id} ready={ready} />
    </Stack>
  );
}

function BackLink() {
  return (
    <Box>
      <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small">
        Back to overview
      </Button>
    </Box>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <Box sx={{ height: 280, display: "grid", placeItems: "center" }}>
      <Typography color="text.secondary">{text}</Typography>
    </Box>
  );
}
