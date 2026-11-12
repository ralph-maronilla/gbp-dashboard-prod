"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { useAutofillRegions, useExtractLocations, useGroups, useUpdateLocation } from "@/lib/client/hooks";
import { useExtractionRunner } from "@/lib/client/use-extraction-runner";
import { formatRelative } from "@/lib/format";
import type { Role } from "@/lib/schemas/common";
import type { ExtractLocationRow, ExtractState } from "@/lib/schemas/extract";
import { BRANCH_PREFIX_MAX } from "@/lib/schemas/export";
import { GRID_LOADING_PROPS, LoadingOverlay } from "@/components/ui/loading-overlay";
import { RetryAlert } from "@/components/ui/retry-alert";
import { SelectField, groupOptions } from "@/components/ui/select-field";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { AddLocationsDialog } from "./add-locations-dialog";
import { DeleteLocationDialog } from "./delete-location-dialog";
import { EditLocationDialog } from "./edit-location-dialog";
import { GoogleRefreshDialog } from "./google-refresh-dialog";
import { PLAIN_GRID_PROPS, STRONG_CELL, gridScrollSx, plainGridSx } from "./grid-styles";

/** Status as a dot and label: teal for "Up to date", the signal colors for the rest. */
const STATE: Record<ExtractState, { label: string; tone: StatusTone }> = {
  never: { label: "Not extracted", tone: "neutral" },
  extracting: { label: "Extracting", tone: "info" },
  backfilling: { label: "Partly extracted", tone: "warning" },
  catching_up: { label: "Catching up", tone: "warning" },
  up_to_date: { label: "Up to date", tone: "ok" },
  error: { label: "Error", tone: "error" },
};

const EMPTY_SELECTION: GridRowSelectionModel = { type: "include", ids: new Set() };

interface Props {
  role: Role;
  /** Admins, and users an admin allowed to run manual extractions. */
  canExtract: boolean;
  /** Clicking a location's review count shows its reviews below. */
  onShowReviews: (locationId: string) => void;
}

