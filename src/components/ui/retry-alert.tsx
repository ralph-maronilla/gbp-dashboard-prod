"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";

/** "Could not load …" with a Retry button, for a failed query. */
export function RetryAlert({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Alert severity="error" action={<Button onClick={onRetry}>Retry</Button>}>
      Could not load {what}.
    </Alert>
  );
}
