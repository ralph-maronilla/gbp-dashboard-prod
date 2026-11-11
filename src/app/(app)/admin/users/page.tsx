"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import { NoAccess } from "@/components/no-access";
import { GRID_LOADING_PROPS, LoadingOverlay } from "@/components/ui/loading-overlay";
import { AppDialog } from "@/components/ui/app-dialog";
import { SelectField } from "@/components/ui/select-field";
import { ApiClientError } from "@/lib/client/api-client";
import {
  useAdminUsers,
  useAssignableOptions,
  useMe,
  useOnlineUsers,
  useSetUserLocations,
  useUpdateUser,
} from "@/lib/client/hooks";
import { useDebouncedField } from "@/lib/client/use-debounced";
import { formatRelative } from "@/lib/format";
import { isActive, pageLabel } from "@/lib/presence";
import { useUiStore } from "@/lib/store/ui-store";
import { ROLES, STATUSES, type Role } from "@/lib/schemas/common";
import type { AdminUser } from "@/lib/schemas/admin";

const statusColor = { pending: "warning", approved: "success", rejected: "error" } as const;

export default function AdminUsersPage() {
  const me = useMe();
  const filter = useUiStore((s) => s.usersFilter);
  const setFilter = useUiStore((s) => s.setUsersFilter);
  const [paging, setPaging] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [assigning, setAssigning] = useState<AdminUser | null>(null);

  const [search, setSearch] = useDebouncedField(filter.q, (q) => {
    setFilter({ q });
    setPaging((p) => ({ ...p, page: 0 }));
  });

  const users = useAdminUsers({
    page: paging.page,
    pageSize: paging.pageSize,
    status: filter.status === "all" ? undefined : filter.status,
    q: filter.q || undefined,
  });
  const update = useUpdateUser();
  const online = useOnlineUsers(me.data?.role === "admin");

  const columns = useMemo<GridColDef<AdminUser>[]>(
    () => [
      { field: "email", headerName: "Email", flex: 1.4, minWidth: 220 },
      { field: "full_name", headerName: "Name", flex: 1, minWidth: 140 },
      {
        field: "role",
        headerName: "Role",
        width: 140,
        sortable: false,
        renderCell: ({ row }) => (
          <Select
            size="small"
            variant="standard"
            value={row.role}
            disabled={row.id === me.data?.id || update.isPending}
            onChange={(e) => update.mutate({ id: row.id, input: { action: "set_role", role: e.target.value as Role } })}
          >
            {ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </Select>
        ),
      },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        sortable: false,
        renderCell: ({ row }) => <Chip size="small" label={row.status} color={statusColor[row.status]} />,
      },
      {
        field: "last_seen_at",
        headerName: "Activity",
        width: 190,
        sortable: false,
        renderCell: ({ row }) =>
          isActive(row.last_seen_at) ? (
            <Chip size="small" color="success" variant="outlined" label={`Active${row.last_path ? ` · ${pageLabel(row.last_path)}` : ""}`} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: "inherit" }}>
              {row.last_seen_at ? `Seen ${formatRelative(row.last_seen_at)}` : "Never seen"}
            </Typography>
          ),
      },
      {
        field: "credits_today",
        headerName: "Credits",
        width: 170,
        sortable: false,
        renderCell: ({ row }) => {
          const limit = users.data?.user_daily_credit_limit ?? 0;
          const color = limit && row.credits_today >= limit ? "error.main" : limit && row.credits_today >= limit * 0.8 ? "warning.main" : "text.primary";
          return (
            <Tooltip title={`Serper credits used today (UTC day) of the ${limit.toLocaleString()} daily limit, and in the last 30 days`}>
              <Typography variant="body2" sx={{ lineHeight: "inherit" }}>
                <Box component="span" sx={{ color, fontWeight: 600 }}>
                  {row.credits_today.toLocaleString()} / {limit.toLocaleString()}
                </Box>{" "}
                <Box component="span" sx={{ color: "text.secondary" }}>
                  · {row.credits_30d.toLocaleString()} in 30 d
                </Box>
              </Typography>
            </Tooltip>
          );
        },
      },
      {
        field: "created_at",
        headerName: "Signed up",
        width: 130,
        sortable: false,
        valueFormatter: (v: string) => new Date(v).toLocaleDateString(),
      },
      {
        field: "assignments",
        headerName: "Access",
        width: 150,
        sortable: false,
        valueGetter: (_v, row) => row.location_ids.length + row.group_ids.length,
        renderCell: ({ row, value }) =>
          row.role === "admin" ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: "inherit" }}>
              All locations
            </Typography>
          ) : (
            <Button size="small" variant="outlined" onClick={() => setAssigning(row)}>
              {value ? `Edit (${value})` : "Assign access"}
            </Button>
          ),
      },
      {
        field: "actions",
        headerName: "Actions",
        width: 200,
        sortable: false,
        renderCell: ({ row }) => {
          const self = row.id === me.data?.id;
          return (
            <Stack direction="row" spacing={1} sx={{ height: "100%", alignItems: "center" }}>
              {row.status !== "approved" && (
                <Button size="small" variant="contained" disabled={self || update.isPending} onClick={() => update.mutate({ id: row.id, input: { action: "approve" } })}>
                  Approve
                </Button>
              )}
              {row.status !== "rejected" && (
                <Button size="small" color="error" disabled={self || update.isPending} onClick={() => update.mutate({ id: row.id, input: { action: "reject" } })}>
                  Reject
                </Button>
              )}
            </Stack>
          );
        },
      },
    ],
    [me.data?.id, update, users.data?.user_daily_credit_limit],
  );

  const forbidden = (users.error instanceof ApiClientError && users.error.isForbidden) || (me.data && me.data.role !== "admin");
  if (forbidden) return <NoAccess />;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Users
      </Typography>
      <Typography variant="body2" color="text.secondary" component="div">
        {online.data
          ? `${online.data.active.length} ${online.data.active.length === 1 ? "person" : "people"} active in the last hour`
          : "Checking who is active…"}
        {online.data && online.data.active.length > 0 && (
          <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
            {online.data.active.map((u) => (
              <Chip key={u.id} size="small" color="success" variant="outlined" label={`${u.full_name || u.email}${u.last_path ? ` · ${pageLabel(u.last_path)}` : ""}`} />
            ))}
          </Stack>
        )}
      </Typography>
      {update.isError && <Alert severity="error">{update.error.message}</Alert>}
      {users.isError && !forbidden && <Alert severity="error">Could not load users. {users.error.message}</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField size="small" label="Search email or name" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 260 }} />
        <SelectField
          label="Status"
          value={filter.status}
          width={160}
          options={[{ value: "all", label: "All" }, ...STATUSES.map((v) => ({ value: v, label: v }))]}
          onChange={(v) => {
            setFilter({ status: v as typeof filter.status });
            setPaging((p) => ({ ...p, page: 0 }));
          }}
        />
      </Stack>
      <LoadingOverlay active={update.isPending}>
      <DataGrid
        autoHeight
        rows={users.data?.rows ?? []}
        columns={columns}
        loading={users.isPending || users.isFetching}
        rowCount={users.data?.total ?? 0}
        paginationMode="server"
        paginationModel={paging}
        onPaginationModelChange={setPaging}
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        disableColumnMenu
        slotProps={{ noRowsOverlay: {}, ...GRID_LOADING_PROPS }}
        localeText={{ noRowsLabel: "No users match these filters" }}
      />
      </LoadingOverlay>
      {assigning && <AssignDialog user={assigning} onClose={() => setAssigning(null)} />}
    </Stack>
  );
}

function AssignDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const options = useAssignableOptions(true);
  const save = useSetUserLocations();
  const [locationIds, setLocationIds] = useState(user.location_ids);
  const [groupIds, setGroupIds] = useState(user.group_ids);

  const locations = options.data?.locations ?? [];
  const groups = options.data?.groups ?? [];

  return (
    <AppDialog
      title={`Assign access: ${user.email}`}
      busy={save.isPending || options.isPending}
      onClose={onClose}
      error={options.isError ? "Could not load locations." : save.isError ? save.error.message : null}
      confirm={{
        label: "Save",
        disabled: save.isPending || options.isPending,
        onClick: () => save.mutate({ id: user.id, input: { location_ids: locationIds, group_ids: groupIds } }, { onSuccess: onClose }),
      }}
    >
      <Autocomplete
        multiple
        loading={options.isPending}
        options={groups}
        getOptionLabel={(g) => g.name}
        value={groups.filter((g) => groupIds.includes(g.id))}
        onChange={(_e, v) => setGroupIds(v.map((g) => g.id))}
        renderInput={(p) => <TextField {...p} label="Clients" />}
        noOptionsText="No clients yet"
      />
      <Autocomplete
        multiple
        loading={options.isPending}
        options={locations}
        getOptionLabel={(l) => l.name}
        value={locations.filter((l) => locationIds.includes(l.id))}
        onChange={(_e, v) => setLocationIds(v.map((l) => l.id))}
        limitTags={4}
        disableCloseOnSelect
        renderInput={(p) => <TextField {...p} label="Individual locations" helperText={`${locationIds.length} of ${locations.length} selected`} />}
        noOptionsText="No locations discovered yet"
      />
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" disabled={locations.length === 0 || locationIds.length === locations.length} onClick={() => setLocationIds(locations.map((l) => l.id))}>
          Select all locations
        </Button>
        <Button size="small" disabled={locationIds.length === 0} onClick={() => setLocationIds([])}>
          Clear
        </Button>
      </Stack>
    </AppDialog>
  );
}
