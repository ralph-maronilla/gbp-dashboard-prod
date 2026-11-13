"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import { StatusDot } from "@/components/ui/status-dot";
import { ApiClientError } from "@/lib/client/api-client";
import { useSheetSync, useSyncSheetNow } from "@/lib/client/hooks";
import { formatRelative } from "@/lib/format";
import { PanelDivider, PanelLabel } from "./panel-parts";

/**
 * Admin: the Google Sheet that mirrors the reviews (one tab per location and "All reviews"). Shows when it was last
 * written and whether an update is waiting for the scheduler, with "Sync now" to write it at once. A block of the side
 * panel, led by its divider; renders nothing until its state has loaded.
 */
export function SheetSyncBlock() {
  const q = useSheetSync(true);
  const sync = useSyncSheetNow();
  const s = q.data;
  if (!s) return null;

  if (!s.configured) {
    return (
      <>
        <PanelDivider />
        <div>
          <PanelLabel>Google Sheet</PanelLabel>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Not set up. The reviews can be copied to a Google Sheet automatically: see &quot;Google Sheet mirror&quot; in the deployment runbook.
          </Typography>
        </div>
      </>
    );
  }

  const error = sync.isError ? (sync.error instanceof ApiClientError ? sync.error.message : "The sheet could not be written. Try again.") : s.error;
  return (
    <>
      <PanelDivider />
      <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <PanelLabel>Google Sheet</PanelLabel>
        {s.sheet_url && (
          <Link href={s.sheet_url} target="_blank" rel="noopener noreferrer" variant="body2" underline="hover" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontWeight: 600 }}>
            Open sheet
            <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
          </Link>
        )}
      </Stack>
      <div>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {s.synced_at ? `Last synced ${formatRelative(s.synced_at)}` : "Not synced yet"}
        </Typography>
        {s.synced_at && s.rows !== null && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {s.rows.toLocaleString()} reviews · one tab per location
          </Typography>
        )}
      </div>
      {s.pending && !sync.isPending && (
        <Typography component="div" variant="body2">
          <StatusDot tone="info" label="Update pending" />
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Changes since the last sync are written at the next scheduler call (within 15 minutes), after any running extraction.
          </Typography>
        </Typography>
      )}
      {error && !sync.isPending && <Alert severity="error">{error}</Alert>}
      <Button variant="outlined" fullWidth onClick={() => sync.mutate()} loading={sync.isPending}>
        Sync now
      </Button>
      </Stack>
    </>
  );
}
