"use client";

import { useState } from "react";
import DialogContentText from "@mui/material/DialogContentText";
import TextField from "@mui/material/TextField";
import { AppDialog } from "@/components/ui/app-dialog";
import { useDeleteLocation } from "@/lib/client/hooks";
import type { ExtractLocationRow } from "@/lib/schemas/extract";

/** Permanent delete. When the location has reviews, the admin must type its name to confirm. */
export function DeleteLocationDialog({ location, onClose, onDeleted }: { location: ExtractLocationRow; onClose: () => void; onDeleted: (id: string) => void }) {
  const del = useDeleteLocation();
  const [typed, setTyped] = useState("");
  const needsTyping = location.review_count > 0;
  const confirmed = !needsTyping || typed.trim() === location.name;

  return (
    <AppDialog
      title={`Delete ${location.name}?`}
      maxWidth="xs"
      busy={del.isPending}
      onClose={onClose}
      error={del.isError ? del.error.message : null}
      confirm={{
        label: del.isPending ? "Deleting…" : "Delete",
        color: "error",
        disabled: !confirmed || del.isPending,
        onClick: () =>
          del.mutate(location.id, {
            onSuccess: () => {
              onDeleted(location.id);
              onClose();
            },
          }),
      }}
    >
      <DialogContentText>
        This permanently deletes the location
        {needsTyping ? `, its ${location.review_count.toLocaleString()} stored review${location.review_count === 1 ? "" : "s"}` : ""}, its extraction
        history and its client and user assignments. It can&apos;t be undone, and adding the location again costs credits to extract its reviews again.
      </DialogContentText>
      {needsTyping && <TextField size="small" label={`Type "${location.name}" to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
    </AppDialog>
  );
}
