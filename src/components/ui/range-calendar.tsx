"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { addDays, addMonths, dayLabel, firstOfMonth, lastOfMonth, MONTH_NAMES, weekStart, type DayRange } from "@/lib/insights/date-ranges";

/** How a click on a day selects: the first and then the last day of a period, or the whole week / month / one day. */
export type SelectBy = "period" | "week" | "month" | "day";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CELL = 38;
const SHORT_MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

const ordered = (x: string, y: string): DayRange => (x <= y ? { from: x, to: y } : { from: y, to: x });
const within = (d: string, r: DayRange | null | undefined) => !!r && d >= r.from && d <= r.to;
const monthTitle = (first: string) => `${MONTH_NAMES[Number(first.slice(5, 7)) - 1]} ${first.slice(0, 4)}`;
/** The two months shown at first: the range's first and last months, or its month and the one before. */
const initialViews = (r: DayRange): [string, string] => {
  const [a, b] = [firstOfMonth(r.from), firstOfMonth(r.to)];
  return a === b ? [addMonths(a, -1), a] : [a, b];
};

/**
 * Date-range calendar, laid out like common analytics tools: two months side by side (one on phones), each with its own
 * ← / → and month / year dropdowns; weeks start on Monday; the selected range is a solid block in `color`. `compare` is
 * drawn as a bar under its days in `compareColor`. Days outside `min`-`max` cannot be picked. Arrow keys move between
 * days, Enter or Space picks, Esc cancels a half-picked period.
 */
