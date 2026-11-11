"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import type { Option } from "./select-field";

/** Small one-of-N toggle (group by, chart buckets, figures source, trend granularity). Clicking the active one keeps it. */
export function ToggleSelect<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[] | readonly Option[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_e, v: T | null) => v && onChange(v)} aria-label={label} sx={{ flexWrap: "wrap" }}>
      {options.map((o) => (
        <ToggleButton key={o.value} value={o.value}>
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
