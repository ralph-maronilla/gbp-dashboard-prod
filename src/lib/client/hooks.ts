"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HEARTBEAT_MS, idleState } from "@/lib/presence";
import { apiFetch } from "./api-client";
import { downloadFile, downloadReviewsCsv, type ExportParams } from "./export";
import type { Profile } from "@/lib/schemas/common";
import type { AutoExtractInput, AutoExtractSchedule, AutoExtractStatus } from "@/lib/schemas/auto-extract";
import type { SheetSyncStatus } from "@/lib/schemas/sheet-sync";
import type {
  AdminUser,
  AssignableOptions,
  ListUsersQuery,
  OnlineUser,
  SetUserLocationsInput,
  UpdateUserInput,
} from "@/lib/schemas/admin";
import type { ForgotPasswordInput, LoginInput, ResetPasswordInput, SignupInput } from "@/lib/schemas/auth";
import type { GroupSummary, ListLocationsQuery, LocationsPage, OverviewStats } from "@/lib/schemas/locations";
import type { Granularity, LocationDetail, ReviewsPage } from "@/lib/schemas/location-detail";
import type { DashboardData } from "@/lib/schemas/dashboard";
import type { CompareInsights, CompareQuery, GroupByQuery, InsightsQuery, OverviewInsights, ReputationInsights, ThemeExportQuery, ThemeInsights, ThemeReviews, ThemeReviewsQuery, WithCompare } from "@/lib/schemas/insights";
import type { UpdateLocationInput } from "@/lib/schemas/export";
import type { GoogleRefreshSummary } from "@/lib/schemas/google-refresh";
import type { AddLocationsInput, AddLocationsResult } from "@/lib/schemas/serper";
import type {
  ExtractLocationRow,
  ExtractRequest,
  ExtractStatusDto,
  ListReviewsQuery,
  ReviewsPage as SheetReviewsPage,
  SyncSummaryDto,
} from "@/lib/schemas/extract";

export const queryKeys = {
  me: ["me"] as const,
  users: (q: Partial<ListUsersQuery>) => ["admin", "users", q] as const,
  usersAll: ["admin", "users"] as const,
  assignable: ["admin", "assignable"] as const,
  online: ["admin", "online"] as const,
  locations: (q: Partial<ListLocationsQuery>) => ["locations", q] as const,
  overview: ["stats", "overview"] as const,
  dashboard: (q: Partial<InsightsQuery>) => ["stats", "dashboard", q] as const,
  insights: (view: string, q: object) => ["stats", "insights", view, q] as const,
  groups: ["groups"] as const,
  extractLocations: ["extract", "locations"] as const,
  extractStatus: ["extract", "status"] as const,
  autoExtract: ["admin", "auto-extract"] as const,
  autoExtractSchedule: ["auto-extract", "schedule"] as const,
  sheetSync: ["admin", "sheet-sync"] as const,
  reviews: (q: Partial<ListReviewsQuery>) => ["reviews", q] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<Profile>("/api/me"),
    staleTime: 60_000,
    retry: false,
  });
}

export function useAdminUsers(q: Partial<ListUsersQuery>) {
  return useQuery({
    queryKey: queryKeys.users(q),
    queryFn: () => apiFetch<{ rows: AdminUser[]; total: number; user_daily_credit_limit: number }>("/api/admin/users", { query: q }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/** Admins: who has been active in the last hour. Refreshed every 5 minutes and when the tab is shown again. */
export function useOnlineUsers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.online,
    queryFn: () => apiFetch<{ active: OnlineUser[] }>("/api/admin/online"),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/**
 * Tells the server this person has the app open: on load, then once an hour while the tab is visible (a tab that comes
 * back after more than an hour reports straight away). Failures are ignored; presence is never worth an error message.
 */
export function useHeartbeat() {
  const path = usePathname();
  const last = useRef(0);
  const current = useRef(path);
  useEffect(() => {
    current.current = path;
  });
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < HEARTBEAT_MS) return;
      last.current = Date.now();
      apiFetch("/api/me/heartbeat", { method: "POST", body: { path: current.current }, skipAuthRedirect: true }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 5 * 60_000); // cheap check; only reports once an hour has passed
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
}

export function useAssignableOptions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.assignable,
    queryFn: () => apiFetch<AssignableOptions>("/api/admin/assignable"),
    enabled,
    staleTime: 60_000,
  });
}

