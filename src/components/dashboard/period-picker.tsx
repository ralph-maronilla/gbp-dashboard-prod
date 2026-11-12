"use client";

import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Popover from "@mui/material/Popover";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import { RangeCalendar, type SelectBy } from "@/components/ui/range-calendar";
import { COMPARE_COLORS } from "@/components/ui/simple-charts";
import {
  COMPARE_MODES,
  comparedRange,
  DASHBOARD_TIME_ZONE,
  isDay,
  periodLabel,
  RANGE_PRESETS,
  rangeLabel,
  todayIn,
  type CompareMode,
  type DayRange,
  type RangePreset,
} from "@/lib/insights/date-ranges";

/** The Dashboard period and the optional comparison, as kept in the page URL. */
export interface PeriodSelection {
  /** A preset, or "" for the custom `from`-`to`. */
  period: "" | RangePreset;
  from: string;
  to: string;
  compare: boolean;
  vs: CompareMode;
  /** Only with vs = custom. */
  vsFrom: string;
  vsTo: string;
}

const [COLOR_A, COLOR_B] = COMPARE_COLORS;
const SELECT_BY: { key: SelectBy; label: string }[] = [
  { key: "period", label: "Period" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "day", label: "Day" },
];
const MODE_LABELS: Record<CompareMode, string> = { previous: "previous period", year: "same period last year", custom: "custom dates" };

const presetRange = (key: RangePreset, today: string) => RANGE_PRESETS.find((p) => p.key === key)!.resolve(today);
/** The period's days (null = all time) and what it is compared with. */
function resolve(s: PeriodSelection, today: string): { range: DayRange | null; compared: DayRange | null } {
  const range = s.period ? presetRange(s.period, today) : s.from && s.to ? { from: s.from, to: s.to } : null;
  if (!range || !s.compare) return { range, compared: null };
  const compared = s.vs === "custom" ? (s.vsFrom && s.vsTo ? { from: s.vsFrom, to: s.vsTo } : null) : comparedRange(range, s.vs, s.period || null);
  return { range, compared };
}

/** "Last 12 months", "Oct 14 – Nov 10, 2026" or "All time", plus " vs …" while comparing. */
export function selectionLabel(s: PeriodSelection, today = todayIn(DASHBOARD_TIME_ZONE)): { period: string; compared: string | null } {
  const { range, compared } = resolve(s, today);
  return { period: periodLabel({ preset: s.period || null, range }), compared: compared ? rangeLabel(compared) : null };
}

