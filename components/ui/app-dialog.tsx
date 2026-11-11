"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import type { ReactNode } from "react";
import { LoadingOverlay } from "./loading-overlay";

/**
 * Dialog with a title, a stacked body, an optional error and Close/Confirm buttons. `confirm` is the primary action
 * ("Save", "Delete"…); `closeLabel` defaults to "Cancel" and is "Close" for dialogs whose action is optional.
 */
export function AppDialog({
  title,
  onClose,
  maxWidth = "sm",
  error,
  closeLabel = "Cancel",
  confirm,
  busy = false,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  maxWidth?: "xs" | "sm" | "md";
  error?: string | null;
  closeLabel?: string;
  confirm?: { label: ReactNode; onClick: () => void; disabled?: boolean; color?: "primary" | "error" };
  /** While true the dialog shows a spinner and cannot be dismissed (work in progress). */
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth={maxWidth}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <LoadingOverlay active={busy}>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {children}
          </Stack>
        </LoadingOverlay>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {closeLabel}
        </Button>
        {confirm && (
          <Button variant="contained" color={confirm.color} disabled={confirm.disabled} onClick={confirm.onClick}>
            {confirm.label}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
