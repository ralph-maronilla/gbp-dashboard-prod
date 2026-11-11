"use client";

import Link from "next/link";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DataSourceStrip } from "@/components/data-source-strip";
import { ExportButton } from "@/components/export-dialog";
import { LocationsGrid } from "@/components/locations-grid";
import { NoAccess } from "@/components/no-access";
import { StatCards } from "@/components/stat-cards";
import { RetryAlert } from "@/components/ui/retry-alert";
import { SelectField, groupOptions } from "@/components/ui/select-field";
import TextField from "@mui/material/TextField";
import { ApiClientError } from "@/lib/client/api-client";
import { useGroups, useLocations, useMe, useOverviewStats } from "@/lib/client/hooks";
import { useDebouncedField } from "@/lib/client/use-debounced";
import { useOverviewUrlSync } from "@/lib/client/use-overview-url-sync";
import { formatRelative } from "@/lib/format";
import { useUiStore } from "@/lib/store/ui-store";

export default function OverviewPage() {
  const ready = useOverviewUrlSync();
  const me = useMe();
  const stats = useOverviewStats();
  const groups = useGroups();
  const filter = useUiStore((s) => s.overviewFilter);
  const setFilter = useUiStore((s) => s.setOverviewFilter);

  const locations = useLocations({
    page: filter.page,
    pageSize: filter.pageSize,
    sort: filter.sort,
    order: filter.order,
    q: filter.q || undefined,
    group_id: filter.groupId || undefined,
  }, ready);

  // Typing is written into the filter (and back to page 1) after a pause.
  const [search, setSearch] = useDebouncedField(filter.q, (q) => setFilter({ q, page: 0 }), ready);

  if ([stats.error, locations.error].some((e) => e instanceof ApiClientError && e.isForbidden)) {
    return <NoAccess />;
  }

  const noLocationsAtAll = stats.data !== undefined && stats.data.location_count === 0;
  const isAdmin = me.data?.role === "admin";

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h5" component="h1">
          Overview
        </Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          {stats.data ? (
            <Typography variant="body2" color="text.secondary">
              Last synced {formatRelative(stats.data.sync.last_synced_at)}
            </Typography>
          ) : (
            <Skeleton width={140} />
          )}
          {!noLocationsAtAll && <ExportButton />}
        </Stack>
      </Stack>

      <DataSourceStrip stats={stats.data} groups={groups.data} groupId={filter.groupId} role={me.data?.role} />

      <StatCards stats={stats.data} loading={stats.isPending} error={stats.isError} onRetry={() => void stats.refetch()} />

      {noLocationsAtAll ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>
            No locations yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {isAdmin
              ? "Add locations and extract their reviews on the Extraction page."
              : "You don't have access to any locations yet. Ask an administrator to assign some to you."}
          </Typography>
          {isAdmin && (
            <Button component={Link} href="/extraction" variant="contained">
              Go to Extraction
            </Button>
          )}
        </Paper>
      ) : (
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              size="small"
              label="Search locations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: { sm: 280 } }}
            />
            <SelectField
              label="Group"
              value={filter.groupId}
              width={220}
              options={groupOptions(groups.data, "All groups", true)}
              onChange={(groupId) => setFilter({ groupId, page: 0 })}
              disabled={groups.isPending}
            />
          </Stack>

          {locations.isError ? (
            <RetryAlert what="locations" onRetry={() => void locations.refetch()} />
          ) : (
            <LocationsGrid
              rows={locations.data?.rows ?? []}
              total={locations.data?.total ?? 0}
              loading={!ready || locations.isPending || locations.isFetching}
              filter={filter}
              onFilterChange={setFilter}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}
