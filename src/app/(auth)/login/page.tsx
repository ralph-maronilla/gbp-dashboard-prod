"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import { AuthCard, AuthForm, underlineField } from "@/components/auth-card";
import { PasswordField } from "@/components/ui/password-field";
import { useLogin } from "@/lib/client/hooks";
import { loginSchema } from "@/lib/schemas/auth";

function LoginForm() {
  const params = useSearchParams();
  const idle = params.get("reason") === "idle";
  const notice = params.has("verified")
    ? { severity: "success" as const, text: "Your email is confirmed. Sign in below. An administrator must approve your account before you can see anything." }
    : params.has("verify_error")
      ? { severity: "warning" as const, text: "That confirmation link has expired or was already used. If you cannot sign in, sign up again to get a new one." }
      : params.has("reset")
        ? { severity: "success" as const, text: "Your password was changed. Sign in with the new one." }
        : null;
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setFormError("Enter a valid email and password.");
    login.mutate(parsed.data, {
      // The proxy routes approved users to / and everyone else to /pending-approval.
      onSuccess: () => window.location.assign("/"),
    });
  }

  const error = formError ?? (login.error ? login.error.message : null);
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to see your reviews.">
      {notice && !error && (
        <Alert severity={notice.severity} sx={{ mb: 2.5 }}>
          {notice.text}
        </Alert>
      )}
      {idle && !error && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          You were signed out after 1 hour of inactivity.
        </Alert>
      )}
      <AuthForm
        error={error}
        onSubmit={onSubmit}
        submit={["Sign in", "Signing in…"]}
        // Stays on until the next page replaces this one, so the form does not flash back after a successful sign-in.
        pending={login.isPending || login.isSuccess}
        link={{ prompt: "New here?", href: "/signup", text: "Create an account" }}
        extra={{ href: "/forgot-password", text: "Forgot your password?" }}
      >
        <TextField {...underlineField} label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordField {...underlineField} label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </AuthForm>
    </AuthCard>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
