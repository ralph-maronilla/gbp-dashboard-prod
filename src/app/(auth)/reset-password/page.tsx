"use client";

import { useState, type FormEvent } from "react";
import { AuthCard, AuthForm } from "@/components/auth-card";
import { PasswordField } from "@/components/ui/password-field";
import { useResetPassword } from "@/lib/client/hooks";
import { resetPasswordSchema } from "@/lib/schemas/auth";

/** Reached from the recovery email (the link has already signed the user in). */
export default function ResetPasswordPage() {
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "Check the password and try again.");
    if (password !== confirm) return setFormError("The two passwords do not match.");
    setFormError(null);
    reset.mutate(parsed.data, { onSuccess: () => window.location.assign("/") });
  }

  return (
    <AuthCard title="Choose a new password" subtitle="You will be signed in once it is saved.">
      <AuthForm
        error={formError ?? reset.error?.message ?? null}
        onSubmit={onSubmit}
        submit={["Save password", "Saving…"]}
        pending={reset.isPending || reset.isSuccess}
        link={{ href: "/login", text: "Back to sign in" }}
      >
        <PasswordField label="New password" autoComplete="new-password" autoFocus helperText={password.length >= 8 ? "Looks good" : "At least 8 characters"} valid={password.length >= 8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </AuthForm>
    </AuthCard>
  );
}
