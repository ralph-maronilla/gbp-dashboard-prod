"use client";

import { useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { AppDialog } from "@/components/ui/app-dialog";
import { useGroups, useUpdateLocation } from "@/lib/client/hooks";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import { ISLAND_GROUPS, PH_REGIONS } from "@/lib/ph-regions";
import { BRANCH_PREFIX_MAX, LABEL_MAX, TYPE_SUGGESTIONS, type UpdateLocationInput } from "@/lib/schemas/export";
import type { ExtractLocationRow } from "@/lib/schemas/extract";

const PREFIX_RE = /^[A-Za-z0-9 _.\/-]*$/;

/** Edit everything about a location in one place; only changed fields are sent. */
export function EditLocationDialog({ location, onClose }: { location: ExtractLocationRow; onClose: () => void }) {
  const groups = useGroups();
  const update = useUpdateLocation();
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address ?? "");
  const [prefix, setPrefix] = useState(location.branch_prefix ?? "");
  const [region, setRegion] = useState(location.region ?? "");
  const [type, setType] = useState(location.location_type ?? "");
  const [active, setActive] = useState(location.is_active);
  const [clientIds, setClientIds] = useState(location.clients.map((c) => c.id));

  const nameError = !name.trim() ? "Name is required" : null;
  const tooLong = (v: string) => (v.trim().length > LABEL_MAX ? `At most ${LABEL_MAX} characters` : null);
  const typeError = tooLong(type);
  const prefixError =
    prefix.trim().length > BRANCH_PREFIX_MAX ? `At most ${BRANCH_PREFIX_MAX} characters` : !PREFIX_RE.test(prefix) ? "Use letters, numbers, spaces and - _ . /" : null;

  // Only what changed goes to the server.
  const input: UpdateLocationInput = {};
  if (name.trim() !== location.name) input.name = name.trim();
  if (address.trim() !== (location.address ?? "")) input.address = address.trim() || null;
  if (prefix.trim() !== (location.branch_prefix ?? "")) input.branch_prefix = prefix.trim() || null;
  const label = (v: string) => v.replace(/\s+/g, " ").trim();
  if (region !== (location.region ?? "")) input.region = region || null;
  if (label(type) !== (location.location_type ?? "")) input.location_type = label(type) || null;
  if (active !== location.is_active) input.is_active = active;
  const before = location.clients.map((c) => c.id).sort().join(",");
  if ([...clientIds].sort().join(",") !== before) input.group_ids = clientIds;
  const changed = Object.keys(input).length > 0;

  // Clients not in the list (e.g. one the admin can no longer see) are kept as chips from the row itself.
  const options = groups.data ?? location.clients;
  const byId = new Map([...location.clients, ...options].map((g) => [g.id, g]));

  return (
    <AppDialog
      title="Edit location"
      busy={update.isPending}
      onClose={onClose}
      error={update.isError ? update.error.message : null}
      confirm={{
        label: update.isPending ? "Saving…" : "Save",
        disabled: !changed || !!nameError || !!prefixError || !!typeError || update.isPending,
        onClick: () => update.mutate({ id: location.id, input }, { onSuccess: onClose }),
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!!nameError} helperText={nameError ?? " "} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
      <TextField
        label="Branch prefix"
        value={prefix}
        onChange={(e) => setPrefix(e.target.value)}
        error={!!prefixError}
        helperText={prefixError ?? "Goes in the CSV export's branch column (for example HMN-QC). Empty uses the location name."}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField select fullWidth label="Region" value={region} onChange={(e) => setRegion(e.target.value)} helperText="Philippine region, used by the Dashboard.">
          <MenuItem value="">
            <em>Not set</em>
          </MenuItem>
          {ISLAND_GROUPS.flatMap((island) => [
            <ListSubheader key={island}>{island}</ListSubheader>,
            ...PH_REGIONS.filter((r) => r.island === island).map((r) => (
              <MenuItem key={r.code} value={r.code}>
                {r.name}
              </MenuItem>
            )),
          ])}
        </TextField>
        <Autocomplete
          freeSolo
          fullWidth
          options={TYPE_SUGGESTIONS}
          inputValue={type}
          onInputChange={(_e, v) => setType(v)}
          renderInput={(p) => <TextField {...p} label="Type" error={!!typeError} helperText={typeError ?? "e.g. Hospital, Outpatient Center."} />}
        />
      </Stack>
      <Autocomplete
        multiple
        options={[...byId.values()]}
        getOptionLabel={(g) => g.name}
        value={clientIds.flatMap((id) => byId.get(id) ?? [])}
        onChange={(_e, v) => setClientIds(v.map((g) => g.id))}
        loading={groups.isPending}
        renderInput={(p) => <TextField {...p} label="Clients" helperText="Users assigned to a client see this location." />}
      />
      <FormControlLabel
        control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
        label={active ? "Active (included in extraction)" : "Inactive (not extracted, hidden from non-admins)"}
      />
    </AppDialog>
  );
}
