"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RefreshIcon from "@mui/icons-material/Refresh";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import type { ReactNode } from "react";
import { CompareSection, compareMonthOptions } from "@/components/dashboard/compare-section";
import { IntelligenceTab } from "@/components/dashboard/intelligence-tab";
import {
  OverviewTab,
  type OverviewSource,
} from "@/components/dashboard/overview-tab";
import {
  ReputationTab,
  type Granularity,
} from "@/components/dashboard/reputation-tab";
import { SentimentTab } from "@/components/dashboard/sentiment-tab";
import { ThemeReviewsDrawer } from "@/components/dashboard/theme-reviews-drawer";
import { NoAccess } from "@/components/no-access";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { RetryAlert } from "@/components/ui/retry-alert";
import {
  SelectField,
  groupOptions,
  type Option,
} from "@/components/ui/select-field";
import { ApiClientError } from "@/lib/client/api-client";
import {
  useCompareInsights,
  useDashboard,
  useExtractLocations,
  useGroups,
  useOverviewInsights,
  useReputationInsights,
  useThemeInsights,
} from "@/lib/client/hooks";
import {
  ISLAND_GROUPS,
  regionIsland,
  regionName,
  REGION_CODES,
} from "@/lib/ph-regions";
import { THEME_KEYS, themeByKey, type ThemeKey } from "@/lib/insights/themes";
import {
  GROUP_BYS,
  INSIGHT_PERIODS,
  LAST_MONTH,
  THEME_SENTIMENTS,
  UNASSIGNED,
  type GroupBy,
  type ThemeSentimentFilter,
} from "@/lib/schemas/insights";

type TabKey = "overview" | "reputation" | "sentiment" | "intelligence";
/** Tabs shown in the bar. Month comparison lives in Review Overview (the "Compare months" filter). */
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Review Overview" },
  { key: "reputation", label: "Reputation" },
  { key: "sentiment", label: "Sentiment" },
  { key: "intelligence", label: "Review Intelligence" },
];

