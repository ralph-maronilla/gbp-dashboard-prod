"use client";

import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { timeLabel } from "@/components/extraction/auto-extract-card";
import { useAutoExtractSchedule } from "@/lib/client/hooks";

/**
 * Non-admins: when automatic extraction runs (read-only; only admins change it). Users without manual extraction
 * access are also told how to get it.
 */
export function AutoExtractInfo({ canExtract }: { canExtract: boolean }) {
  const q = useAutoExtractSchedule(true);
  const s = q.data;
  return (
    <div data-tour="auto-extract-info">
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600, color: "brand.head", mb: 1.5 }}>
        Automatic extraction
      </Typography>
      {q.isError ? (
        <Typography variant="body2" color="text.secondary">
          The schedule could not be loaded.
        </Typography>
      ) : !s ? (
        <Skeleton width={260} />
      ) : s.enabled && s.time ? (
        <Typography variant="body2">
          Reviews of all active locations are extracted automatically every day at <strong>{timeLabel(s.time)}</strong> (Manila time).
        </Typography>
      ) : (
        <Typography variant="body2">Automatic extraction is off. New reviews come in when someone runs an extraction.</Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {canExtract
          ? "Only an admin can change the schedule. You can also extract reviews yourself below."
          : "Only an admin can change the schedule or run extractions. Ask an admin if you need to extract reviews yourself."}
      </Typography>
    </div>
  );
}
