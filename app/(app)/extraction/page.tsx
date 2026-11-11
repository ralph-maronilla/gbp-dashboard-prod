"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Chip from "@mui/material/Chip";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AutoExtractCard } from "@/components/extraction/auto-extract-card";
import { LocationsPanel } from "@/components/extraction/locations-panel";
import { ReviewsPanel } from "@/components/extraction/reviews-panel";
import { EMPTY_REVIEW_FILTER, parseReviewFilter, reviewFilterQuery, type ReviewFilterState } from "@/components/extraction/review-filter";
import { useExtractStatus, useMe } from "@/lib/client/hooks";

function Loading() {
  return (
    <LoadingOverlay active>
      <Skeleton variant="rounded" height={320} />
    </LoadingOverlay>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function ExtractionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ExtractionView />
    </Suspense>
  );
}

/** The reviews filters start from the URL and are written back to it (shareable, reload-safe). */
function useReviewFilter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<ReviewFilterState>(() => parseReviewFilter(new URLSearchParams(searchParams.toString())));

  useEffect(() => {
    const qs = reviewFilterQuery(filter, new URLSearchParams(window.location.search));
    // Native history API, as on the Dashboard: no navigation or refetch. Skipped when the URL already matches.
    if (window.location.search.replace(/^\?/, "") !== qs) window.history.replaceState(window.history.state, "", qs ? `${pathname}?${qs}` : pathname);
  }, [filter, pathname]);

  return [filter, setFilter] as const;
}

/** Extraction: pick locations, extract their reviews through Serper, browse and export them. */
function ExtractionView() {
  const me = useMe();
  const role = me.data?.role;
  const canExtract = role === "admin" || role === "manager";
  const status = useExtractStatus(canExtract);
  const [filter, setFilter] = useReviewFilter();

  const showReviews = useCallback((locationId: string) => {
    setFilter({ ...EMPTY_REVIEW_FILTER, locationId });
    requestAnimationFrame(() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [setFilter]);

  if (!role) return <Loading />;

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h5" component="h1">
          Extraction
        </Typography>
        {canExtract && status.data && (
          status.data.configured ? (
            <Stack direction="row" spacing={1}>
              <Chip
                size="small"
                variant="outlined"
                color={status.data.my_credits_today >= status.data.my_daily_credit_limit ? "error" : status.data.my_credits_today >= status.data.my_daily_credit_limit * 0.8 ? "warning" : "default"}
                label={`Your credits today: ${status.data.my_credits_today.toLocaleString()} / ${status.data.my_daily_credit_limit.toLocaleString()}`}
              />
              <Chip
                size="small"
                variant="outlined"
                color={status.data.credits_today >= status.data.daily_credit_limit ? "error" : "default"}
                label={`Everyone: ${status.data.credits_today.toLocaleString()} / ${status.data.daily_credit_limit.toLocaleString()}`}
              />
            </Stack>
          ) : (
            <Chip size="small" color="warning" label="SERPER_API_KEY is not set" />
          )
        )}
      </Stack>

      {role === "admin" && <AutoExtractCard />}

      <LocationsPanel role={role} onShowReviews={showReviews} />

      <div id="reviews">
        <ReviewsPanel filter={filter} onFilterChange={setFilter} />
      </div>
    </Stack>
  );
}