interface State {
  tab: TabKey;
  months: number;
  group_id: string;
  region: string;
  island: string;
  location_type: string;
  location_id: string;
  /** Reputation group table rows. */
  group_by: GroupBy;
  /** Review Intelligence heatmap rows. */
  heat_by: GroupBy;
  granularity: Granularity;
  /** Review Overview figures; "" = automatic (Google when every location has Google totals). */
  source: "" | OverviewSource;
  /** Review Overview: "Compare months" ticked, showing the month comparison under the overview. */
  compare: boolean;
  /** Compared months ("YYYY-MM"); "" = the last full month and the one before it. */
  cmp_a: string;
  cmp_b: string;
  /** Review Intelligence: the theme whose reviews are open in the side panel ("" = closed) and their sentiment filter. */
  theme: "" | ThemeKey;
  theme_s: ThemeSentimentFilter;
}
const DEFAULTS: State = {
  tab: "overview",
  months: 12,
  group_id: "",
  region: "",
  island: "",
  location_type: "",
  location_id: "",
  group_by: "area",
  heat_by: "segment",
  granularity: "auto",
  source: "",
  compare: false,
  cmp_a: "",
  cmp_b: "",
  theme: "",
  theme_s: "all",
};
const GRANULARITIES: Granularity[] = ["auto", "month", "quarter", "year"];
const SOURCES: OverviewSource[] = ["google", "extracted"];
/** Query-string name of each filter (the rest of the state is not in the URL). */
const URL_KEYS: Record<keyof State, string> = {
  tab: "tab",
  months: "months",
  group_id: "group_id",
  region: "region",
  island: "island",
  location_type: "type",
  location_id: "location_id",
  group_by: "group_by",
  heat_by: "heat_by",
  granularity: "buckets",
  source: "source",
  compare: "compare",
  cmp_a: "a",
  cmp_b: "b",
  theme: "theme",
  theme_s: "theme_s",
};
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const oneOf = <T extends string>(
  values: readonly T[],
  value: string | null,
  fallback: T,
): T =>
  (values as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

function parseState(p: URLSearchParams): State {
  const months = Number(p.get("months"));
  const text = (k: keyof State) => p.get(URL_KEYS[k]) ?? "";
  // Links from when Compare was its own tab open the Review Overview with Compare months ticked.
  const oldCompareTab = p.get("tab") === "compare";
  return {
    tab: oneOf(
      TABS.map((t) => t.key),
      p.get("tab"),
      DEFAULTS.tab,
    ),
    compare: oldCompareTab || p.get("compare") === "1",
    months:
      p.has("months") && (INSIGHT_PERIODS as readonly number[]).includes(months)
        ? months
        : DEFAULTS.months,
    group_id: text("group_id"),
    region: text("region"),
    island: text("island"),
    location_type: text("location_type"),
    location_id: text("location_id"),
    group_by: oneOf(GROUP_BYS, p.get("group_by"), DEFAULTS.group_by),
    heat_by: oneOf(GROUP_BYS, p.get("heat_by"), DEFAULTS.heat_by),
    granularity: oneOf(GRANULARITIES, p.get("buckets"), DEFAULTS.granularity),
    source: oneOf(SOURCES, p.get("source"), ""),
    cmp_a: MONTH.test(text("cmp_a")) ? text("cmp_a") : "",
    cmp_b: MONTH.test(text("cmp_b")) ? text("cmp_b") : "",
    theme: oneOf(THEME_KEYS, p.get("theme"), ""),
    theme_s: oneOf(THEME_SENTIMENTS, p.get("theme_s"), DEFAULTS.theme_s),
  };
}

/** Tab and filters start from the URL and are written back to it (shareable, reload-safe). */
function useDashboardState() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>(() =>
    parseState(new URLSearchParams(searchParams.toString())),
  );

  useEffect(() => {
    const p = new URLSearchParams();
    for (const k of Object.keys(URL_KEYS) as (keyof State)[]) {
      // The compared months only matter while Compare months is ticked (they are kept for when it is ticked again).
      if ((k === "cmp_a" || k === "cmp_b") && !state.compare) continue;
      if (state[k] !== DEFAULTS[k])
        p.set(URL_KEYS[k], typeof state[k] === "boolean" ? "1" : String(state[k]));
    }
    const qs = p.toString();
    // Native history API (Next keeps useSearchParams in sync with it): no router navigation, so it cannot run before
    // the App Router is initialised (dev Fast Refresh) and does not refetch the page. Skipped when the URL already matches.
    if (window.location.search.replace(/^\?/, "") !== qs)
      window.history.replaceState(
        window.history.state,
        "",
        qs ? `${pathname}?${qs}` : pathname,
      );
  }, [state, pathname]);

  return {
    state,
    set: (patch: Partial<State>) => setState((s) => ({ ...s, ...patch })),
  };
}

function Loading() {
  return (
    <LoadingOverlay active>
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={96} />
        <Skeleton variant="rounded" height={360} />
      </Stack>
    </LoadingOverlay>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function DashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardView />
    </Suspense>
  );
}

