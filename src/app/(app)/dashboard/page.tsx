"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { ReactNode } from "react";
import { PeriodPicker, selectionLabel, type PeriodSelection } from "@/components/dashboard/period-picker";
import { CompareSection } from "@/components/dashboard/compare-section";
import { CompareLabel } from "@/components/dashboard/change-text";
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
  COMPARE_MODE_KEYS,
  RANGE_PRESET_KEYS,
  isDay,
  lastOfMonth,
  presetForMonths,
  type CompareMode,
  type RangePreset,
} from "@/lib/insights/date-ranges";
import {
  GROUP_BYS,
  THEME_SENTIMENTS,
  UNASSIGNED,
  type GroupBy,
  type ThemeSentimentFilter,
} from "@/lib/schemas/insights";

type TabKey = "overview" | "reputation" | "sentiment" | "intelligence";
/** Tabs shown in the bar. The comparison (Period → Compare to) shows in Review Overview. */
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Review Overview" },
  { key: "reputation", label: "Reputation" },
  { key: "sentiment", label: "Sentiment" },
  { key: "intelligence", label: "Review Intelligence" },
];

interface State {
  tab: TabKey;
  /** The Period (PeriodPicker): a preset, or "" with custom `from`-`to` days. */
  period: "" | RangePreset;
  from: string;
  to: string;
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
  /** "Compare to" ticked in the Period: the comparison shows under Review Overview and the Reputation highlights use it.
   *  Compared with the previous period, the same period last year, or custom `vs_from`-`vs_to`. */
  compare: boolean;
  vs: CompareMode;
  vs_from: string;
  vs_to: string;
  /** Review Intelligence: the theme whose reviews are open in the side panel ("" = closed) and their sentiment filter. */
  theme: "" | ThemeKey;
  theme_s: ThemeSentimentFilter;
}
const DEFAULTS: State = {
  tab: "overview",
  period: "all",
  from: "",
  to: "",
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
  vs: "previous",
  vs_from: "",
  vs_to: "",
  theme: "",
  theme_s: "all",
};
const GRANULARITIES: Granularity[] = ["auto", "month", "quarter", "year"];
const SOURCES: OverviewSource[] = ["google", "extracted"];
/** Query-string name of each filter (the rest of the state is not in the URL). */
const URL_KEYS: Record<keyof State, string> = {
  tab: "tab",
  period: "period",
  from: "from",
  to: "to",
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
  vs: "vs",
  vs_from: "vs_from",
  vs_to: "vs_to",
  theme: "theme",
  theme_s: "theme_s",
};
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** The comparison's state keys, only in the URL while Compare is ticked. */
const COMPARE_KEYS = new Set<keyof State>(["vs", "vs_from", "vs_to"]);

type PeriodState = Pick<State, "period" | "from" | "to" | "compare" | "vs" | "vs_from" | "vs_to">;

/**
 * Period and comparison from the URL. Older links still open: `months=12` (the old Period list), a comparison's
 * `range` / `from` / `to` (they become the period), and two months `a=2026-10&b=2026-09` (October vs September).
 */
function parsePeriod(p: URLSearchParams): PeriodState {
  const day = (k: string) => (isDay(p.get(k) ?? "") ? (p.get(k) as string) : "");
  const [a, b] = [p.get("a") ?? "", p.get("b") ?? ""];
  if (MONTH.test(a) && MONTH.test(b) && !p.has("period") && !p.has("from"))
    return { period: "", from: `${a}-01`, to: lastOfMonth(`${a}-01`), compare: true, vs: "custom", vs_from: `${b}-01`, vs_to: lastOfMonth(`${b}-01`) };
  const [from, to, vsFrom, vsTo] = [day("from"), day("to"), day("vs_from"), day("vs_to")];
  const custom = !!from && !!to && from <= to;
  const preset =
    oneOf(["", ...RANGE_PRESET_KEYS], p.get("period") ?? p.get("range"), "") ||
    (p.has("months") ? presetForMonths(Number(p.get("months"))) : undefined) ||
    DEFAULTS.period;
  const vs = oneOf(COMPARE_MODE_KEYS, p.get("vs"), DEFAULTS.vs);
  const customVs = !!vsFrom && !!vsTo && vsFrom <= vsTo;
  const period = custom ? "" : preset;
  return {
    period,
    from: custom ? from : "",
    to: custom ? to : "",
    // All time has nothing to compare with; a custom comparison without valid dates falls back to the previous period.
    compare: p.get("compare") === "1" && period !== "all",
    vs: vs === "custom" && !customVs ? "previous" : vs,
    vs_from: vs === "custom" && customVs ? vsFrom : "",
    vs_to: vs === "custom" && customVs ? vsTo : "",
  };
}

