"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import { AuthCard, AuthForm, underlineField } from "@/components/auth-card";
import { PasswordField } from "@/components/ui/password-field";
import { useResetPassword } from "@/lib/client/hooks";
import { resetPasswordSchema } from "@/lib/schemas/auth";

/** Reached from the reset email: /reset-password?token=… (the token proves the person owns the address). */
function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "Check the password and try again.");
    if (password !== confirm) return setFormError("The two passwords do not match.");
    setFormError(null);
    reset.mutate(parsed.data, { onSuccess: () => window.location.assign("/login?reset=1") });
  }

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <Alert severity="warning">This link is incomplete. Request a new one and use the link from the email.</Alert>
        <MuiLink component={Link} href="/forgot-password" variant="body2" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          Request a new link
        </MuiLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="You will sign in again with it once it is saved.">
      <AuthForm
        error={formError ?? reset.error?.message ?? null}
        onSubmit={onSubmit}
        submit={["Save password", "Saving…"]}
        pending={reset.isPending || reset.isSuccess}
        link={{ href: "/login", text: "Back to sign in" }}
      >
        <PasswordField {...underlineField} label="New password" autoComplete="new-password" autoFocus helperText={password.length >= 8 ? "Looks good" : "At least 8 characters"} valid={password.length >= 8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <PasswordField {...underlineField} label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </AuthForm>
    </AuthCard>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
