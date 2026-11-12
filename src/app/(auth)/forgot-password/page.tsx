"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import { AuthCard, AuthForm, underlineField } from "@/components/auth-card";
import { useForgotPassword } from "@/lib/client/hooks";
import { forgotPasswordSchema } from "@/lib/schemas/auth";

function ForgotPasswordForm() {
  const forgot = useForgotPassword();
    const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) return setFormError("Enter a valid email address.");
    setFormError(null);
    forgot.mutate(parsed.data);
  }

  if (forgot.isSuccess) {
    return (
      <AuthCard title="Check your email">
        <Alert severity="success">If an account exists for that address, we sent a link to set a new password. It expires after a while, so use it soon.</Alert>
        <MuiLink component={Link} href="/login" variant="body2" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          Back to sign in
        </MuiLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="We will email you a link to choose a new one.">
      <AuthForm
        error={formError ?? forgot.error?.message ?? null}
        onSubmit={onSubmit}
        submit={["Send reset link", "Sending…"]}
        pending={forgot.isPending}
        link={{ href: "/login", text: "Back to sign in" }}
      >
        <TextField {...underlineField} label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
      </AuthForm>
    </AuthCard>
  );
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
