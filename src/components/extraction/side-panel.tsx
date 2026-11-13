"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { radius } from "@/lib/design-tokens";
import type { Role } from "@/lib/schemas/common";
import type { ExtractStatusDto } from "@/lib/schemas/extract";
import { AutoExtractCard } from "./auto-extract-card";
import { AutoExtractInfo } from "./auto-extract-info";
import { PanelLabel } from "./panel-parts";
import { SheetSyncBlock } from "./sheet-sync-block";

/** One credit row: who, used / limit, and a meter. The figures turn to the warning or error color near or over the limit. */
function CreditMeter({ label, used, limit, warnAt }: { label: string; used: number; limit: number; warnAt?: number }) {
  const over = used >= limit;
  const near = !over && warnAt !== undefined && used >= limit * warnAt;
  const tone = over ? "error" : near ? "warning" : null;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const id = `credits-${label.toLowerCase()}`;
  return (
    <div>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 0.75, gap: 1 }}>
        <Typography id={id} variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{ fontWeight: tone ? 600 : 400, color: (t) => (tone ? (t.palette.mode === "light" ? t.palette[tone].dark : t.palette[tone].main) : t.palette.text.secondary) }}
        >
          {used.toLocaleString()} / {limit.toLocaleString()}
        </Typography>
      </Stack>
      <Box
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${used.toLocaleString()} of ${limit.toLocaleString()} credits`}
        sx={{ height: 8, borderRadius: `${radius.pill}px`, bgcolor: "brand.track", overflow: "hidden" }}
      >
        <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: `${radius.pill}px`, bgcolor: "accent.main" }} />
      </Box>
    </div>
  );
}

/** "Credits today": the admin's own spend against their daily limit, or the warning that the Serper key is missing. */
function Credits({ status }: { status: ExtractStatusDto }) {
  return (
    <Stack spacing={2}>
      <PanelLabel>Credits today</PanelLabel>
      {status.configured ? (
        <CreditMeter label="Yours" used={status.my_credits_today} limit={status.my_daily_credit_limit} warnAt={0.8} />
      ) : (
        <Alert severity="warning">SERPER_API_KEY is not set</Alert>
      )}
    </Stack>
  );
}

/**
 * The Extraction page's side panel: automatic extraction (the settings for admins, the read-only schedule for everyone
 * else). Admins also see their credits today (nobody else sees credit figures) and the Google Sheet mirror.
 */
export function SidePanel({ role, canExtract, status }: { role: Role; canExtract: boolean; status: ExtractStatusDto | undefined }) {
  return (
    <Box
      component="aside"
      aria-label="Automatic extraction"
      sx={{ bgcolor: "brand.panel", borderRadius: `${radius.panel}px`, p: { xs: 2.5, sm: 3.5 }, display: "flex", flexDirection: "column", gap: 3 }}
    >
      {role === "admin" ? (
        <>
          <AutoExtractCard credits={status ? <Credits status={status} /> : null} />
          <SheetSyncBlock />
        </>
      ) : (
        <AutoExtractInfo canExtract={canExtract} />
      )}
    </Box>
  );
}
