"use client";

import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ScheduleIcon from "@mui/icons-material/Schedule";
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
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }} data-tour="auto-extract-info">
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <ScheduleIcon color="primary" fontSize="small" sx={{ mt: 0.25 }} />
        <div>
          <Typography variant="h6" component="h2" sx={{ fontSize: "0.9375rem" }}>
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
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {canExtract
              ? "Only an admin can change the schedule. You can also extract reviews yourself below."
              : "Only an admin can change the schedule or run extractions. Ask an admin if you need to extract reviews yourself."}
          </Typography>
        </div>
      </Stack>
    </Paper>
  );
}
