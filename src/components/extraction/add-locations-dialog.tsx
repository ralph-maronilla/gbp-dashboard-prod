"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AppDialog } from "@/components/ui/app-dialog";
import { useAddLocations, useGroups } from "@/lib/client/hooks";

const MAX_LOCATIONS = 500;

/**
 * Add locations by pasting Google Maps links (or CIDs), one per line, optionally as "Name | link". Free: no credits.
 * Admins file them under any client or a new one. Other people may only pick a client assigned to them; without one,
 * what they add is assigned to them.
 */
export function AddLocationsDialog({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const groups = useGroups();
  const [client, setClient] = useState(""); // existing client name or a new one
  const [pasted, setPasted] = useState("");
  const add = useAddLocations();

  const items = pasted
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const bar = line.lastIndexOf("|");
      return bar > 0 ? { name: line.slice(0, bar).trim() || undefined, input: line.slice(bar + 1).trim() } : { input: line };
    });

  const result = add.data;
  const submit = () =>
    add.mutate(
      { client_name: client.trim() || undefined, items },
      // Keep the lines that were not added, so they can be fixed and resubmitted.
      { onSuccess: (r) => setPasted(r.invalid.join("\n")) },
    );

  return (
    <AppDialog
      title="Add locations"
      maxWidth="md"
      busy={add.isPending}
      onClose={onClose}
      closeLabel="Close"
      error={add.isError ? add.error.message : null}
      confirm={{
        label: add.isPending ? "Adding…" : `Add ${items.length || ""} location${items.length === 1 ? "" : "s"}`,
        disabled: items.length === 0 || items.length > MAX_LOCATIONS || add.isPending,
        onClick: submit,
      }}
    >
      <Autocomplete
        freeSolo={isAdmin}
        options={(groups.data ?? []).map((g) => g.name)}
        inputValue={client}
        onInputChange={(_e, v) => setClient(v)}
        renderInput={(p) => (
          <TextField
            {...p}
            size="small"
            label={isAdmin ? "Client (pick one or type a new name)" : "Client (optional)"}
            helperText={
              isAdmin
                ? "Users assigned to this client will see these locations."
                : "Pick a client that is assigned to you, and everyone assigned to it will see these locations. Leave it empty to add them to your own list."
            }
          />
        )}
      />
      {result && !add.isPending && (
        <>
          <Alert severity={result.invalid.length ? "warning" : "success"}>
            {[`${result.added} added`, result.already_added ? `${result.already_added} already in the list (skipped)` : null, result.invalid.length ? `${result.invalid.length} not recognised` : null]
              .filter(Boolean)
              .join(", ")}
            .
          </Alert>
          {result.renamed.length > 0 && (
            <Alert severity="info">
              {result.renamed.length} had a name that is already used, so it was added as: {result.renamed.map((r) => r.to).join("; ")}. You can rename it with the pencil.
            </Alert>
          )}
          {result.invalid.length > 0 && <Alert severity="warning">Still in the box below: lines that are not a Google Maps link or CID. Place IDs (ChIJ…) are not supported; paste the Maps link instead.</Alert>}
        </>
      )}
      <TextField
        multiline
        minRows={8}
        label="Google Maps links or CIDs, one per line (optional name first: Name | link)"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder={"Healthway Cloverleaf | https://maps.app.goo.gl/...\nhttps://www.google.com/maps/place/...\n9299316743109092810"}
      />
      <Typography variant="body2" color="text.secondary">
        Free (no credits), up to {MAX_LOCATIONS} at a time. A place that is already in the list is skipped, even if it is
        pasted as a different kind of link. Without a name, the name in the link is used.
      </Typography>
    </AppDialog>
  );
}