export function RangeCalendar({
  value,
  onChange,
  compare,
  selectBy = "period",
  min,
  max,
  months = 2,
  color,
  compareColor,
}: {
  /** null = nothing selected (All time). */
  value: DayRange | null;
  onChange: (range: DayRange) => void;
  compare?: DayRange | null;
  selectBy?: SelectBy;
  min?: string | null;
  max: string;
  months?: 1 | 2;
  color: string;
  compareColor: string;
}) {
  const theme = useTheme();
  const onColor = theme.palette.getContrastText(color);
  const start = value ?? { from: max, to: max };
  const viewsFor = (r: DayRange): [string, string] => (months === 2 ? initialViews(r) : [firstOfMonth(r.to), firstOfMonth(r.to)]);
  const [views, setViews] = useState<[string, string]>(() => viewsFor(start));
  const shownViews = months === 2 ? views : [views[1]];
  // When the range changes from outside (a preset, typed dates) and its end is not on screen, show it.
  const [seen, setSeen] = useState(start);
  if (start.from !== seen.from || start.to !== seen.to) {
    setSeen(start);
    if (!shownViews.includes(firstOfMonth(start.to)) || !shownViews.includes(firstOfMonth(start.from))) setViews(viewsFor(start));
  }
  // The first day clicked in "period" mode, waiting for the second; and the day under the pointer meanwhile.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState(start.to);
  const root = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);

  const disabled = (d: string) => d > max || (!!min && d < min);
  const clamp = (r: DayRange): DayRange => ({ from: min && r.from < min ? min : r.from, to: r.to > max ? max : r.to });
  /** What a click on `d` would select (whole week / month / day modes). */
  const unit = (d: string): DayRange =>
    selectBy === "week" ? clamp({ from: weekStart(d), to: addDays(weekStart(d), 6) }) : selectBy === "month" ? clamp({ from: firstOfMonth(d), to: lastOfMonth(d) }) : { from: d, to: d };
  const preview: DayRange | null = anchor ? ordered(anchor, hover ?? anchor) : hover && selectBy !== "period" ? unit(hover) : null;
  const shown = preview ?? value;

  useEffect(() => {
    if (!keyboard.current) return;
    keyboard.current = false;
    root.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused, views]);

  const pick = (d: string) => {
    if (disabled(d)) return;
    setFocused(d);
    if (selectBy !== "period") return onChange(unit(d));
    if (!anchor) {
      setAnchor(d);
      setHover(d);
      return;
    }
    setAnchor(null);
    setHover(null);
    onChange(ordered(anchor, d));
  };

  const setView = (i: number, first: string) => setViews((v) => (months === 2 ? (i === 0 ? [first, v[1]] : [v[0], first]) : [first, first]));
  const onKey = (e: KeyboardEvent, d: string) => {
    if (e.key === "Escape" && anchor) {
      e.stopPropagation(); // cancel the half-picked period, not the whole picker
      setAnchor(null);
      setHover(null);
      return;
    }
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(d, step);
    keyboard.current = true;
    setFocused(next);
    if (anchor || selectBy !== "period") setHover(next);
    const first = firstOfMonth(next);
    if (!shownViews.includes(first)) setView(next < shownViews[0]! ? 0 : shownViews.length - 1, first);
  };

  const years: number[] = [];
  for (let y = Number((min ?? addMonths(max, -120)).slice(0, 4)); y <= Number(max.slice(0, 4)); y++) years.push(y);

  const day = (d: string, inMonth: boolean) => {
    const off = disabled(d);
    const selected = within(d, shown);
    const inCompare = within(d, compare);
    return (
      <ButtonBase
        key={d}
        data-day={inMonth ? d : undefined}
        disabled={off}
        tabIndex={inMonth && d === focused ? 0 : -1}
        aria-label={dayLabel(d)}
        aria-pressed={selected}
        onClick={() => pick(d)}
        onMouseEnter={() => (anchor || selectBy !== "period") && setHover(d)}
        onKeyDown={(e) => onKey(e, d)}
        sx={{
          height: CELL,
          position: "relative",
          typography: "body2",
          fontWeight: selected ? 600 : undefined,
          color: selected ? onColor : off || !inMonth ? "text.disabled" : "text.primary",
          bgcolor: selected ? (preview ? alpha(color, 0.75) : color) : undefined,
          "&:hover": { bgcolor: selected ? color : alpha(color, 0.15) },
          "&.Mui-focusVisible": { outline: `2px solid ${color}`, outlineOffset: -2 },
          "&::after": inCompare ? { content: '""', position: "absolute", left: 6, right: 6, bottom: 3, height: 3, borderRadius: 2, bgcolor: compareColor } : undefined,
        }}
      >
        {Number(d.slice(8))}
      </ButtonBase>
    );
  };

  const month = (first: string, i: number) => {
    const last = lastOfMonth(first);
    const gridStart = weekStart(first);
    const gridEnd = addDays(weekStart(last), 6);
    const cells: string[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d);
    const [y, m] = [Number(first.slice(0, 4)), Number(first.slice(5, 7))];
    const go = (n: number) => setView(i, addMonths(first, n));
    return (
      <Box key={i} sx={{ minWidth: CELL * 7 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 1 }}>
          <IconButton size="small" aria-label={`Previous month (${monthTitle(first)})`} onClick={() => go(-1)} sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Select
            size="small"
            variant="standard"
            disableUnderline
            value={m}
            onChange={(e) => setView(i, `${y}-${String(e.target.value).padStart(2, "0")}-01`)}
            inputProps={{ "aria-label": "Month" }}
            sx={{ flex: 1, typography: "body2", "& .MuiSelect-select": { textAlign: "center" } }}
          >
            {SHORT_MONTHS.map((name, k) => (
              <MenuItem key={name} value={k + 1}>
                {name}
              </MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            variant="standard"
            disableUnderline
            value={y}
            onChange={(e) => setView(i, `${e.target.value}-${String(m).padStart(2, "0")}-01`)}
            inputProps={{ "aria-label": "Year" }}
            sx={{ flex: 1, typography: "body2", "& .MuiSelect-select": { textAlign: "center" } }}
          >
            {(years.includes(y) ? years : [...years, y].sort()).map((yr) => (
              <MenuItem key={yr} value={yr}>
                {yr}
              </MenuItem>
            ))}
          </Select>
          <IconButton size="small" aria-label={`Next month (${monthTitle(first)})`} onClick={() => go(1)} sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Box role="grid" aria-label={monthTitle(first)} sx={{ display: "grid", gridTemplateColumns: `repeat(7, ${CELL}px)`, rowGap: "2px" }}>
          {WEEKDAYS.map((w) => (
            <Typography key={w} variant="caption" color="text.secondary" aria-hidden sx={{ textAlign: "center", lineHeight: "28px" }}>
              {w}
            </Typography>
          ))}
          {cells.map((d) => day(d, d >= first && d <= last))}
        </Box>
      </Box>
    );
  };

  return (
    <Box ref={root} onMouseLeave={() => setHover(anchor)}>
      <Stack direction="row" spacing={3} sx={{ justifyContent: "center" }}>
        {shownViews.map((v, i) => month(v, months === 2 ? i : 1))}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, minHeight: 20 }} aria-live="polite">
        {anchor
          ? "Now click the last day (Esc to start over)."
          : selectBy === "week"
            ? "Click a day to select its week (Monday to Sunday)."
            : selectBy === "month"
              ? "Click a day to select its month."
              : selectBy === "day"
                ? "Click a day to select it."
                : "Click the first day, then the last."}
      </Typography>
    </Box>
  );
}