/** A mutation that re-reads the admin user list when it settles. */
function useUserMutation<I>(mutationFn: (input: I) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn, onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.usersAll }) });
}

export const useUpdateUser = () =>
  useUserMutation(({ id, input }: { id: string; input: UpdateUserInput }) => apiFetch<unknown>(`/api/admin/users/${id}`, { method: "PATCH", body: input }));

export const useSetUserLocations = () =>
  useUserMutation(({ id, input }: { id: string; input: SetUserLocationsInput }) => apiFetch<unknown>(`/api/admin/users/${id}/locations`, { method: "PUT", body: input }));

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch<{ ok: true }>("/api/auth/login", { method: "POST", body: input, skipAuthRedirect: true }),
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (input: SignupInput) =>
      apiFetch<{ requires_email_confirmation: boolean }>("/api/auth/signup", {
        method: "POST",
        body: input,
        skipAuthRedirect: true,
      }),
  });
}

export const useForgotPassword = () =>
  useMutation({ mutationFn: (input: ForgotPasswordInput) => apiFetch<{ ok: true }>("/api/auth/forgot", { method: "POST", body: input, skipAuthRedirect: true }) });

export const useResetPassword = () =>
  useMutation({ mutationFn: (input: ResetPasswordInput) => apiFetch<{ ok: true }>("/api/auth/reset-password", { method: "POST", body: input }) });

/** Signs out on the server, then opens the login page (`reason` "idle" makes it say why). */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (_reason?: "idle") => apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    onSuccess: (_data, reason) => {
      qc.clear();
      window.location.assign(reason ? `/login?reason=${reason}` : "/login");
    },
  });
}

const ACTIVITY_KEY = "last-activity";
let memoryActivity = Date.now(); // used when localStorage is unavailable (private mode, blocked storage)

function readActivity(): number {
  try {
    const v = Number(localStorage.getItem(ACTIVITY_KEY));
    return v > 0 ? Math.max(v, memoryActivity) : memoryActivity;
  } catch {
    return memoryActivity;
  }
}

function writeActivity(at: number) {
  memoryActivity = at;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // storage blocked: this tab still tracks its own activity
  }
}

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "wheel", "touchstart"] as const;

/**
 * Signs the user out after IDLE_LIMIT_MS (1 hour) without activity, and returns `warning` shortly before so the page can
 * ask "Still there?". Activity in any tab counts for all of them (shared through localStorage). On return from sleep the
 * check runs before anything else, so an expired session is closed instead of showing data.
 */
export function useIdleLogout() {
  const logout = useLogout();
  const [warning, setWarning] = useState(false);
  const mutate = useRef(logout.mutate);
  useEffect(() => {
    mutate.current = logout.mutate;
  });
  const done = useRef(false);
  const lastWrite = useRef(0);

  const check = useCallback(() => {
    if (done.current) return;
    const state = idleState(readActivity());
    setWarning(state === "warn");
    if (state === "expired") {
      done.current = true;
      mutate.current("idle", { onError: () => window.location.assign("/login?reason=idle") });
    }
  }, []);

  const touch = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite.current < 30_000) return; // at most one write per 30 s
    lastWrite.current = now;
    writeActivity(now);
    setWarning(false);
  }, []);

  useEffect(() => {
    touch(true);
    const onActivity = () => touch();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      check(); // first: the laptop may have slept past the limit
      if (!done.current) touch(true);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY) check();
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    const timer = setInterval(check, 15_000);
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      clearInterval(timer);
    };
  }, [check, touch]);

  return {
    warning,
    stay: () => touch(true),
    signOut: () => {
      done.current = true;
      mutate.current(undefined);
    },
  };
}

export function useLocations(q: Partial<ListLocationsQuery>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.locations(q),
    queryFn: () => apiFetch<LocationsPage>("/api/locations", { query: q }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useOverviewStats() {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => apiFetch<OverviewStats>("/api/stats/overview"),
    staleTime: 30_000,
  });
}

