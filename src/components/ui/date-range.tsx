"use client";

import TextField from "@mui/material/TextField";

/** "From" and "To" date inputs; `to` is flagged when it is before `from`. Returns fragments so the parent lays them out. */
export function DateRange({ from, to, onChange, fullWidth }: { from: string; to: string; onChange: (patch: { from?: string; to?: string }) => void; fullWidth?: boolean }) {
  const invalid = Boolean(from && to && from > to);
  return (
    <>
      <TextField type="date" size="small" label="From" value={from} onChange={(e) => onChange({ from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth={fullWidth} />
      <TextField type="date" size="small" label="To" value={to} onChange={(e) => onChange({ to: e.target.value })} error={invalid} slotProps={{ inputLabel: { shrink: true } }} fullWidth={fullWidth} />
    </>
  );
}
