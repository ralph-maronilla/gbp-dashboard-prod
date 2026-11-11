"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DownloadIcon from "@mui/icons-material/Download";
import Alert from "@mui/material/Alert";
import { AppDialog } from "@/components/ui/app-dialog";
import { DateRange } from "@/components/ui/date-range";
import { SelectField, groupOptions } from "@/components/ui/select-field";
import { useExportReviews, useGroups } from "@/lib/client/hooks";

interface ExportButtonProps {
  /** Fixes the export to one location; omit to export every location you can access in one file. */
  locationId?: string;
  locationName?: string;
}

/** "Export CSV" button + filter dialog. Without `locationId` it consolidates all accessible locations. */
export function ExportButton({ locationId, locationName }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => setOpen(true)}>
        Export CSV
      </Button>
      {open && <ExportDialog locationId={locationId} locationName={locationName} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExportDialog({ locationId, locationName, onClose }: ExportButtonProps & { onClose: () => void }) {
  const groups = useGroups();
  const exporter = useExportReviews();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupId, setGroupId] = useState("");
  const [rating, setRating] = useState("");

  const invalidRange = Boolean(from && to && from > to);

  return (
    <AppDialog
      title="Export reviews (CSV)"
      maxWidth="xs"
      busy={exporter.isPending}
      onClose={onClose}
      closeLabel="Close"
      error={exporter.isError ? exporter.error.message : null}
      confirm={{
        label: exporter.isPending ? "Preparing…" : "Download",
        disabled: exporter.isPending || invalidRange,
        onClick: () => exporter.mutate({ from, to, rating, location_id: locationId, group_id: groupId || undefined }),
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {locationId ? `Reviews of ${locationName ?? "this location"}.` : "One file with the reviews of every location you can access, or narrow it below."}
      </Typography>
      {exporter.isSuccess && <Alert severity="success">Download started.</Alert>}
      <Stack direction="row" spacing={2}>
        <DateRange from={from} to={to} fullWidth onChange={(p) => { if (p.from !== undefined) setFrom(p.from); if (p.to !== undefined) setTo(p.to); }} />
      </Stack>
      {!locationId && <SelectField label="Client / group" value={groupId} onChange={setGroupId} options={groupOptions(groups.data, "All locations", true)} />}
      <SelectField
        label="Rating"
        value={rating}
        onChange={setRating}
        options={[{ value: "", label: "All ratings" }, { value: "1,2", label: "1–2 stars (low)" }, { value: "3", label: "3 stars" }, { value: "4,5", label: "4–5 stars (high)" }]}
      />
    </AppDialog>
  );
}
