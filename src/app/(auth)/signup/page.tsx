"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import { AuthCard, AuthForm, fieldIcon } from "@/components/auth-card";
import { PasswordField } from "@/components/ui/password-field";
import { useSignup } from "@/lib/client/hooks";
import { signupSchema } from "@/lib/schemas/auth";

export default function SignupPage() {
  const signup = useSignup();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = signupSchema.safeParse({ email, password, full_name: fullName || undefined });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    signup.mutate(parsed.data, {
      onSuccess: (res) => {
        if (!res.requires_email_confirmation) window.location.assign("/");
      },
    });
  }

  if (signup.isSuccess && signup.data.requires_email_confirmation) {
    return (
      <AuthCard title="Check your email">
        <Alert severity="success">
          We sent a confirmation link. After confirming, sign in. An administrator must then approve your account
          before you can see any data.
        </Alert>
        <MuiLink component={Link} href="/login" variant="body2" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          Back to sign in
        </MuiLink>
      </AuthCard>
    );
  }

  const error = formError ?? (signup.error ? signup.error.message : null);
  return (
    <AuthCard title="Create your account" subtitle="An administrator approves new accounts before any data is visible.">
      <AuthForm
        error={error}
        onSubmit={onSubmit}
        submit={["Create account", "Creating…"]}
        // Stays on until the next page replaces this one, unless the "check your email" card takes over.
        pending={signup.isPending || (signup.isSuccess && !signup.data.requires_email_confirmation)}
        link={{ prompt: "Already have an account?", href: "/login", text: "Sign in" }}
      >
        <TextField label="Full name" autoComplete="name" autoFocus slotProps={fieldIcon(<PersonOutlinedIcon fontSize="small" />)} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <TextField label="Email" type="email" autoComplete="email" slotProps={fieldIcon(<EmailOutlinedIcon fontSize="small" />)} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordField label="Password" autoComplete="new-password" helperText={password.length >= 8 ? "Looks good" : "At least 8 characters"} valid={password.length >= 8} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </AuthForm>
    </AuthCard>
  );
}