const toText = (day: string) => (day ? `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}` : "");
const fromText = (text: string): string | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const day = `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return isDay(day) ? day : null;
};

/** A MM/DD/YYYY field: shows `value`, and passes on a typed day once it is a complete, real date. */
function DateText({ label, value, max, onChange, disabled }: { label: string; value: string; max: string; onChange: (day: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(toText(value));
  const [shownValue, setShownValue] = useState(value);
  // Follow the calendar: when the value changes from outside, show it (React's "adjust state when a prop changes").
  if (value !== shownValue) {
    setShownValue(value);
    setText(toText(value));
  }
  const typed = fromText(text);
  const bad = text.trim() !== "" && (!typed || typed > max);
  return (
    <TextField
      size="small"
      label={label}
      placeholder="MM/DD/YYYY"
      value={text}
      disabled={disabled}
      error={bad}
      helperText={bad ? (typed ? "After today" : "Use MM/DD/YYYY") : " "}
      onChange={(e) => {
        setText(e.target.value);
        const day = fromText(e.target.value);
        if (day && day <= max) onChange(day);
      }}
      slotProps={{ inputLabel: { shrink: true } }}
      sx={{ flex: 1, minWidth: 140 }}
    />
  );
}

function Swatch({ color }: { color: string }) {
  return <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, borderRadius: "2px", bgcolor: color, mr: 0.75, flexShrink: 0 }} />;
}

/**
 * The Dashboard Period: a date button that opens a range picker (Last / Current presets, a two-month calendar, From / To
 * fields) with "Compare to" at the bottom. Nothing changes until Apply. Days are Philippine days; the server resolves
 * the presets again, so a link with "Last 7 days" keeps meaning the last 7 days.
 */
export function PeriodPicker({ value, onApply }: { value: PeriodSelection; onApply: (s: PeriodSelection) => void }) {
  const theme = useTheme();
  const phone = !useMediaQuery(theme.breakpoints.up("md"));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = selectionLabel(value);
  const close = () => setAnchor(null);
  const body = (
    <PickerBody
      initial={value}
      phone={phone}
      onCancel={close}
      onApply={(s) => {
        close();
        onApply(s);
      }}
    />
  );

  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<CalendarMonthOutlinedIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        data-tour="dash-period"
        sx={{ textTransform: "none", borderColor: "divider", height: 40, justifyContent: "flex-start", textAlign: "left" }}
      >
        <Box component="span" sx={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <Typography component="span" variant="caption" color="text.secondary" sx={{ lineHeight: 1.1 }}>
            Period
          </Typography>
          <span>
            {label.period}
            {label.compared && (
              <Typography component="span" variant="body2" color="text.secondary">
                {" "}
                vs {label.compared}
              </Typography>
            )}
          </span>
        </Box>
      </Button>
      {anchor &&
        (phone ? (
          <Dialog open fullScreen onClose={close}>
            {body}
          </Dialog>
        ) : (
          <Popover
            open
            anchorEl={anchor}
            onClose={close}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            slotProps={{ paper: { elevation: 8, sx: { mt: 0.5, borderRadius: 1.5, border: 1, borderColor: "divider", maxWidth: "calc(100vw - 16px)" } } }}
          >
            {body}
          </Popover>
        ))}
    </>
  );
}

/** The picker's contents: a fresh draft each time it opens. */
function PickerBody({ initial, phone, onCancel, onApply }: { initial: PeriodSelection; phone: boolean; onCancel: () => void; onApply: (s: PeriodSelection) => void }) {
  const today = todayIn(DASHBOARD_TIME_ZONE);
  const [draft, setDraft] = useState<PeriodSelection>(initial);
  const presetGroup = draft.period ? RANGE_PRESETS.find((p) => p.key === draft.period)!.group : "custom";
  const [tab, setTab] = useState<"last" | "current" | "custom">(presetGroup);
  const [selectBy, setSelectBy] = useState<SelectBy>("period");
  const [target, setTarget] = useState<"period" | "compare">("period");
  const { range, compared } = resolve(draft, today);
  const set = (patch: Partial<PeriodSelection>) => setDraft((d) => ({ ...d, ...patch }));

  const choosePreset = (key: RangePreset) => {
    set({ period: key, from: "", to: "", ...(key === "all" ? { compare: false } : {}) });
    setTarget("period");
  };
  const setPeriodDays = (r: DayRange) => {
    set({ period: "", from: r.from, to: r.to });
    setTab("custom");
  };
  const setCompareMode = (vs: CompareMode) => {
    // A custom comparison starts from what was compared until now.
    if (vs === "custom" && compared) set({ vs, vsFrom: compared.from, vsTo: compared.to });
    else set({ vs });
    setTarget(vs === "custom" ? "compare" : "period");
  };
  const editingCompare = draft.compare && draft.vs === "custom" && target === "compare";
  // A custom period needs both days; a custom comparison needs its dates (otherwise Apply turns Compare off).
  const canApply = !!range || draft.period === "all";

  const items: ReactNode =
    tab === "custom"
      ? SELECT_BY.map((m) => (
          <ListButton key={m.key} selected={selectBy === m.key} onClick={() => setSelectBy(m.key)}>
            {m.label}
          </ListButton>
        ))
      : RANGE_PRESETS.filter((p) => p.group === tab).map((p) => (
          <ListButton key={p.key} selected={draft.period === p.key} onClick={() => choosePreset(p.key)}>
            {p.label}
          </ListButton>
        ));

  const footer = (
    <>
      <Divider />
      <Stack direction="row" spacing={1} sx={{ p: 1.5, justifyContent: "flex-end" }}>
        <Button variant="outlined" color="inherit" onClick={onCancel} sx={{ borderColor: "divider" }}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canApply} onClick={() => onApply(draft.compare && !compared ? { ...draft, compare: false } : draft)}>
          Apply
        </Button>
      </Stack>
    </>
  );

  return (
    // Phone: presets on top, then the calendar, then Cancel / Apply pinned to the bottom of the screen.
    <Stack direction={{ xs: "column", md: "row" }} sx={{ maxHeight: { md: "calc(100vh - 96px)" }, overflow: { md: "auto" }, minHeight: { xs: "100%", md: 0 } }}>
      {/* Left: From / To, the calendar, Compare to. */}
      <Stack spacing={1.5} sx={{ p: 2, minWidth: 0, order: { xs: 2, md: 0 }, flexGrow: { xs: 1, md: 0 } }}>
        <Stack direction="row" spacing={1.5}>
          <DateText label="From" value={range?.from ?? ""} max={today} onChange={(from) => setPeriodDays({ from, to: range && range.to >= from ? range.to : from })} />
          <DateText label="To" value={range?.to ?? ""} max={today} onChange={(to) => setPeriodDays({ from: range && range.from <= to ? range.from : to, to })} />
        </Stack>
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
          {editingCompare && (
            <Typography variant="caption" sx={{ display: "flex", alignItems: "center", mb: 1, fontWeight: 600 }}>
              <Swatch color={COLOR_B} />
              Picking the compared dates
            </Typography>
          )}
          <RangeCalendar
            key={`${editingCompare ? "b" : "a"}-${phone}`}
            value={editingCompare ? compared : range}
            onChange={editingCompare ? (r) => set({ vsFrom: r.from, vsTo: r.to }) : setPeriodDays}
            compare={editingCompare ? range : compared}
            selectBy={selectBy}
            color={editingCompare ? COLOR_B : COLOR_A}
            compareColor={editingCompare ? COLOR_A : COLOR_B}
            max={today}
            months={phone ? 1 : 2}
          />
        </Box>

        <Stack spacing={1}>
          <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <FormControlLabel
              sx={{ mr: 0 }}
              disabled={!range}
              control={<Checkbox size="small" checked={draft.compare} onChange={(e) => set({ compare: e.target.checked })} />}
              label="Compare to"
            />
            <Select
              size="small"
              variant="standard"
              value={draft.vs}
              disabled={!range || !draft.compare}
              onChange={(e) => setCompareMode(e.target.value as CompareMode)}
              inputProps={{ "aria-label": "Compare to" }}
              sx={{ minWidth: 190 }}
            >
              {COMPARE_MODES.map((m) => (
                <MenuItem key={m.key} value={m.key}>
                  {MODE_LABELS[m.key]}
                </MenuItem>
              ))}
            </Select>
            {draft.compare && compared && draft.vs !== "custom" && (
              <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center" }}>
                <Swatch color={COLOR_B} />
                {rangeLabel(compared)}
              </Typography>
            )}
          </Stack>
          {!range && (
            <Typography variant="caption" color="text.secondary">
              All time has nothing before it: pick a date range to compare.
            </Typography>
          )}
          {draft.compare && draft.vs === "custom" && (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1.5}>
                <DateText label="Compare from" value={draft.vsFrom} max={today} onChange={(vsFrom) => set({ vsFrom, vsTo: draft.vsTo && draft.vsTo >= vsFrom ? draft.vsTo : vsFrom })} />
                <DateText label="Compare to" value={draft.vsTo} max={today} onChange={(vsTo) => set({ vsTo, vsFrom: draft.vsFrom && draft.vsFrom <= vsTo ? draft.vsFrom : vsTo })} />
              </Stack>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">
                  Calendar sets:
                </Typography>
                <ToggleButtonGroup size="small" exclusive value={target} onChange={(_e, v: "period" | "compare" | null) => v && setTarget(v)}>
                  <ToggleButton value="period" sx={{ py: 0.25, textTransform: "none" }}>
                    <Swatch color={COLOR_A} />
                    Period
                  </ToggleButton>
                  <ToggleButton value="compare" sx={{ py: 0.25, textTransform: "none" }}>
                    <Swatch color={COLOR_B} />
                    Compare to
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>

      {/* Right: Last / Current / Custom, then Cancel / Apply. */}
      <Box
        sx={(t) => ({
          order: { xs: 1, md: 0 },
          width: { md: 250 },
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          // Colour inside the responsive values: a responsive border shorthand would otherwise reset it to black.
          borderLeft: { md: `1px solid ${t.palette.divider}` },
          borderBottom: { xs: `1px solid ${t.palette.divider}`, md: "none" },
        })}
      >
        <Tabs value={tab} onChange={(_e, v: "last" | "current" | "custom") => setTab(v)} variant="fullWidth" sx={{ minHeight: 44, "& .MuiTab-root": { minHeight: 44, textTransform: "none", minWidth: 0 } }}>
          <Tab value="last" label="Last" />
          <Tab value="current" label="Current" />
          <Tab value="custom" label="Custom" />
        </Tabs>
        <Box sx={{ px: 1, py: 1, flexGrow: 1, overflowY: "auto", maxHeight: { xs: 220, md: "none" } }}>
          {tab === "custom" && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 1.5, pb: 0.5 }}>
              A click on the calendar selects a:
            </Typography>
          )}
          {items}
        </Box>
        {!phone && footer}
      </Box>
      {/* Phone: Cancel / Apply stay at the bottom of the screen. */}
      {phone && <Box sx={{ order: 3, position: "sticky", bottom: 0, zIndex: 1, bgcolor: "background.paper" }}>{footer}</Box>}
    </Stack>
  );
}

/** A preset or calendar mode in the right-hand list; the chosen one in blue. */
function ListButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      fullWidth
      onClick={onClick}
      color={selected ? "primary" : "inherit"}
      aria-pressed={selected}
      sx={{ justifyContent: "flex-start", textTransform: "none", fontWeight: selected ? 600 : 400, px: 1.5, py: 0.6 }}
    >
      {children}
    </Button>
  );
}
