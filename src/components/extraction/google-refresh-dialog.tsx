"use client";

import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import { AppDialog } from "@/components/ui/app-dialog";
import { useGoogleRefresh } from "@/lib/client/hooks";
import { CREDITS_PER_LOOKUP } from "@/lib/schemas/google-refresh";

/** Confirms the credit cost, then refreshes Google's public rating and review count for the given locations. */
export function GoogleRefreshDialog({ ids, label, onClose }: { ids: string[] | undefined; label: string; onClose: () => void }) {
  const refresh = useGoogleRefresh();
  const count = ids?.length;
  const r = refresh.data;
  const updated = r?.results.filter((x) => x.status === "updated") ?? [];
  const problems = r?.results.filter((x) => x.status !== "updated") ?? [];
  const filled = updated.filter((x) => x.filled.length > 0);

  return (
    <AppDialog
      title="Refresh Google totals"
      onClose={onClose}
      busy={refresh.isPending}
      closeLabel={r ? "Close" : "Cancel"}
      error={!r && refresh.isError ? refresh.error.message : null}
      confirm={r ? undefined : { label: refresh.isPending ? "Refreshing…" : "Refresh", disabled: refresh.isPending, onClick: () => refresh.mutate(ids) }}
    >
      {!r ? (
        <>
          <Typography>
            Looks up Google&apos;s public star rating and total review count for {label}. Costs about {CREDITS_PER_LOOKUP} credits per location
            {count ? ` (≈ ${count * CREDITS_PER_LOOKUP} credits)` : ""} and counts toward the daily credit limit.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Empty address, region and type are filled from Google at the same time. Values you already set are kept.
          </Typography>
        </>
      ) : (
        <>
          <Alert severity={problems.length ? "warning" : "success"}>
            Updated {updated.length} location{updated.length === 1 ? "" : "s"} · {r.credits_used} credits used
            {r.not_done > 0 ? ` · ${r.not_done} not done (${r.limit ?? "time budget reached"}; run again later)` : ""}
          </Alert>
          {filled.length > 0 && <Typography variant="body2">Filled from Google: {filled.map((x) => `${x.name} (${x.filled.join(", ")})`).join("; ")}.</Typography>}
          {problems.map((x) => (
            <Typography key={x.id} variant="body2" color="text.secondary">
              {x.name}: {x.status === "not_found" ? "not found on Google" : (x.error ?? x.status)}
            </Typography>
          ))}
        </>
      )}
    </AppDialog>
  );
}