/** How often an open Dashboard re-reads its figures. */
const DASHBOARD_REFRESH_MS = 5 * 60_000;

/** Reviews can arrive from an extraction run by another user: refetch on return to the tab and every 5 minutes while visible. */
const LIVE_QUERY = {
  placeholderData: keepPreviousData,
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  refetchInterval: DASHBOARD_REFRESH_MS,
  refetchIntervalInBackground: false,
} as const;

type Params = Record<string, string | number | undefined>;

export function useDashboard(q: Partial<InsightsQuery>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard(q),
    queryFn: () => apiFetch<WithCompare<DashboardData>>("/api/stats/dashboard", { query: q as Params }),
    ...LIVE_QUERY,
    enabled,
  });
}

function useInsights<T>(view: "overview" | "reputation" | "themes" | "compare", q: object, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.insights(view, q),
    queryFn: () => apiFetch<T>(`/api/insights/${view}`, { query: q as Params }),
    ...LIVE_QUERY,
    enabled,
  });
}
export const useOverviewInsights = (q: Partial<InsightsQuery>, enabled = true) => useInsights<WithCompare<OverviewInsights>>("overview", q, enabled);
export const useReputationInsights = (q: Partial<GroupByQuery>, enabled = true) => useInsights<WithCompare<ReputationInsights>>("reputation", q, enabled);
export const useCompareInsights = (q: Partial<CompareQuery>, enabled = true) => useInsights<CompareInsights>("compare", q, enabled);
export const useThemeInsights = (q: Partial<GroupByQuery>, enabled = true) => useInsights<WithCompare<ThemeInsights>>("themes", q, enabled);

/** Reviews that mention one theme, by location (Review Intelligence drawer). */
export function useThemeReviews(q: Partial<ThemeReviewsQuery>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.insights("themes/reviews", q),
    queryFn: () => apiFetch<ThemeReviews>("/api/insights/themes/reviews", { query: q as Params }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

/** One location's next page in the Review Intelligence drawer (`offset` past the reviews already shown). */
export function useMoreThemeReviews() {
  return useMutation({
    mutationFn: (q: Partial<ThemeReviewsQuery>) => apiFetch<ThemeReviews>("/api/insights/themes/reviews", { query: q as Params }),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => apiFetch<GroupSummary[]>("/api/groups"),
    staleTime: 60_000,
  });
}

/** Everything that shows review data or location state; refreshed after extraction or location edits. */
function useInvalidateReviewData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["extract"] }),
      qc.invalidateQueries({ queryKey: ["reviews"] }),
      qc.invalidateQueries({ queryKey: ["locations"] }),
      qc.invalidateQueries({ queryKey: ["stats"] }),
      qc.invalidateQueries({ queryKey: ["groups"] }),
      qc.invalidateQueries({ queryKey: ["location"] }),
      qc.invalidateQueries({ queryKey: ["location-reviews"] }),
      qc.invalidateQueries({ queryKey: queryKeys.assignable }),
    ]);
}

export function useExtractLocations(refetchInterval: number | false = false) {
  return useQuery({
    queryKey: queryKeys.extractLocations,
    queryFn: () => apiFetch<ExtractLocationRow[]>("/api/extract/locations"),
    staleTime: 10_000,
    refetchInterval,
  });
}

/** Everyone: whether automatic extraction is on and its time. */
export function useAutoExtractSchedule(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.autoExtractSchedule,
    queryFn: () => apiFetch<AutoExtractSchedule>("/api/auto-extract/schedule"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Admin: automatic extraction settings and status (refreshed every minute while shown). */
export function useAutoExtract(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.autoExtract,
    queryFn: () => apiFetch<AutoExtractStatus>("/api/admin/auto-extract"),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useSaveAutoExtract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutoExtractInput) => apiFetch<AutoExtractStatus>("/api/admin/auto-extract", { method: "PUT", body: input }),
    onSuccess: (data) => qc.setQueryData(queryKeys.autoExtract, data),
  });
}

