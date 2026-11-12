"use client";

import { useMemo, useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import DownloadIcon from "@mui/icons-material/Download";
import ViewColumnOutlinedIcon from "@mui/icons-material/ViewColumnOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { DataGrid, type GridColDef, type GridColumnVisibilityModel, type GridPaginationModel, type GridSortModel } from "@mui/x-data-grid";
import { AppDialog } from "@/components/ui/app-dialog";
import { DateRange } from "@/components/ui/date-range";
import { GRID_LOADING_PROPS, LoadingOverlay } from "@/components/ui/loading-overlay";
import { RetryAlert } from "@/components/ui/retry-alert";
import { RATING_OPTIONS, SelectField, groupOptions } from "@/components/ui/select-field";
import { useDebounced } from "@/lib/client/use-debounced";
import { useStoredString } from "@/lib/client/stored";
import { UNASSIGNED } from "@/lib/schemas/insights";
import { useExportReviews, useExtractLocations, useGroups, useReviews } from "@/lib/client/hooks";
import { orderCsvColumns, type ReviewCsvColumn } from "@/lib/export/review-columns";
import { ISLAND_GROUPS, REGION_CODES, regionIsland, regionName } from "@/lib/ph-regions";
import type { ReviewRow, ReviewSort } from "@/lib/schemas/extract";
import { CsvExportDialog } from "./csv-export-dialog";
import { PLAIN_GRID_PROPS, STRONG_CELL, gridScrollSx, plainGridSx } from "./grid-styles";
import { MoreFilters } from "./more-filters";
import { EMPTY_REVIEW_FILTER, reviewFilterParams, type ReviewFilterState } from "./review-filter";

/** Table column → server sort key. Last name has no key: it is derived from the full name, which "First name" sorts by. */
const SORT_KEY: Record<string, ReviewSort> = {
  reference: "reference",
  datetime: "date",
  branch: "branch",
  first_name: "name",
  location: "location",
  location_type: "type",
  rating: "rating",
  comment: "comment",
};

/** Table column → CSV column, for the "Same as table" preset. */
const CSV_OF_FIELD: Record<string, ReviewCsvColumn> = {
  reference: "reference",
  datetime: "datetime",
  branch: "branch",
  first_name: "first_name",
  middle_name: "middle_name",
  last_name: "last_name",
  location: "location",
  location_type: "type",
  client: "client",
  region: "region",
  rating: "rating",
  reviewer_url: "reviewer_link",
  comment: "comment",
  reply: "reply",
  reply_date: "reply_date",
};

/** Table columns hidden in this browser; Client, Region and Reply date start hidden. */
const HIDDEN_KEY = "reviews-table-hidden";
const DEFAULT_HIDDEN = "client,region,reply_date";
const SEARCH_LABEL = { all: "Search comment, reply or name", comment: "Search comments", reply: "Search replies", name: "Search reviewer names" } as const;

interface Props {
  filter: ReviewFilterState;
  onFilterChange: (next: ReviewFilterState) => void;
}

/** "reviews-greenbelt-5-2026-11-11": the location (when one is picked) and today's date, as the file name suggestion. */
function suggestedFileName(location: string | undefined): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const slug = (location ?? "").replace(/^Healthway\s*-?\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return ["reviews", slug, day].filter(Boolean).join("-");
}

/** Read-only stars, announced as "4 out of 5 stars". */
function Stars({ value }: { value: number }) {
  return <Rating value={value} readOnly size="small" getLabelText={(v) => `${v} out of 5 stars`} sx={{ verticalAlign: "middle" }} />;
}

/** Extracted reviews in the CX Pulse sheet layout, server-paginated, with the same filters as the CSV export. */
export function ReviewsPanel({ filter, onFilterChange }: Props) {
  const groups = useGroups();
  const locations = useExtractLocations();
  const exporter = useExportReviews();
  const [exporting, setExporting] = useState<string | null>(null); // the suggested file name while the dialog is open
  const [hiddenStored, setHidden] = useStoredString(HIDDEN_KEY);
  const [columnsMenu, setColumnsMenu] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState("");
  const [paging, setPaging] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [sort, setSort] = useState<GridSortModel>([{ field: "datetime", sort: "desc" }]);
  const [open, setOpen] = useState<ReviewRow | null>(null);

  const q = useDebounced(search.trim());

  const set = (patch: Partial<ReviewFilterState>) => {
    onFilterChange({ ...filter, ...patch });
    setPaging((p) => ({ ...p, page: 0 }));
  };

  const invalidRange = Boolean(filter.from && filter.to && filter.from > filter.to);
  const params = reviewFilterParams(filter, q);
  // Shared by the table and the CSV, so the download lists the reviews in the order on screen.
  const order = {
    sort: SORT_KEY[sort[0]?.field ?? ""] ?? "date",
    order: sort[0]?.sort === "asc" ? "asc" : "desc",
  } as const;
  const reviews = useReviews(
    invalidRange
      ? {}
      : {
          ...params,
          ...order,
          page: paging.page,
          pageSize: paging.pageSize,
        },
  );

  const columns = useMemo<GridColDef<ReviewRow>[]>(
    () => [
      { field: "reference", headerName: "Reference #", width: 140 },
      // Newest first is the first click (and the default), so a click on an already-sorted date always reverses it.
      { field: "datetime", headerName: "Date / time", width: 150, sortingOrder: ["desc", "asc"] },
      { field: "branch", headerName: "Branch", width: 140, cellClassName: STRONG_CELL },
      { field: "first_name", headerName: "First name", width: 130 },
      { field: "middle_name", headerName: "Middle name", width: 110, sortable: false },
      { field: "last_name", headerName: "Last name", width: 140, sortable: false, description: "Sort by First name to order by the reviewer's full name" },
      { field: "location", headerName: "Location", flex: 1, minWidth: 180 },
      { field: "location_type", headerName: "Type", width: 150, valueFormatter: (v: string | null) => v ?? "" },
      { field: "client", headerName: "Client", width: 160, sortable: false },
      { field: "region", headerName: "Region", width: 160, sortable: false, valueFormatter: (v: string | null) => v ?? "" },
      {
        field: "rating",
        headerName: "Rating",
        width: 130,
        renderCell: ({ row }) => <Stars value={row.rating} />,
      },
      {
        field: "reviewer_url",
        headerName: "Profile",
        width: 80,
        sortable: false,
        renderCell: ({ row }) =>
          row.reviewer_url ? (
            <Link href={row.reviewer_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Google profile of ${row.first_name}`} title="Open reviewer's Google profile">
              <OpenInNewOutlinedIcon fontSize="small" sx={{ verticalAlign: "middle" }} />
            </Link>
          ) : (
            <Typography component="span" variant="body2" color="text.disabled">-</Typography>
          ),
      },
      {
        field: "comment",
        headerName: "Comment",
        flex: 2,
        minWidth: 260,
        renderCell: ({ row }) => (
          <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.comment ?? ""}>
            {row.comment ?? <Typography component="span" variant="body2" color="text.disabled">(rating only)</Typography>}
          </Box>
        ),
      },
      {
        // The owner's reply as extracted from Google. Table only: the CSV keeps the CX Pulse columns.
        field: "reply",
        headerName: "Reply",
        flex: 1.5,
        minWidth: 220,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.reply ?? ""}>
            {row.reply ?? <Typography component="span" variant="body2" color="text.disabled">(no reply)</Typography>}
          </Box>
        ),
      },
      {
        field: "reply_date",
        headerName: "Reply date",
        width: 150,
        sortable: false,
        description: "Approximate when Google only shows when the reply was posted as, for example, \"3 weeks ago\"",
        valueFormatter: (v: string | null) => v ?? "",
      },
    ],
    [],
  );

  const hidden = new Set((hiddenStored ?? DEFAULT_HIDDEN).split(",").filter(Boolean));
  const visibility: GridColumnVisibilityModel = Object.fromEntries(columns.map((c) => [c.field, !hidden.has(c.field)]));
  const toggleColumn = (field: string) => {
    const next = new Set(hidden);
    if (next.has(field)) next.delete(field);
    else if (columns.length - next.size > 1) next.add(field); // keep at least one column
    setHidden([...next].join(","));
  };
  const tableCsvColumns = orderCsvColumns(columns.filter((c) => !hidden.has(c.field)).map((c) => CSV_OF_FIELD[c.field] ?? ""));

  const selectedLocation = (locations.data ?? []).find((l) => l.id === filter.locationId) ?? null;
  // Region and Island group choices come from the locations the user can see, as on the Dashboard.
  const regionOptions = useMemo(() => {
    const rows = locations.data ?? [];
    return {
      regions: [
        ...REGION_CODES.filter((c) => rows.some((l) => l.region === c)).map((c) => ({ value: c, label: regionName(c) ?? c })),
        ...(rows.some((l) => !l.region) ? [{ value: UNASSIGNED, label: "Unassigned" }] : []),
      ],
      islands: ISLAND_GROUPS.filter((i) => rows.some((l) => regionIsland(l.region) === i)).map((i) => ({ value: i, label: i })),
    };
  }, [locations.data]);
  // Type choices come from the locations the user can see (as on the Dashboard); Unassigned only when some have none.
  const typeOptions = useMemo(() => {
    const rows = locations.data ?? [];
    const types = [...new Set(rows.map((l) => l.location_type).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b));
    return [
      { value: "", label: "All types" },
      ...types.map((t) => ({ value: t, label: t })),
      ...(rows.some((l) => !l.location_type) ? [{ value: UNASSIGNED, label: "Unassigned" }] : []),
    ];
  }, [locations.data]);

  return (
    <section aria-labelledby="reviews-heading">
      <Stack direction="row" spacing={2} sx={{ mb: 2.5, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 1.5 }}>
        <Typography id="reviews-heading" component="h2" sx={{ fontSize: 20, fontWeight: 600, color: "brand.head" }}>
          Reviews{" "}
          {reviews.data && (
            <Box component="span" sx={{ fontSize: 15, fontWeight: 400, color: "text.secondary", ml: 0.5 }}>
              {reviews.data.total.toLocaleString()}
            </Box>
          )}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          data-tour="reviews-export"
          disabled={exporter.isPending || invalidRange || reviews.data?.total === 0}
          onClick={() => {
            exporter.reset();
            setExporting(suggestedFileName(selectedLocation?.name));
          }}
        >
          {exporter.isPending ? "Preparing…" : "Export CSV"}
        </Button>
      </Stack>
      <Menu anchorEl={columnsMenu} open={!!columnsMenu} onClose={() => setColumnsMenu(null)}>
        {columns.map((c) => (
          <MenuItem key={c.field} dense onClick={() => toggleColumn(c.field)}>
            <Checkbox size="small" checked={!hidden.has(c.field)} sx={{ p: 0, mr: 1 }} tabIndex={-1} />
            <ListItemText primary={c.headerName} />
          </MenuItem>
        ))}
      </Menu>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap sx={{ mb: 2, flexWrap: "wrap" }} data-tour="reviews-filters">
        <TextField size="small" label={SEARCH_LABEL[filter.searchIn]} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }} />
        <SelectField label="Client" value={filter.groupId} width={170} options={groupOptions(groups.data, "All clients")} onChange={(groupId) => set({ groupId })} />
        <SelectField label="Type" value={filter.locationType} width={170} options={typeOptions} onChange={(locationType) => set({ locationType })} />
        <Autocomplete
          size="small"
          options={locations.data ?? []}
          getOptionLabel={(l) => l.name}
          value={selectedLocation}
          onChange={(_e, v) => set({ locationId: v?.id ?? "" })}
          renderInput={(p) => <TextField {...p} label="Location" />}
          sx={{ minWidth: 240 }}
        />
        <DateRange from={filter.from} to={filter.to} onChange={set} />
        <SelectField label="Rating" value={filter.rating} width={150} options={RATING_OPTIONS} onChange={(rating) => set({ rating })} />
        <MoreFilters filter={filter} onChange={set} regions={regionOptions.regions} islands={regionOptions.islands} />
        <Button variant="outlined" startIcon={<ViewColumnOutlinedIcon />} onClick={(e) => setColumnsMenu(e.currentTarget)} aria-haspopup="menu" sx={{ alignSelf: { xs: "flex-start", md: "auto" } }}>
          Columns
        </Button>
        {(search || (Object.keys(EMPTY_REVIEW_FILTER) as (keyof ReviewFilterState)[]).some((k) => filter[k] !== EMPTY_REVIEW_FILTER[k])) && (
          <Button
            onClick={() => {
              setSearch("");
              set(EMPTY_REVIEW_FILTER);
            }}
          >
            Clear
          </Button>
        )}
      </Stack>

      {invalidRange && <Alert severity="warning" sx={{ mb: 2 }}>&quot;From&quot; must be on or before &quot;To&quot;.</Alert>}
      {reviews.isError ? (
        <RetryAlert what="reviews" onRetry={() => void reviews.refetch()} />
      ) : (
        // A sort, page or filter change keeps the old rows on screen while the new ones load: dim them and show a spinner
        // that stays in view (the grid's own one sits in the middle of the table, off screen on a long page).
        <LoadingOverlay active={reviews.isPlaceholderData}>
        <Box sx={gridScrollSx}>
        <DataGrid
          autoHeight
          {...PLAIN_GRID_PROPS}
          rows={reviews.data?.rows ?? []}
          columns={columns}
          columnVisibilityModel={visibility}
          loading={reviews.isPending}
          rowCount={reviews.data?.total ?? 0}
          paginationMode="server"
          sortingMode="server"
          // No "unsorted" step: the table is always in some order, and it would fall back to date and look like a missed click.
          sortingOrder={["asc", "desc"]}
          paginationModel={paging}
          onPaginationModelChange={setPaging}
          sortModel={sort}
          onSortModelChange={(m) => {
            setSort(m.length ? m : [{ field: "datetime", sort: "desc" }]);
            setPaging((p) => ({ ...p, page: 0 }));
          }}
          pageSizeOptions={[25, 50, 100]}
          disableColumnMenu
          disableRowSelectionOnClick
          onRowClick={({ row }) => setOpen(row)}
          sx={[plainGridSx, { "& .MuiDataGrid-row": { cursor: "pointer" } }] as SxProps<Theme>}
          slotProps={GRID_LOADING_PROPS}
          localeText={{ noRowsLabel: "No reviews match. Extract locations above or change the filters." }}
        />
        </Box>
        </LoadingOverlay>
      )}

      {exporting !== null && (
        <CsvExportDialog
          total={reviews.data?.total}
          tableColumns={tableCsvColumns}
          suggestedName={exporting}
          busy={exporter.isPending}
          error={exporter.isError ? exporter.error.message : null}
          onClose={() => setExporting(null)}
          onExport={(cols, fileName) =>
            exporter.mutate({ ...params, ...order, columns: cols.join(","), fileName }, { onSuccess: () => setExporting(null) })
          }
        />
      )}

      {open && (
        <AppDialog title={`${open.first_name} ${open.last_name !== "N/A" ? open.last_name : ""}`} onClose={() => setOpen(null)} closeLabel="Close">
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Stars value={open.rating} />
            <Typography variant="body2" color="text.secondary">
              {open.datetime} · {open.branch}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">{open.location}</Typography>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>{open.comment ?? "(rating only, no comment)"}</Typography>
          {open.reply && (
            <Box sx={{ borderLeft: 3, borderColor: "divider", pl: 1.5 }}>
              <Typography variant="caption" color="text.secondary">Owner reply</Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{open.reply}</Typography>
            </Box>
          )}
          {open.reviewer_url && <Link href={open.reviewer_url} target="_blank" rel="noopener noreferrer" variant="body2">Google profile of the reviewer</Link>}
          <Typography variant="caption" color="text.secondary">Reference # {open.reference}</Typography>
        </AppDialog>
      )}
    </section>
  );
}
