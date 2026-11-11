"use client";

import MenuItem from "@mui/material/MenuItem";
import TextField, { type TextFieldProps } from "@mui/material/TextField";

export interface Option {
  value: string;
  label: string;
}

/** Small dropdown over `{ value, label }` options (every filter on the Dashboard, Extraction, Overview and dialogs). */
export function SelectField({
  options,
  width,
  onChange,
  ...rest
}: Omit<TextFieldProps, "select" | "onChange" | "children"> & { options: Option[]; onChange: (value: string) => void; width?: number }) {
  return (
    <TextField select size="small" onChange={(e) => onChange(e.target.value)} sx={width ? { minWidth: width } : undefined} {...rest}>
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Client / group choices, led by the "all" entry (empty value). `counts` appends each group's location count. */
export const groupOptions = (groups: { id: string; name: string; location_count?: number }[] | undefined, all: string, counts = false): Option[] => [
  { value: "", label: all },
  ...(groups ?? []).map((g) => ({ value: g.id, label: counts ? `${g.name} (${g.location_count})` : g.name })),
];

/** Rating filter choices ("5 stars" … "1 star"), led by "All ratings". */
export const RATING_OPTIONS: Option[] = [
  { value: "", label: "All ratings" },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` })),
  { value: "1,2", label: "1–2 stars (low)" },
];
