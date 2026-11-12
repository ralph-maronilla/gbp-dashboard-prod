/**
 * Date ranges for the Dashboard comparison, like Google Analytics: presets ("Last 28 days"), custom ranges, and what to
 * compare with (the previous period, the same period last year, or a custom range). Days are "YYYY-MM-DD" strings in
 * the Dashboard's time zone (Manila); both ends are included. Pure, shared by the server and the calendar.
 */

export interface DayRange {
  from: string;
  to: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const parts = (day: string) => day.split("-").map(Number) as [number, number, number];
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const utc = (day: string) => {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d));
};

/** A real calendar day ("2026-02-30" is not). */
export const isDay = (s: string) => DAY.test(s) && fmt(utc(s)) === s;
export const addDays = (day: string, n: number) => fmt(new Date(utc(day).getTime() + n * 86_400_000));
/** Days in the range, both ends included. */
export const rangeDays = (r: DayRange) => Math.round((utc(r.to).getTime() - utc(r.from).getTime()) / 86_400_000) + 1;
export const firstOfMonth = (day: string) => `${day.slice(0, 7)}-01`;
/** First day of the month `n` months after `day`'s month. */
export function addMonths(day: string, n: number): string {
  const [y, m] = parts(day);
  return fmt(new Date(Date.UTC(y, m - 1 + n, 1)));
}
export const lastOfMonth = (day: string) => addDays(addMonths(day, 1), -1);
/** 0 = Sunday. */
export const weekday = (day: string) => utc(day).getUTCDay();

/**
 * The Dashboard's time zone in the browser, for showing what a preset covers. The server resolves every period again
 * with env.exportTimeZone (EXPORT_TIMEZONE, default the same), which is what the figures use.
 */
export const DASHBOARD_TIME_ZONE = "Asia/Manila";

/** Today in `timeZone`. */
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Monday of `day`'s week. */
export const weekStart = (day: string) => addDays(day, -((weekday(day) + 6) % 7));

/**
 * Period presets. "Last N days" end yesterday (today is not finished), as in Google Analytics; "Last N months" are the
 * current month and the N-1 before it, and "Last month" the whole previous month (the Dashboard's original Period
 * choices, kept so their figures do not change). `resolve` gives null for All time (no bounds). `group` places it in
 * the picker's Last / Current tabs; `months` marks the month presets (their previous period is whole months).
 */