function DashboardView() {
  const { state, set } = useDashboardState();
  const groups = useGroups();
  const locations = useExtractLocations();

  const filters = {
    months: state.months,
    group_id: state.group_id || undefined,
    region: state.region || undefined,
    island: (state.island || undefined) as
      | "Luzon"
      | "Visayas"
      | "Mindanao"
      | undefined,
    location_type: state.location_type || undefined,
    location_id: state.location_id || undefined,
  };
  const overview = useOverviewInsights(filters, state.tab === "overview");
  const comparing = state.tab === "overview" && state.compare;
  const reputation = useReputationInsights(
    { ...filters, group_by: state.group_by },
    state.tab === "reputation",
  );
  const charts = useDashboard(
    { ...filters, granularity: state.granularity },
    state.tab === "reputation",
  );
  const compare = useCompareInsights(
    {
      group_id: filters.group_id,
      region: filters.region,
      island: filters.island,
      location_type: filters.location_type,
      location_id: filters.location_id,
      a: state.cmp_a || undefined,
      b: state.cmp_b || undefined,
    },
    comparing,
  );
  const themes = useThemeInsights(
    { ...filters, group_by: state.heat_by },
    state.tab === "sentiment" || state.tab === "intelligence",
  );

  // Region and Type choices come from the locations the user can see.
  const options = useMemo(() => {
    const rows = locations.data ?? [];
    const distinct = (vals: (string | null)[]) =>
      [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) =>
        a.localeCompare(b),
      );
    return {
      regions: REGION_CODES.filter((c) => rows.some((l) => l.region === c)),
      islands: ISLAND_GROUPS.filter((i) =>
        rows.some((l) => regionIsland(l.region) === i),
      ),
      types: distinct(rows.map((l) => l.location_type)),
      hasUnassignedRegion: rows.some((l) => !l.region),
      hasUnassignedType: rows.some((l) => !l.location_type),
    };
  }, [locations.data]);

  // Old figures stay on screen while a changed filter loads: dim them and show a spinner.
  const active = {
    overview,
    reputation,
    sentiment: themes,
    intelligence: themes,
  }[state.tab];
  const busy = state.tab === "reputation" ? reputation.isPlaceholderData || charts.isPlaceholderData : active.isPlaceholderData;
  // Pin both months once the user changes one, so the other does not move with the defaults.
  const compareMonths = (p: { a?: string; b?: string }) =>
    compare.data &&
    set({ cmp_a: p.a ?? compare.data.a.month, cmp_b: p.b ?? compare.data.b.month });
  if (active.error instanceof ApiClientError && active.error.isForbidden)
    return <NoAccess />;

  let body: ReactNode;
  if (active.isError) {
    body = (
      <RetryAlert what="this view" onRetry={() => void active.refetch()} />
    );
  } else if (state.tab === "overview") {
    const autoSource: OverviewSource =
      overview.data &&
      overview.data.google.refreshed > 0 &&
      overview.data.google.refreshed === overview.data.profiles
        ? "google"
        : "extracted";
    body = overview.data ? (
      <OverviewTab
        data={overview.data}
        source={state.source || autoSource}
        onSource={(s) => set({ source: s })}
      />
    ) : (
      <Loading />
    );
    if (comparing)
      body = (
        <Stack spacing={3}>
          {body}
          {compare.isError ? (
            <RetryAlert what="the month comparison" onRetry={() => void compare.refetch()} />
          ) : compare.data ? (
            <LoadingOverlay active={compare.isPlaceholderData}>
              <CompareSection data={compare.data} />
            </LoadingOverlay>
          ) : (
            <Loading />
          )}
        </Stack>
      );
  } else if (state.tab === "reputation") {
    body = reputation.data ? (
      <ReputationTab
        data={reputation.data}
        charts={charts.data}
        groupBy={state.group_by}
        onGroupBy={(g) => set({ group_by: g })}
        granularity={state.granularity}
        onGranularity={(g) => set({ granularity: g })}
      />
    ) : (
      <Loading />
    );
  } else if (state.tab === "sentiment") {
    body = themes.data ? <SentimentTab data={themes.data} /> : <Loading />;
  } else {
    body = themes.data ? (
      <IntelligenceTab
        data={themes.data}
        groupBy={state.heat_by}
        onGroupBy={(g) => set({ heat_by: g })}
        // Issue themes open on their complaints, Positive Commendations on its praise.
        exportParams={filters}
        onTheme={(key) => set({ theme: key, theme_s: themeByKey.get(key)?.kind === "commendation" ? "positive" : "negative" })}
      />
    ) : (
      <Loading />
    );
  }

  const withAll = (
    all: string,
    values: Option[],
    unassigned = false,
  ): Option[] => [
    { value: "", label: all },
    ...values,
    ...(unassigned ? [{ value: UNASSIGNED, label: "Unassigned" }] : []),
  ];
  const named = (v: string) => ({ value: v, label: v });
  const periodLabel = (m: number) =>
    m === 0 ? "All time" : m === LAST_MONTH ? "Last month" : `Last ${m} months`;
  const periods: Option[] = INSIGHT_PERIODS.map((m) => ({
    value: String(m),
    label: periodLabel(m),
  }));
  const filterFields: [
    label: string,
    key: "group_id" | "region" | "island" | "location_type" | "location_id",
    options: Option[],
    width: number,
  ][] = [
    ["Client", "group_id", groupOptions(groups.data, "All clients"), 180],
    [
      "Region",
      "region",
      withAll(
        "All regions",
        options.regions.map((r) => ({ value: r, label: regionName(r) ?? r })),
        options.hasUnassignedRegion,
      ),
      200,
    ],
    ["Island group", "island", withAll("All", options.islands.map(named)), 150],
    [
      "Type",
      "location_type",
      withAll("All types", options.types.map(named), options.hasUnassignedType),
      160,
    ],
    [
      "Location",
      "location_id",
      withAll(
        "All locations",
        (locations.data ?? []).map((l) => ({ value: l.id, label: l.name })),
      ),
      240,
    ],
  ];

  return (
    <Stack spacing={2.5}>
      <Stack
        direction="row"
        useFlexGap
        spacing={2}
        sx={{
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <Typography variant="h5" component="h1">
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Google Business Profile reputation across your locations.
          </Typography>
        </div>
        {active.dataUpdatedAt > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Typography
              variant="caption"
              color="text.secondary"
              aria-live="polite"
            >
              Updated{" "}
              {new Date(active.dataUpdatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Typography>
            {active.isFetching ? (
              <CircularProgress
                size={16}
                aria-label="Refreshing"
                sx={{ m: "4px" }}
              />
            ) : (
              <Tooltip title="Refresh now">
                <IconButton
                  size="small"
                  aria-label="Refresh now"
                  onClick={() => {
                    void active.refetch();
                    if (comparing) void compare.refetch();
                  }}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" useFlexGap spacing={2} sx={{ flexWrap: "wrap" }}>
          <SelectField
            label="Period"
            value={String(state.months)}
            options={periods}
            width={160}
            onChange={(v) => set({ months: Number(v) })}
          />
          {filterFields.map(([label, key, opts, width]) => (
            <SelectField
              key={key}
              label={label}
              value={state[key]}
              options={opts}
              width={width}
              onChange={(v) => set({ [key]: v })}
            />
          ))}
          {state.tab === "overview" && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={state.compare}
                  onChange={(e) => set({ compare: e.target.checked })}
                />
              }
              label="Compare months"
            />
          )}
        </Stack>
        {comparing && (
          <Stack
            direction="row"
            useFlexGap
            spacing={2}
            sx={{ alignItems: "center", flexWrap: "wrap", mt: 2 }}
          >
            {/* Until the first comparison loads there are no month choices: the fields wait, disabled. */}
            <SelectField
              label="Month"
              value={compare.data?.a.month ?? ""}
              options={compareMonthOptions(compare.data, compare.data?.b.month ?? "")}
              width={200}
              disabled={!compare.data}
              onChange={(a) => compareMonths({ a })}
            />
            <Typography color="text.secondary">compared with</Typography>
            <SelectField
              label="Compared with"
              value={compare.data?.b.month ?? ""}
              options={compareMonthOptions(compare.data, compare.data?.a.month ?? "")}
              width={200}
              disabled={!compare.data}
              onChange={(b) => compareMonths({ b })}
            />
            <Tooltip title="Swap the two months">
              <span>
                <IconButton
                  aria-label="Swap the two months"
                  disabled={!compare.data}
                  onClick={() =>
                    compare.data &&
                    compareMonths({ a: compare.data.b.month, b: compare.data.a.month })
                  }
                >
                  <SwapHorizIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="caption" color="text.secondary">
              The comparison below uses these two months, not Period.
            </Typography>
          </Stack>
        )}
      </Paper>

      <Tabs
        value={state.tab}
        onChange={(_e, v: TabKey) => set({ tab: v })}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Dashboard views"
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      <LoadingOverlay active={busy}>{body}</LoadingOverlay>

      <ThemeReviewsDrawer
        theme={state.tab === "intelligence" && state.theme ? state.theme : null}
        sentiment={state.theme_s}
        onSentiment={(s) => set({ theme_s: s })}
        onClose={() => set({ theme: "", theme_s: DEFAULTS.theme_s })}
        filters={filters}
        period={periodLabel(state.months)}
      />
    </Stack>
  );
}
