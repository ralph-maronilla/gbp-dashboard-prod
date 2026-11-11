"use client";

import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import type { GroupSummary, OverviewStats } from "@/lib/schemas/locations";
import type { Role } from "@/lib/schemas/common";

interface Props {
  stats: OverviewStats | undefined;
  groups: GroupSummary[] | undefined;
  /** Client currently chosen in the filter ("" = none). */
  groupId: string;
  role: Role | undefined;
}

/** "Viewing: <clients>", so users know whose data the page shows. */
export function DataSourceStrip({ stats, groups, groupId, role }: Props) {
  if (!stats || !groups || !role) return <Skeleton variant="rounded" width={280} height={28} />;
  const selected = groupId ? groups.find((g) => g.id === groupId) : undefined;
  const viewing: string[] = selected
    ? [selected.name]
    : role === "admin"
      ? [groups.length > 0 ? `All clients (${groups.length})` : "All locations"]
      : groups.length > 0
        ? groups.map((g) => g.name)
        : [`${stats.location_count} assigned location${stats.location_count === 1 ? "" : "s"}`];

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
      <Typography variant="body2" color="text.secondary">
        Viewing:
      </Typography>
      {viewing.map((name) => (
        <Chip key={name} size="small" icon={<GroupWorkIcon />} label={name} />
      ))}
    </Stack>
  );
}
