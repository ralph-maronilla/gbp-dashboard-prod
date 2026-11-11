"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_DETAIL_FILTER, useUiStore } from "@/lib/store/ui-store";
import { locationDetailQuerySchema, reviewsQuerySchema } from "@/lib/schemas/location-detail";

/**
 * Keeps the location-detail filters and the URL query string in sync, same approach as the overview.
 * Mount: URL -> store. Afterwards: store -> URL (defaults omitted). The store flag is reset on unmount
 * so navigating to another location re-reads the URL. Returns true once the URL has been read.
 */
export function useDetailUrlSync(): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const filter = useUiStore((s) => s.detailFilter);
  const ready = useUiStore((s) => s.detailReady);

  useEffect(() => {
    const raw = Object.fromEntries(new URLSearchParams(window.location.search));
    const reviews = reviewsQuerySchema.safeParse(raw);
    const detail = locationDetailQuerySchema.safeParse(raw);
    useUiStore.setState({
      detailReady: true,
      detailFilter:
        reviews.success && detail.success
          ? {
              ratings: reviews.data.rating ?? [],
              status: reviews.data.status ?? "all",
              from: reviews.data.from ?? "",
              to: reviews.data.to ?? "",
              q: reviews.data.q ?? "",
              granularity: detail.data.granularity,
            }
          : DEFAULT_DETAIL_FILTER,
    });
    return () => {
      useUiStore.setState({ detailReady: false, detailFilter: DEFAULT_DETAIL_FILTER });
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (filter.ratings.length > 0) params.set("rating", [...filter.ratings].sort().join(","));
    if (filter.status !== "all") params.set("status", filter.status);
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);
    if (filter.q) params.set("q", filter.q);
    if (filter.granularity !== DEFAULT_DETAIL_FILTER.granularity) params.set("granularity", filter.granularity);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [ready, filter, pathname, router]);

  return ready;
}
