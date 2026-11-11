"use client";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { InfoTip, LabelWithTip } from "@/components/dashboard/info-tip";
import { toneColor } from "@/components/dashboard/signal";
import type { Tone } from "@/lib/insights/signals";

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** Adds an ⓘ with this text to the header. */
  info?: string;
  align?: "left" | "right" | "center";
  /** Colors the header and every cell in this tone (Positive / Mixed / Negative columns). */
  tone?: Tone;
  cell: (row: T) => ReactNode;
  cellSx?: SxProps<Theme>;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

/**
 * Small read-only table of plain cells (the Dashboard's tables). Pass `sort` and `onSort` to make the columns listed in
 * `sortable` clickable; the rows themselves are sorted by the caller.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  maxHeight,
  dense,
  hover,
  sort,
  onSort,
  sortable = [],
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  maxHeight?: number;
  /** Tighter horizontal padding for wide tables (the heatmap). */
  dense?: boolean;
  hover?: boolean;
  sort?: SortState;
  onSort?: (key: string) => void;
  sortable?: string[];
}) {
  const toneSx = (c: Column<T>): SxProps<Theme> | undefined => (c.tone ? { color: (t: Theme) => toneColor(t, c.tone!) } : undefined);
  return (
    <TableContainer sx={{ maxHeight }}>
      <Table size="small" stickyHeader={maxHeight !== undefined} sx={dense ? { "& td, & th": { px: 0.75 } } : undefined}>
        <TableHead>
          <TableRow>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const tip = c.info && <LabelWithTip label={c.label} text={c.info} color="inherit" />;
              return (
                <TableCell key={c.key} align={c.align} sortDirection={active ? sort.dir : false} sx={[toneSx(c) ?? {}, c.tone ? { fontWeight: 700 } : {}] as SxProps<Theme>}>
                  {sortable.includes(c.key) ? (
                    <>
                      <TableSortLabel active={active} direction={active ? sort.dir : "desc"} onClick={() => onSort?.(c.key)}>
                        {c.label}
                      </TableSortLabel>
                      {c.info && <InfoTip text={c.info} color="inherit" />}
                    </>
                  ) : (
                    (tip || c.label)
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} hover={hover}>
              {columns.map((c) => (
                <TableCell key={c.key} align={c.align} sx={[toneSx(c) ?? {}, c.cellSx ?? {}] as SxProps<Theme>}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
