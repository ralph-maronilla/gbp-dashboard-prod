"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AppDialog } from "@/components/ui/app-dialog";
import { safeFileName } from "@/lib/client/export";
import { useStoredString } from "@/lib/client/stored";
import { CX_PULSE_COLUMNS, REVIEW_CSV_COLUMNS, REVIEW_CSV_IDS, orderCsvColumns, type ReviewCsvColumn } from "@/lib/export/review-columns";

/** The columns chosen last time, in this browser. */
export const CSV_COLUMNS_KEY = "reviews-csv-columns";

const sameSet = (a: ReviewCsvColumn[], b: ReviewCsvColumn[]) => a.length === b.length && a.every((c) => b.includes(c));

/**
 * Export CSV for the reviews table: pick the columns (presets: the CX Pulse upload layout, every column, or the columns
 * the table shows) and the file name. The filters and sort come from the table.
 */
export function CsvExportDialog({
  total,
  tableColumns,
  suggestedName,
  busy,
  error,
  onExport,
  onClose,
}: {
  /** Reviews that match the filters (what the file will contain). */
  total: number | undefined;
  /** The CSV columns matching the table's visible columns. */
  tableColumns: ReviewCsvColumn[];
  suggestedName: string;
  busy: boolean;
  error: string | null;
  onExport: (columns: ReviewCsvColumn[], fileName: string | null) => void;
  onClose: () => void;
}) {
  const [stored, setStored] = useStoredString(CSV_COLUMNS_KEY);
  const [selected, setSelected] = useState<ReviewCsvColumn[]>(() => {
    const last = stored ? orderCsvColumns(stored.split(",")) : [];
    return last.length > 0 ? last : CX_PULSE_COLUMNS;
  });
  const [name, setName] = useState(suggestedName);
  const fileName = safeFileName(name, "csv");

  const presets: [label: string, columns: ReviewCsvColumn[]][] = [
    ["CX Pulse layout", CX_PULSE_COLUMNS],
    ["All columns", REVIEW_CSV_IDS],
    ["Same as table", tableColumns],
  ];
  const toggle = (id: ReviewCsvColumn, on: boolean) => setSelected((s) => orderCsvColumns(on ? [...s, id] : s.filter((c) => c !== id)));
  const group = (title: string, columns: readonly (typeof REVIEW_CSV_COLUMNS)[number][]) => (
    <div>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2 }}>
        {columns.map((c) => (
          <FormControlLabel
            key={c.id}
            control={<Checkbox size="small" checked={selected.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />}
            label={c.label}
          />
        ))}
      </Box>
    </div>
  );

  return (
    <AppDialog
      title="Export CSV"
      onClose={onClose}
      busy={busy}
      error={error}
      confirm={{
        label: busy ? "Preparing…" : "Download",
        disabled: busy || selected.length === 0,
        onClick: () => {
          setStored(selected.join(","));
          onExport(selected, fileName);
        },
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {total === undefined ? "The reviews" : `${total.toLocaleString()} review${total === 1 ? "" : "s"}`} matching the table&apos;s filters, in
        the table&apos;s order. Columns follow the order below.
      </Typography>
      <TextField
        label="File name"
        size="small"
        value={name}
        onChange={(e) => setName(e.target.value)}
        helperText={fileName ? `Saved as ${fileName}` : "Leave empty to use the default name"}
        slotProps={{ htmlInput: { maxLength: 150 } }}
      />
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
        {presets.map(([label, columns]) => (
          <Button key={label} size="small" variant={sameSet(selected, columns) ? "contained" : "outlined"} onClick={() => setSelected(columns)}>
            {label}
          </Button>
        ))}
      </Stack>
      {group("CX Pulse template", REVIEW_CSV_COLUMNS.slice(0, CX_PULSE_COLUMNS.length))}
      {group("More columns", REVIEW_CSV_COLUMNS.slice(CX_PULSE_COLUMNS.length))}
      {selected.length === 0 && (
        <Typography variant="caption" color="error">
          Choose at least one column.
        </Typography>
      )}
    </AppDialog>
  );
}
