"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_OVERVIEW_FILTER, useUiStore, type OverviewFilter } from "@/lib/store/ui-store";
import { listLocationsQuerySchema } from "@/lib/schemas/locations";

/**
 * Keeps the overview filters and the URL query string in sync (shareable links, reload-safe).
 * 1) On mount: URL -> store. 2) After that: store -> URL, omitting default values.
 * Returns true once the URL has been read, so callers don't fetch with stale defaults first.
 */
export function useOverviewUrlSync(): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const filter = useUiStore((s) => s.overviewFilter);
  const ready = useUiStore((s) => s.overviewReady);

  useEffect(() => {
    const parsed = listLocationsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(window.location.search)));
    useUiStore.setState({
      overviewReady: true,
      overviewFilter: parsed.success
        ? {
            q: parsed.data.q ?? "",
            groupId: parsed.data.group_id ?? "",
            sort: parsed.data.sort,
            order: parsed.data.order,
            page: parsed.data.page,
            pageSize: parsed.data.pageSize,
          }
        : DEFAULT_OVERVIEW_FILTER,
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const d = DEFAULT_OVERVIEW_FILTER;
    const params = new URLSearchParams();
    const set = (key: string, value: string | number, def: string | number) => {
      if (value !== def && value !== "") params.set(key, String(value));
    };
    set("q", filter.q, d.q);
    set("group_id", filter.groupId, d.groupId);
    set("sort", filter.sort, d.sort);
    set("order", filter.order, d.order);
    set("page", filter.page, d.page);
    set("pageSize", filter.pageSize, d.pageSize);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [ready, filter, pathname, router]);

  return ready;
}

export type { OverviewFilter };