/** Admin: the Google Sheet mirror of the reviews (configured, last synced, pending, last error). */
export function useSheetSync(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.sheetSync,
    queryFn: () => apiFetch<SheetSyncStatus>("/api/admin/sheet-sync"),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

/** Admin: write the Google Sheet now. */
export function useSyncSheetNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<SheetSyncStatus>("/api/admin/sheet-sync", { method: "POST", body: {} }),
    onSuccess: (data) => qc.setQueryData(queryKeys.sheetSync, data),
    // A failure is recorded on the server too: show its message in the block.
    onError: () => void qc.invalidateQueries({ queryKey: queryKeys.sheetSync }),
  });
}

export function useExtractStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.extractStatus,
    queryFn: () => apiFetch<ExtractStatusDto>("/api/extract/status"),
    enabled,
    staleTime: 10_000,
    retry: false,
  });
}

/** One extraction slice (≤45 s). The extraction panel calls it repeatedly while work remains. */
export function useExtractSlice() {
  return useMutation({
    mutationFn: (input: ExtractRequest) => apiFetch<SyncSummaryDto>("/api/extract", { method: "POST", body: input }),
  });
}

export function useInvalidateAfterExtract() {
  return useInvalidateReviewData();
}

export function useReviews(q: Partial<ListReviewsQuery>) {
  return useQuery({
    queryKey: queryKeys.reviews(q),
    queryFn: () => apiFetch<SheetReviewsPage>("/api/reviews", { query: q as Params }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/** Review Intelligence Excel workbook (Summary + one tab per location) for the given filters. */
export function useExportThemes() {
  return useMutation({
    mutationFn: (params: Partial<ThemeExportQuery>) => downloadFile("/api/insights/themes/export", params as Params, "review-intelligence.xlsx"),
  });
}

/** Reviews CSV for the given filters; `fileName` (from safeFileName) replaces the server's name. */
export function useExportReviews() {
  return useMutation({ mutationFn: ({ fileName, ...params }: ExportParams & { fileName?: string | null }) => downloadReviewsCsv(params, fileName) });
}

/** A mutation that re-reads everything showing review data or location state when it settles. */
function useReviewDataMutation<I, O>(mutationFn: (input: I) => Promise<O>) {
  const invalidate = useInvalidateReviewData();
  return useMutation({ mutationFn, onSettled: invalidate });
}

export const useUpdateLocation = () =>
  useReviewDataMutation(({ id, input }: { id: string; input: UpdateLocationInput }) => apiFetch<{ id: string }>(`/api/admin/locations/${id}`, { method: "PATCH", body: input }));

export const useDeleteLocation = () =>
  useReviewDataMutation((id: string) => apiFetch<{ name: string; reviews_deleted: number }>(`/api/admin/locations/${id}`, { method: "DELETE" }));

export const useAddLocations = () =>
  useReviewDataMutation((input: AddLocationsInput) => apiFetch<AddLocationsResult>("/api/admin/locations", { method: "POST", body: input }));

export const useGoogleRefresh = () =>
  useReviewDataMutation((location_ids: string[] | undefined) =>
    apiFetch<GoogleRefreshSummary>("/api/admin/locations/google-refresh", { method: "POST", body: location_ids ? { location_ids } : {} }),
  );

export const useAutofillRegions = () =>
  useReviewDataMutation(() => apiFetch<{ set: { id: string; name: string; region: string }[] }>("/api/admin/locations/autofill-regions", { method: "POST", body: {} }));

export function useLocationDetail(id: string, granularity: Granularity, enabled = true) {
  return useQuery({
    queryKey: ["location", id, granularity] as const,
    queryFn: () => apiFetch<LocationDetail>(`/api/locations/${id}`, { query: { granularity } }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export interface ReviewFilterParams {
  rating?: string;
  status?: string;
  from?: string;
  to?: string;
  q?: string;
}

export function useLocationReviews(id: string, filter: ReviewFilterParams, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["location-reviews", id, filter] as const,
    queryFn: ({ pageParam }) =>
      apiFetch<ReviewsPage>(`/api/locations/${id}/reviews`, { query: { ...filter, cursor: pageParam, limit: 20 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled,
    staleTime: 30_000,
  });
}
