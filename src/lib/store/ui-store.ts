"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Status } from "@/lib/schemas/common";
import type { LocationSortField } from "@/lib/schemas/locations";
import type { Granularity } from "@/lib/schemas/location-detail";

export interface DetailFilter {
  ratings: number[];
  status: "all" | "replied" | "unanswered";
  from: string; // YYYY-MM-DD or ""
  to: string;
  q: string;
  granularity: Granularity;
}

export const DEFAULT_DETAIL_FILTER: DetailFilter = {
  ratings: [],
  status: "all",
  from: "",
  to: "",
  q: "",
  granularity: "month",
};

export interface OverviewFilter {
  q: string;
  groupId: string; // "" = all groups
  sort: LocationSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

export const DEFAULT_OVERVIEW_FILTER: OverviewFilter = {
  q: "",
  groupId: "",
  sort: "name",
  order: "asc",
  page: 0,
  pageSize: 25,
};

/** UI state only. Server data lives in React Query. */
interface UiState {
  themeMode: "light" | "dark";
  usersFilter: { status: Status | "all"; q: string };
  /** Overview grid filters. Mirrored to the URL query string; not persisted. */
  overviewFilter: OverviewFilter;
  /** True once the URL query string has been read into overviewFilter. */
  overviewReady: boolean;
  setOverviewFilter: (f: Partial<OverviewFilter>) => void;
  /** Location detail filters (reviews list + trend granularity). Mirrored to the URL; not persisted. */
  detailFilter: DetailFilter;
  detailReady: boolean;
  setDetailFilter: (f: Partial<DetailFilter>) => void;
  toggleTheme: () => void;
  setUsersFilter: (f: Partial<UiState["usersFilter"]>) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: "light",
      usersFilter: { status: "all", q: "" },
      overviewFilter: DEFAULT_OVERVIEW_FILTER,
      overviewReady: false,
      setOverviewFilter: (f) => set((s) => ({ overviewFilter: { ...s.overviewFilter, ...f } })),
      detailFilter: DEFAULT_DETAIL_FILTER,
      detailReady: false,
      setDetailFilter: (f) => set((s) => ({ detailFilter: { ...s.detailFilter, ...f } })),
      toggleTheme: () => set((s) => ({ themeMode: s.themeMode === "light" ? "dark" : "light" })),
      setUsersFilter: (f) => set((s) => ({ usersFilter: { ...s.usersFilter, ...f } })),
    }),
    {
      name: "ui-preferences",
      skipHydration: true, // rehydrated after mount to avoid SSR/client mismatch
      partialize: (s) => ({ themeMode: s.themeMode }),
    },
  ),
);
