"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { RetryAlert } from "@/components/ui/retry-alert";
import { SelectField, type Option } from "@/components/ui/select-field";
import { ApiClientError } from "@/lib/client/api-client";
import { useAutoExtract, useSaveAutoExtract } from "@/lib/client/hooks";
import { formatRelative } from "@/lib/format";
import type { AutoExtractInput, AutoExtractStatus } from "@/lib/schemas/auto-extract";

/** "06:15" as "6:15 AM". */
export const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** 00:00, 00:15, … 23:45, labelled "6:00 AM". */
const TIMES: Option[] = Array.from({ length: 96 }, (_, i) => {
  const value = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
  return { value, label: timeLabel(value) };
});

const STATUS: Record<string, string> = { completed: "Completed", partial: "Partly done", failed: "Failed", running: "Running" };

function when(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("en-PH", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Form({ data }: { data: AutoExtractStatus }) {
  const saved: AutoExtractInput = { enabled: data.enabled, time: data.time, credit_limit: data.credit_limit };
  const [form, setForm] = useState(saved);
  const [limitText, setLimitText] = useState(String(data.credit_limit));
  const save = useSaveAutoExtract();
  const limitOk = /^\d+$/.test(limitText) && Number(limitText) <= 5000;
  const dirty = form.enabled !== saved.enabled || form.time !== saved.time || Number(limitText) !== saved.credit_limit;

  const submit = () => {
    if (!limitOk) return;
    // On success the saved settings replace the cached ones and the card remounts the form from them.
    save.mutate({ ...form, credit_limit: Number(limitText) });
  };

  const next = !data.next_run_at
    ? null
    : data.due
      ? "at the next scheduler call (within 15 minutes)"
      : `${when(data.next_run_at, data.time_zone)} (Manila time)`;
  const last = data.last_run;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, flexWrap: "wrap", rowGap: 2 }}>
        <FormControlLabel
          control={<Switch checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
          label={form.enabled ? "On" : "Off"}
        />
        <SelectField
          label="Time"
          value={form.time}
          options={TIMES}
          width={150}
          disabled={!form.enabled}
          helperText="Manila time (UTC+8)"
          onChange={(v) => setForm({ ...form, time: v })}
        />
        <TextField
          size="small"
          label="Credit limit per day"
          value={limitText}
          disabled={!form.enabled}
          onChange={(e) => setLimitText(e.target.value.replace(/\D/g, ""))}
          error={!limitOk}
          helperText={limitOk ? "1 credit = 20 reviews" : "0 to 5,000"}
          slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 4 } }}
          sx={{ width: 170 }}
        />
        <Button variant="contained" onClick={submit} disabled={!dirty || !limitOk} loading={save.isPending} sx={{ alignSelf: { sm: "flex-start" } }}>
          Save
        </Button>
      </Stack>

      {save.isError && <Alert severity="error">{save.error instanceof ApiClientError ? save.error.message : "Could not save. Try again."}</Alert>}

      <Stack spacing={0.75}>
        <Typography variant="body2">
          {data.enabled
            ? <>Next run: <strong>{next}</strong>. Covers all active locations: new reviews, and unfinished extractions continue.</>
            : "Off: reviews are only extracted when someone presses Extract."}
        </Typography>
        {last && (
          <Typography variant="body2" color="text.secondary">
            Last automatic run: {when(last.started_at, data.time_zone)} · {last.credits_used.toLocaleString()} credits · {last.reviews_upserted.toLocaleString()} reviews saved ·{" "}
            {STATUS[last.status] ?? last.status}
            {last.runs > 1 ? ` (${last.runs} runs)` : ""}
            {last.error ? ` — ${last.error}` : ""}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          Automatic runs count toward everyone&apos;s daily credit limit, not toward any person&apos;s own limit.
        </Typography>
      </Stack>

      {data.enabled && !data.scheduler_connected && (
        <Alert severity="warning">
          The scheduler has not called the app in the last 30 minutes
          {data.scheduler_last_tick_at ? ` (last call ${formatRelative(data.scheduler_last_tick_at)})` : ""}, so nothing will run. Check that the
          scheduler timer is running on the server and that CRON_SECRET and APP_URL are set (see the README).
        </Alert>
      )}
    </Stack>
  );
}

/** Admin: switch automatic daily extraction on and choose its time (Manila time). */
export function AutoExtractCard() {
  const q = useAutoExtract(true);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2, flexWrap: "wrap" }}>
        <ScheduleIcon color="primary" fontSize="small" />
        <Typography variant="h6" component="h2" sx={{ fontSize: "0.9375rem" }}>
          Automatic extraction
        </Typography>
        {q.data?.enabled && (
          <Chip
            size="small"
            variant="outlined"
            color={q.data.scheduler_connected ? "success" : "warning"}
            label={q.data.scheduler_connected ? "Scheduler connected" : "Scheduler not connected"}
          />
        )}
      </Stack>
      {q.isError ? (
        <RetryAlert what="the automatic extraction settings" onRetry={() => void q.refetch()} />
      ) : q.data ? (
        // Remounted when the saved settings change, so the form starts from them.
        <Form key={`${q.data.enabled}-${q.data.time}-${q.data.credit_limit}`} data={q.data} />
      ) : (
        <Skeleton variant="rounded" height={72} />
      )}
    </Paper>
  );
}
