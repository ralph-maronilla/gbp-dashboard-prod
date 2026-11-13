"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { LocationsPanel } from "@/components/extraction/locations-panel";
import { ReviewsPanel } from "@/components/extraction/reviews-panel";
import { SidePanel } from "@/components/extraction/side-panel";
import { EMPTY_REVIEW_FILTER, parseReviewFilter, reviewFilterQuery, type ReviewFilterState } from "@/components/extraction/review-filter";
import { useExtractStatus, useMe } from "@/lib/client/hooks";
import { canExtract } from "@/lib/schemas/common";

function Loading() {
  return (
    <LoadingOverlay active>
      <Skeleton variant="rounded" height={320} />
    </LoadingOverlay>
  );
}

/** From the full page width (1360px) up. */
const WIDE = "@media (min-width: 1360px)";

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
  const allowed = canExtract(me.data);
  const status = useExtractStatus(allowed);
  const [filter, setFilter] = useReviewFilter();

  const showReviews = useCallback((locationId: string) => {
    setFilter({ ...EMPTY_REVIEW_FILTER, locationId });
    requestAnimationFrame(() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [setFilter]);

  if (!role) return <Loading />;

  return (
    <div>
      <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, color: "brand.head", mb: 4 }}>
        Extraction
      </Typography>
      {/* Locations beside the side panel, Reviews full width below. On narrow screens: Locations, Reviews, then the panel. */}
      <Box
        sx={{
          display: "grid",
          gap: 5,
          rowGap: 6,
          alignItems: "start",
          // The panel is 320px on narrower desktops, so the Locations toolbar keeps to one line, and 360px from 1360px up.
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" },
          [WIDE]: { gridTemplateColumns: "minmax(0, 1fr) 360px" },
          gridTemplateAreas: { xs: '"locations" "reviews" "panel"', lg: '"locations panel" "reviews reviews"' },
        }}
      >
        <Box sx={{ gridArea: "locations", minWidth: 0 }}>
          <LocationsPanel role={role} canExtract={allowed} onShowReviews={showReviews} />
        </Box>
        <Box id="reviews" sx={{ gridArea: "reviews", minWidth: 0 }}>
          <ReviewsPanel filter={filter} onFilterChange={setFilter} />
        </Box>
        <Box sx={{ gridArea: "panel", minWidth: 0 }}>
          <SidePanel role={role} canExtract={allowed} status={status.data} />
        </Box>
      </Box>
    </div>
  );
}
