"use client";

import Link from "next/link";
import { useMemo } from "react";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridSortModel,
} from "@mui/x-data-grid";
import { GRID_LOADING_PROPS } from "@/components/ui/loading-overlay";
import { chartAccent } from "@/lib/design-tokens";
import { formatRelative } from "@/lib/format";
import type { LocationRow, LocationSortField } from "@/lib/schemas/locations";
import type { OverviewFilter } from "@/lib/store/ui-store";

const WEEKS = 12;

/** Plots only weeks that have reviews, on a fixed 12-week scale, so gaps are bridged rather than shown as zero. */
function Trend({ trend }: { trend: (number | null)[] }) {
  const points = trend.flatMap((v, i) => (v === null ? [] : [{ x: i, v }]));
  if (points.length < 2) {
    return (
      <Typography variant="caption" color="text.secondary">
        Not enough data
      </Typography>
    );
  }
  return (
    <Box sx={{ width: "100%", height: 40 }}>
      <SparkLineChart
        data={points.map((p) => p.v)}
        xAxis={{ data: points.map((p) => p.x), min: 0, max: WEEKS - 1 }}
        yAxis={{ min: 1, max: 5 }}
        height={40}
        curve="monotoneX"
        color={chartAccent}
        area
        showHighlight
        showTooltip
        valueFormatter={(v) => (v === null ? "" : `${v.toFixed(2)} avg`)}
        sx={{ "& .MuiAreaElement-root": { fillOpacity: 0.15 } }}
      />
    </Box>
  );
}

const num = (n: number) => n.toLocaleString();

export function LocationsGrid({
  rows,
  total,
  loading,
  filter,
  onFilterChange,
}: {
  rows: LocationRow[];
  total: number;
  loading: boolean;
  filter: OverviewFilter;
  onFilterChange: (f: Partial<OverviewFilter>) => void;
}) {
  const columns = useMemo<GridColDef<LocationRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Location",
        flex: 1.4,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Stack sx={{ justifyContent: "center", height: "100%", minWidth: 0 }}>
            <MuiLink component={Link} href={`/locations/${row.id}`} underline="hover" noWrap sx={{ fontWeight: 500 }}>
              {row.name}
            </MuiLink>
            {row.address && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {row.address}
              </Typography>
            )}
          </Stack>
        ),
      },
      {
        field: "avg_rating",
        headerName: "Rating",
        width: 170,
        renderCell: ({ row }) =>
          row.avg_rating === null ? (
            "–"
          ) : (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", height: "100%" }}>
              <Rating value={row.avg_rating} precision={0.1} size="small" readOnly />
              <Typography variant="body2">{row.avg_rating.toFixed(1)}</Typography>
            </Stack>
          ),
      },
      { field: "total_reviews", headerName: "Reviews", type: "number", width: 100, valueFormatter: num },
      { field: "new_reviews_7d", headerName: "New (7d)", type: "number", width: 100, valueFormatter: num },
      { field: "unanswered", headerName: "Unanswered", type: "number", width: 120, valueFormatter: num },
      { field: "low_rating", headerName: "1–2 star", type: "number", width: 100, valueFormatter: num },
      {
        field: "trend",
        headerName: "12-week trend",
        width: 180,
        sortable: false,
        renderCell: ({ row }) => <Trend trend={row.trend} />,
      },
      {
        field: "last_synced_at",
        headerName: "Last synced",
        width: 140,
        sortable: false,
        valueGetter: (_v, row) => formatRelative(row.last_synced_at),
      },
    ],
    [],
  );

  const sortModel: GridSortModel = [{ field: filter.sort, sort: filter.order }];
  const paginationModel: GridPaginationModel = { page: filter.page, pageSize: filter.pageSize };

  return (
    <DataGrid
      autoHeight
      rows={rows}
      columns={columns}
      loading={loading}
      rowCount={total}
      rowHeight={56}
      paginationMode="server"
      sortingMode="server"
      paginationModel={paginationModel}
      onPaginationModelChange={(m) => onFilterChange({ page: m.page, pageSize: m.pageSize })}
      sortModel={sortModel}
      sortingOrder={["asc", "desc"]}
      onSortModelChange={(m) => {
        const next = m[0];
        // Any sort change goes back to page 1; clearing falls back to name ascending.
        onFilterChange(
          next?.sort
            ? { sort: next.field as LocationSortField, order: next.sort, page: 0 }
            : { sort: "name", order: "asc", page: 0 },
        );
      }}
      pageSizeOptions={[10, 25, 50, 100]}
      disableRowSelectionOnClick
      disableColumnMenu
      localeText={{ noRowsLabel: "No locations match these filters" }}
      slotProps={GRID_LOADING_PROPS}
    />
  );
}