export function LocationsPanel({ role, canExtract, onShowReviews }: Props) {
  const isAdmin = role === "admin";
  const { progress, start, stop } = useExtractionRunner();
  const locations = useExtractLocations(progress.running ? 3_000 : false);
  const groups = useGroups();
  const update = useUpdateLocation();
  const [clientId, setClientId] = useState("");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<GridRowSelectionModel>(EMPTY_SELECTION);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ExtractLocationRow | null>(null);
  const [deleting, setDeleting] = useState<ExtractLocationRow | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<{ ids: string[] | undefined; label: string } | null>(null);
  const autofill = useAutofillRegions();

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (locations.data ?? []).filter(
      (l) =>
        (!clientId || l.clients.some((c) => c.id === clientId)) &&
        (!term || l.name.toLowerCase().includes(term) || (l.address ?? "").toLowerCase().includes(term) || (l.branch_prefix ?? "").toLowerCase().includes(term)),
    );
  }, [locations.data, clientId, search]);

  const selectedIds = [...selection.ids].map(String).filter((id) => rows.some((r) => r.id === id));
  const activeVisible = rows.filter((r) => r.is_active).map((r) => r.id);

  const columns = useMemo<GridColDef<ExtractLocationRow>[]>(
    () => [
      { field: "name", headerName: "Location", flex: 1.2, minWidth: 200, editable: isAdmin, cellClassName: STRONG_CELL },
      {
        field: "clients",
        headerName: "Client",
        flex: 0.8,
        minWidth: 140,
        sortable: false,
        valueGetter: (_v, row) => row.clients.map((c) => c.name).join(", "),
      },
      { field: "region", headerName: "Region", width: 110, valueFormatter: (v: string | null) => v ?? "", description: "Philippine region code (set in Edit)" },
      { field: "location_type", headerName: "Type", width: 110, valueFormatter: (v: string | null) => v ?? "" },
      { field: "branch_prefix", headerName: "Branch prefix", width: 130, editable: isAdmin, valueFormatter: (v: string | null) => v ?? "" },
      { field: "address", headerName: "Address", flex: 1, minWidth: 180, editable: isAdmin, valueFormatter: (v: string | null) => v ?? "" },
      {
        field: "state",
        headerName: "Status",
        width: 150,
        renderCell: ({ row }) => {
          const status = <StatusDot tone={STATE[row.state].tone} label={STATE[row.state].label} />;
          return row.last_error ? <Tooltip title={row.last_error}>{status}</Tooltip> : status;
        },
      },
      {
        field: "review_count",
        headerName: "Reviews",
        width: 130,
        renderCell: ({ row }) => (
          <Button size="small" onClick={() => onShowReviews(row.id)} sx={{ minWidth: 0, px: 0.5 }}>
            {row.source_review_count !== null ? `${row.review_count} / ~${row.source_review_count}` : row.review_count}
          </Button>
        ),
      },
      {
        field: "google_rating",
        headerName: "Google",
        width: 110,
        description: "Google's public rating and review count, from the last Refresh Google totals",
        renderCell: ({ row }) =>
          row.google_checked_at ? (
            <Tooltip title={`As of ${new Date(row.google_checked_at).toLocaleDateString()}`}>
              <span>
                {row.google_rating?.toFixed(1) ?? "-"}★ · {row.source_review_count?.toLocaleString() ?? "-"}
              </span>
            </Tooltip>
          ) : (
            ""
          ),
      },
      { field: "last_synced_at", headerName: "Last extracted", width: 130, valueFormatter: (v: string | null) => formatRelative(v) },
      ...(isAdmin
        ? [
            {
              field: "is_active",
              headerName: "Active",
              width: 80,
              renderCell: ({ row }) => (
                <Switch
                  size="small"
                  checked={row.is_active}
                  onChange={(e) => update.mutate({ id: row.id, input: { is_active: e.target.checked } }, { onError: (err) => setEditError(err.message) })}
                  slotProps={{ input: { "aria-label": `Extract ${row.name}` } }}
                />
              ),
            } satisfies GridColDef<ExtractLocationRow>,
            {
              field: "actions",
              headerName: "",
              width: 100,
              sortable: false,
              renderCell: ({ row }) => (
                <Stack direction="row" sx={{ height: "100%", alignItems: "center" }}>
                  <Tooltip title="Edit">
                    <IconButton size="small" aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" aria-label={`Delete ${row.name}`} onClick={() => setDeleting(row)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ),
            } satisfies GridColDef<ExtractLocationRow>,
          ]
        : []),
    ],
    [isAdmin, update, onShowReviews],
  );

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section aria-labelledby="locations-heading">
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5, alignItems: { sm: "center" }, justifyContent: "space-between" }}>
        <Typography id="locations-heading" component="h2" sx={{ fontSize: 20, fontWeight: 600, color: "brand.head" }}>
          Locations{" "}
          {locations.data && (
            <Box component="span" sx={{ fontSize: 15, fontWeight: 400, color: "text.secondary", ml: 0.5 }}>
              {rows.length.toLocaleString()}
            </Box>
          )}
        </Typography>
        {canExtract && (
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap" }} data-tour="extract">
            {progress.running ? (
              <Button color="warning" variant="contained" startIcon={<StopIcon />} onClick={stop}>
                Stop
              </Button>
            ) : (
              <>
                {/* The one orange action on this screen. */}
                <Button variant="contained" color="accent" disabled={activeVisible.length === 0} onClick={() => start(clientId || search ? activeVisible : undefined)}>
                  Extract {clientId || search ? `these ${activeVisible.length}` : "all"}
                </Button>
                <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={selectedIds.length === 0} onClick={() => start(selectedIds)}>
                  Extract selected ({selectedIds.length})
                </Button>
              </>
            )}
          </Stack>
        )}
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap sx={{ mb: 2, flexWrap: "wrap" }}>
        <TextField size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 200 }} />
        {isAdmin && (
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Add locations
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outlined"
            onClick={() =>
              setRefreshing(
                selectedIds.length > 0
                  ? { ids: selectedIds, label: `the ${selectedIds.length} selected location${selectedIds.length === 1 ? "" : "s"}` }
                  : clientId || search
                    ? { ids: rows.map((r) => r.id), label: `these ${rows.length} locations` }
                    : { ids: undefined, label: `all ${rows.length} locations` },
              )
            }
            disabled={rows.length === 0}
          >
            Refresh Google totals{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
          </Button>
        )}
        {isAdmin && (
          <Tooltip title="Sets empty regions from each location's address or name. Free.">
            <span>
              <Button variant="outlined" onClick={() => autofill.mutate()} disabled={autofill.isPending} sx={{ width: { xs: "100%", md: "auto" } }}>
                {autofill.isPending ? "Filling…" : "Auto-fill regions"}
              </Button>
            </span>
          </Tooltip>
        )}
        <SelectField label="Client" value={clientId} width={180} options={groupOptions(groups.data, "All clients")} onChange={setClientId} />
      </Stack>

      {canExtract && (progress.running || progress.message || progress.error) && (
        <Stack spacing={0.75} sx={{ mb: 2 }}>
          {progress.running && <LinearProgress variant={progress.total ? "determinate" : "indeterminate"} value={pct} />}
          {progress.error ? (
            <Alert severity="error">{progress.error}</Alert>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {progress.message}
              {progress.slices > 0 &&
                ` ${progress.done} of ${progress.total} locations up to date · ${progress.reviewsSaved.toLocaleString()} reviews saved · ${progress.creditsUsed.toLocaleString()} credits` +
                  (progress.failed ? ` · ${progress.failed} failed` : "")}
            </Typography>
          )}
        </Stack>
      )}

      {autofill.data && (
        <Alert severity={autofill.data.set.length ? "success" : "info"} sx={{ mb: 2 }} onClose={() => autofill.reset()}>
          {autofill.data.set.length
            ? `Regions set: ${autofill.data.set.map((s) => `${s.name} → ${s.region}`).join(", ")}. The rest need an address (Refresh Google totals) or a manual choice in Edit.`
            : "No region could be detected for the locations without one. Refresh Google totals to get their addresses, or choose the region in Edit."}
        </Alert>
      )}
      {autofill.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {autofill.error.message}
        </Alert>
      )}
      {editError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setEditError(null)}>
          {editError}
        </Alert>
      )}
      {locations.isError ? (
        <RetryAlert what="locations" onRetry={() => void locations.refetch()} />
      ) : (
        <LoadingOverlay active={update.isPending || autofill.isPending}>
        <Box sx={gridScrollSx}>
        <DataGrid
          autoHeight
          {...PLAIN_GRID_PROPS}
          sx={plainGridSx}
          rows={rows}
          columns={columns}
          loading={locations.isPending}
          checkboxSelection={canExtract}
          rowSelectionModel={selection}
          onRowSelectionModelChange={setSelection}
          isRowSelectable={({ row }) => row.is_active}
          disableRowSelectionOnClick
          disableColumnMenu
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          localeText={{ noRowsLabel: isAdmin ? "No locations yet. Click Add locations." : "No locations assigned to you yet." }}
          processRowUpdate={async (next, prev) => {
            const input: { name?: string; address?: string | null; branch_prefix?: string | null } = {};
            const name = String(next.name ?? "").trim();
            const address = String(next.address ?? "").trim();
            const prefix = String(next.branch_prefix ?? "").trim();
            if (name && name !== prev.name) input.name = name;
            if (address !== (prev.address ?? "")) input.address = address || null;
            if (prefix !== (prev.branch_prefix ?? "")) {
              if (prefix.length > BRANCH_PREFIX_MAX) throw new Error(`Branch prefix: at most ${BRANCH_PREFIX_MAX} characters`);
              input.branch_prefix = prefix || null;
            }
            if (Object.keys(input).length === 0) return prev;
            setEditError(null);
            await update.mutateAsync({ id: next.id, input });
            return { ...prev, ...input };
          }}
          onProcessRowUpdateError={(err: Error) => setEditError(err.message)}
          slotProps={GRID_LOADING_PROPS}
        />
        </Box>
        </LoadingOverlay>
      )}
      {adding && <AddLocationsDialog onClose={() => setAdding(false)} />}
      {refreshing && <GoogleRefreshDialog ids={refreshing.ids} label={refreshing.label} onClose={() => setRefreshing(null)} />}
      {editing && <EditLocationDialog location={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <DeleteLocationDialog
          location={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id) => setSelection((sel) => ({ ...sel, ids: new Set([...sel.ids].filter((x) => x !== id)) }))}
        />
      )}
    </section>
  );
}