const lastMonths = (n: number) => (t: string): DayRange => ({ from: addMonths(t, 1 - n), to: t });
export const RANGE_PRESETS = [
  { key: "all", label: "All time", group: "last", resolve: (): DayRange | null => null },
  { key: "yesterday", label: "Yesterday", group: "last", resolve: (t: string): DayRange | null => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { key: "last7", label: "Last 7 days", group: "last", resolve: (t: string): DayRange | null => ({ from: addDays(t, -7), to: addDays(t, -1) }) },
  { key: "last28", label: "Last 28 days", group: "last", resolve: (t: string): DayRange | null => ({ from: addDays(t, -28), to: addDays(t, -1) }) },
  { key: "last30", label: "Last 30 days", group: "last", resolve: (t: string): DayRange | null => ({ from: addDays(t, -30), to: addDays(t, -1) }) },
  { key: "last90", label: "Last 90 days", group: "last", resolve: (t: string): DayRange | null => ({ from: addDays(t, -90), to: addDays(t, -1) }) },
  { key: "last_month", label: "Last month", group: "last", months: 1, resolve: (t: string): DayRange | null => ({ from: addMonths(t, -1), to: addDays(firstOfMonth(t), -1) }) },
  { key: "last3m", label: "Last 3 months", group: "last", months: 3, resolve: lastMonths(3) },
  { key: "last6m", label: "Last 6 months", group: "last", months: 6, resolve: lastMonths(6) },
  { key: "last12m", label: "Last 12 months", group: "last", months: 12, resolve: lastMonths(12) },
  { key: "last24m", label: "Last 24 months", group: "last", months: 24, resolve: lastMonths(24) },
  { key: "last_year", label: "Last year", group: "last", resolve: (t: string): DayRange | null => ({ from: `${Number(t.slice(0, 4)) - 1}-01-01`, to: `${Number(t.slice(0, 4)) - 1}-12-31` }) },
  { key: "today", label: "Today", group: "current", resolve: (t: string): DayRange | null => ({ from: t, to: t }) },
  { key: "this_week", label: "This week", group: "current", resolve: (t: string): DayRange | null => ({ from: weekStart(t), to: t }) },
  { key: "this_month", label: "This month", group: "current", resolve: (t: string): DayRange | null => ({ from: firstOfMonth(t), to: t }) },
  { key: "this_year", label: "This year", group: "current", resolve: (t: string): DayRange | null => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["key"];
export const RANGE_PRESET_KEYS = RANGE_PRESETS.map((p) => p.key) as [RangePreset, ...RangePreset[]];
export const DEFAULT_RANGE: RangePreset = "all";
const presetOf = (key: RangePreset) => RANGE_PRESETS.find((p) => p.key === key)!;
/** Whole calendar months of a month preset (Last month, Last N months); null for the others. */
export const presetMonths = (key: RangePreset | null): number | null => (key ? ((presetOf(key) as { months?: number }).months ?? null) : null);

/** The Dashboard's original Period values (`months`: -1 = last month, 0 = all time) as presets, for old links. */
const LEGACY_MONTHS: Record<number, RangePreset> = { [-1]: "last_month", 0: "all", 3: "last3m", 6: "last6m", 12: "last12m", 24: "last24m" };
/** The preset of an old `months` value; undefined when it is not one. */
export const presetForMonths = (months: number): RangePreset | undefined => LEGACY_MONTHS[months];

export interface Period {
  /** The preset chosen; null for custom days. */
  preset: RangePreset | null;
  /** null = all time. */
  range: DayRange | null;
  label: string;
}

/** The period a request asks for: custom `from`-`to`, else a preset, else an old `months` value, else All time. */
export function resolvePeriod(q: { range?: RangePreset; from?: string; to?: string; months?: number }, today: string): Period {
  if (q.from && q.to) return { preset: null, range: { from: q.from, to: q.to }, label: rangeLabel({ from: q.from, to: q.to }) };
  const key = q.range ?? (q.months !== undefined ? LEGACY_MONTHS[q.months] : undefined) ?? DEFAULT_RANGE;
  const p = presetOf(key);
  return { preset: key, range: p.resolve(today), label: p.label };
}

/** "All time", "Last 12 months" or "Oct 14 – Nov 10, 2026", for headings and file headers. */
export const periodLabel = (p: Pick<Period, "preset" | "range">) => (p.preset ? presetOf(p.preset).label : p.range ? rangeLabel(p.range) : "All time");

/**
 * The period just before `range`: for a month preset the same number of whole calendar months before it (as the
 * Dashboard always compared), otherwise the same number of days.
 */
export function previousPeriod(range: DayRange, preset: RangePreset | null): DayRange {
  const months = presetMonths(preset);
  if (months) return { from: addMonths(range.from, -months), to: addDays(firstOfMonth(range.from), -1) };
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(rangeDays(range) - 1)), to };
}

export const COMPARE_MODES = [
  { key: "previous", label: "Previous period" },
  { key: "year", label: "Same period last year" },
  { key: "custom", label: "Custom" },
] as const;
export type CompareMode = (typeof COMPARE_MODES)[number]["key"];
export const COMPARE_MODE_KEYS = COMPARE_MODES.map((m) => m.key) as [CompareMode, ...CompareMode[]];

/** The same day one year earlier; Feb 29 becomes Feb 28. */
function yearEarlier(day: string): string {
  const [y, m, d] = parts(day);
  const shifted = `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isDay(shifted) ? shifted : `${y - 1}-02-28`;
}

/** The range `a` is compared with: the period just before it (see previousPeriod), or the same dates a year earlier. */
export function comparedRange(a: DayRange, mode: "previous" | "year", preset: RangePreset | null = null): DayRange {
  if (mode === "year") return { from: yearEarlier(a.from), to: yearEarlier(a.to) };
  return previousPeriod(a, preset);
}

/** "Oct 14 – Nov 10, 2026"; "Dec 20, 2025 – Jan 2, 2026" across years; "Nov 10, 2026" for one day. */
export function rangeLabel(r: DayRange): string {
  const [fy, fm, fd] = parts(r.from);
  const [ty, tm, td] = parts(r.to);
  const end = `${MONTHS[tm - 1]} ${td}, ${ty}`;
  if (r.from === r.to) return end;
  return fy === ty ? `${MONTHS[fm - 1]} ${fd} – ${end}` : `${MONTHS[fm - 1]} ${fd}, ${fy} – ${end}`;
}

/** "Tuesday, November 10, 2026", for screen readers. */
export function dayLabel(day: string): string {
  return utc(day).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
