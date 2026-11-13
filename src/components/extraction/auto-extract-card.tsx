"use client";

import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { RetryAlert } from "@/components/ui/retry-alert";
import { SelectField, type Option } from "@/components/ui/select-field";
import { StatusDot } from "@/components/ui/status-dot";
import { ApiClientError } from "@/lib/client/api-client";
import { useAutoExtract, useSaveAutoExtract } from "@/lib/client/hooks";
import { formatRelative } from "@/lib/format";
import type { AutoExtractInput, AutoExtractStatus } from "@/lib/schemas/auto-extract";
import { PanelDivider, PanelLabel } from "./panel-parts";

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

const STATUS: Record<string, string> = { success: "Completed", completed: "Completed", partial: "Partly done", failed: "Failed", running: "Running" };

function when(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("en-PH", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** The panel's heading, with the on/off switch (or nothing, while the settings load) on the right. */
function Heading({ children }: { children?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, minHeight: 44 }}>
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600, color: "brand.head" }}>
        Automatic extraction
      </Typography>
      {children}
    </Stack>
  );
}

/** Field label above its input, with a muted note beside it. */
function FieldLabel({ id, htmlFor, note, children }: { id?: string; htmlFor?: string; note: string; children: ReactNode }) {
  return (
    <Typography component="label" id={id} htmlFor={htmlFor} sx={{ display: "block", fontSize: 13, fontWeight: 600, mb: 0.75 }}>
      {children}{" "}
      <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>
        ({note})
      </Box>
    </Typography>
  );
}

function Form({ data, credits }: { data: AutoExtractStatus; credits: ReactNode }) {
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

  const next = !data.next_run_at ? null : data.due ? "at the next scheduler call (within 15 minutes)" : when(data.next_run_at, data.time_zone);
  const last = data.last_run;

  return (
    <>
      <Heading>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary" aria-hidden>
            {form.enabled ? "On" : "Off"}
          </Typography>
          <Switch
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            slotProps={{ input: { "aria-label": "Automatic extraction" } }}
          />
        </Stack>
      </Heading>

      {data.enabled && (
        <Typography component="div" variant="body2">
          <StatusDot tone={data.scheduler_connected ? "ok" : "warning"} label={data.scheduler_connected ? "Scheduler connected" : "Scheduler not connected"} />
        </Typography>
      )}

      {data.enabled && !data.scheduler_connected && (
        <Alert severity="warning">
          The scheduler has not called the app in the last 30 minutes
          {data.scheduler_last_tick_at ? ` (last call ${formatRelative(data.scheduler_last_tick_at)})` : ""}, so nothing will run. Check that the
          scheduler timer is running on the server and that CRON_SECRET and APP_URL are set (see the README).
        </Alert>
      )}

      {data.enabled ? (
        <div>
          <PanelLabel>Next run</PanelLabel>
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, color: "brand.head", mt: 0.5 }}>
            {next}
            {data.next_run_at && !data.due && (
              <Box component="span" sx={{ fontSize: 13, fontWeight: 400, color: "text.secondary", whiteSpace: "nowrap" }}>
                {" "}
                (Manila time)
              </Box>
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Covers all active locations: new reviews, and unfinished extractions continue.
          </Typography>
        </div>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Off: reviews are only extracted when someone presses Extract.
        </Typography>
      )}

      <Stack spacing={2}>
        <div>
          <FieldLabel id="auto-extract-time-label" note="Manila time, UTC+8">
            Time
          </FieldLabel>
          <SelectField
            value={form.time}
            options={TIMES}
            fullWidth
            disabled={!form.enabled}
            slotProps={{ select: { labelId: "auto-extract-time-label" } }}
            onChange={(v) => setForm({ ...form, time: v })}
          />
        </div>
        <div>
          <FieldLabel htmlFor="auto-extract-credit-limit" note="1 credit = 20 reviews">
            Credit limit per day
          </FieldLabel>
          <TextField
            id="auto-extract-credit-limit"
            size="small"
            fullWidth
            value={limitText}
            disabled={!form.enabled}
            onChange={(e) => setLimitText(e.target.value.replace(/\D/g, ""))}
            error={!limitOk}
            helperText={limitOk ? undefined : "0 to 5,000"}
            slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 4 } }}
          />
        </div>
        <Button variant="contained" fullWidth onClick={submit} disabled={!dirty || !limitOk} loading={save.isPending}>
          Save
        </Button>
        {save.isError && <Alert severity="error">{save.error instanceof ApiClientError ? save.error.message : "Could not save. Try again."}</Alert>}
      </Stack>

      {credits && (
        <>
          <PanelDivider />
          {credits}
        </>
      )}

      {last && (
        <>
          <PanelDivider />
          <div>
            <PanelLabel>Last automatic run</PanelLabel>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.75 }}>
              {when(last.started_at, data.time_zone)} · {STATUS[last.status] ?? last.status}
              {last.runs > 1 ? ` (${last.runs} runs)` : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {last.credits_used.toLocaleString()} credits · {last.reviews_upserted.toLocaleString()} reviews saved
            </Typography>
            {last.error && (
              <Typography variant="body2" sx={{ mt: 0.5, color: (t) => (t.palette.mode === "light" ? t.palette.error.dark : t.palette.error.main) }}>
                {last.error}
              </Typography>
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Admin: switch automatic daily extraction on and choose its time (Manila time). Renders the side panel's blocks;
 * `credits` (today's credit meters) sits between the settings and the last run.
 */
export function AutoExtractCard({ credits }: { credits?: ReactNode }) {
  const q = useAutoExtract(true);
  if (q.data) {
    // Remounted when the saved settings change, so the form starts from them.
    return <Form key={`${q.data.enabled}-${q.data.time}-${q.data.credit_limit}`} data={q.data} credits={credits} />;
  }
  return (
    <>
      <Heading />
      {q.isError ? <RetryAlert what="the automatic extraction settings" onRetry={() => void q.refetch()} /> : <Skeleton variant="rounded" height={160} />}
      {credits && (
        <>
          <PanelDivider />
          {credits}
        </>
      )}
    </>
  );
}