const oneOf = <T extends string>(
  values: readonly T[],
  value: string | null,
  fallback: T,
): T =>
  (values as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

function parseState(p: URLSearchParams): State {
  const text = (k: keyof State) => p.get(URL_KEYS[k]) ?? "";
  return {
    tab: oneOf(
      TABS.map((t) => t.key),
      p.get("tab"),
      DEFAULTS.tab,
    ),
    ...parsePeriod(p),
    group_id: text("group_id"),
    region: text("region"),
    island: text("island"),
    location_type: text("location_type"),
    location_id: text("location_id"),
    group_by: oneOf(GROUP_BYS, p.get("group_by"), DEFAULTS.group_by),
    heat_by: oneOf(GROUP_BYS, p.get("heat_by"), DEFAULTS.heat_by),
    granularity: oneOf(GRANULARITIES, p.get("buckets"), DEFAULTS.granularity),
    source: oneOf(SOURCES, p.get("source"), ""),
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
      // The comparison only matters while Compare is ticked (it is kept for when it is ticked again).
      if (COMPARE_KEYS.has(k) && !state.compare) continue;
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

  // The period as the API takes it; the comparison only while Compare is ticked (All time has none).
  const comparing = state.compare && state.period !== "all";
  const vsParams = comparing
    ? { vs: state.vs, vs_from: state.vs_from || undefined, vs_to: state.vs_to || undefined }
    : {};
  const filters = {
    ...(state.period ? { range: state.period } : { from: state.from, to: state.to }),
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
  // With Compare to, every tab also gets the same figures for the compared dates (`compare` in each response).
  const overview = useOverviewInsights({ ...filters, ...vsParams }, state.tab === "overview");
  const reputation = useReputationInsights(
    { ...filters, ...vsParams, group_by: state.group_by },
    state.tab === "reputation",
  );
  const charts = useDashboard(
    { ...filters, ...vsParams, granularity: state.granularity },
    state.tab === "reputation",
  );
  const compare = useCompareInsights({ ...filters, ...vsParams }, state.tab === "overview" && comparing);
  const themes = useThemeInsights(
    { ...filters, ...vsParams, group_by: state.heat_by },
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
  // The compared dates as the server resolved them; null while Compare to is off (or still loading).
  const compared = comparing ? active.data?.compare : null;
  const compareLabel = compared?.label ?? null;
  const compareCtx = useMemo(() => (compareLabel ? { label: compareLabel, sameLength: compared?.same_length ?? true } : null), [compareLabel, compared?.same_length]);
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
            <RetryAlert what="the comparison" onRetry={() => void compare.refetch()} />
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
  const selection: PeriodSelection = {
    period: state.period,
    from: state.from,
    to: state.to,
    compare: comparing,
    vs: state.vs,
    vsFrom: state.vs_from,
    vsTo: state.vs_to,
  };
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
              <Tooltip title="Reloads the figures from the database. It does not fetch from Google or use credits.">
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

      <Paper variant="outlined" sx={{ p: 2 }} data-tour="dash-filters">
        <Stack direction="row" useFlexGap spacing={2} sx={{ flexWrap: "wrap" }}>
          <PeriodPicker
            value={selection}
            onApply={(s) =>
              set({ period: s.period, from: s.from, to: s.to, compare: s.compare, vs: s.vs, vs_from: s.vsFrom, vs_to: s.vsTo })
            }
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
        </Stack>
        {comparing && compareLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            Figures are for the Period; ▲ / ▼ show the change against {compareLabel} (green better, red worse; hover for the compared value).
            Both ranges are counted in full, so figures that otherwise use the last 30 or 90 days cover the whole period.
            {state.tab === "overview" ? " The side-by-side comparison is below." : ""}
          </Typography>
        )}
      </Paper>

      <Tabs
        value={state.tab}
        onChange={(_e, v: TabKey) => set({ tab: v })}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Dashboard views"
        data-tour="dash-tabs"
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      <CompareLabel.Provider value={compareCtx}>
        <LoadingOverlay active={busy}>{body}</LoadingOverlay>
      </CompareLabel.Provider>

      <ThemeReviewsDrawer
        theme={state.tab === "intelligence" && state.theme ? state.theme : null}
        sentiment={state.theme_s}
        onSentiment={(s) => set({ theme_s: s })}
        onClose={() => set({ theme: "", theme_s: DEFAULTS.theme_s })}
        filters={filters}
        period={selectionLabel(selection).period}
      />
    </Stack>
  );
}
