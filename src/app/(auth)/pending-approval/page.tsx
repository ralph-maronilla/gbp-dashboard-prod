"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { AuthCard } from "@/components/auth-card";
import { useLogout, useMe } from "@/lib/client/hooks";

export default function PendingApprovalPage() {
  const me = useMe();
  const logout = useLogout();
  const rejected = me.data?.status === "rejected";
  return (
    <AuthCard title={rejected ? "Access declined" : "Waiting for approval"}>
      <Stack spacing={2}>
        <Alert severity={rejected ? "error" : "info"}>
          {rejected
            ? "An administrator declined this account. Contact an administrator if you think this is a mistake."
            : "Your account was created and is waiting for an administrator to approve it. Check back later."}
        </Alert>
        <Button variant="outlined" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sign out
        </Button>
      </Stack>
    </AuthCard>
  );
}
