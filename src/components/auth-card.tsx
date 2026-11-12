import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import type { TextFieldProps } from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { BrandMark } from "@/components/brand-mark";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

const HIGHLIGHTS = [
  "Ratings, review volume and reply rate for every location",
  "What patients praise and complain about, by theme",
  "Compare any two months, location by location",
];

/**
 * Props for the auth forms' underline fields: label above the input, no box, a 2px rule under it that turns blue on
 * focus. Spread onto a TextField (or PasswordField).
 */
export const underlineField: Pick<TextFieldProps, "variant" | "fullWidth" | "sx"> = {
  variant: "standard",
  fullWidth: true,
  sx: {
    // The label sits above the input at its full size instead of floating into it.
    "& .MuiInputLabel-root": { position: "static", transform: "none", fontSize: 13, fontWeight: 600, color: "text.primary", mb: 0.5 },
    "& .MuiInputLabel-root.Mui-focused": { color: "brand.primaryText" },
    "& .MuiInputLabel-root.Mui-error": { color: "error.main" },
    "& .MuiInput-root": { mt: 0, minHeight: 44, backgroundColor: "transparent" },
    "& .MuiInput-root::before": { borderBottom: 2, borderColor: "divider" },
    "& .MuiInput-root:hover:not(.Mui-disabled, .Mui-error)::before": { borderBottom: 2, borderColor: "text.secondary" },
    "& .MuiInput-root::after": { borderBottom: 2, borderColor: "primary.main" },
  },
};

/** Decorative "pathway" lines for the brand half. Colors come from the theme. */
function Pathways() {
  return (
    <Box component="svg" aria-hidden="true" viewBox="0 0 520 260" fill="none" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" sx={{ display: "block", width: "100%", maxWidth: 520, height: "auto" }}>
      <Box component="path" d="M20 240 V150 a60 60 0 0 1 60 -60 H220 a60 60 0 0 0 60 -60 V20" sx={{ stroke: (t) => t.palette.primary.main }} />
      <Box component="path" d="M130 240 V200 a50 50 0 0 1 50 -50 H330 a60 60 0 0 0 60 -60 V60" sx={{ stroke: (t) => t.palette.brand.teal }} />
      <Box component="path" d="M250 240 H420 a60 60 0 0 0 60 -60 V150" sx={{ stroke: (t) => t.palette.primary.main }} />
      <Box component="circle" cx={390} cy={24} r={14} sx={{ fill: (t) => t.palette.accent.main, stroke: "none" }} />
      <Box component="circle" cx={480} cy={110} r={14} sx={{ fill: (t) => t.palette.accent.main, stroke: "none" }} />
    </Box>
  );
}

function BrandPanel() {
  return (
    <Box sx={{ bgcolor: "brand.panel", p: { xs: 4, md: 7 }, display: "flex", flexDirection: "column", justifyContent: "center", gap: 5 }}>
      <Pathways />
      <div>
        <Typography component="p" sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 700, lineHeight: 1.25, color: "brand.head", maxWidth: 520 }}>
          Google Business Profile reviews for every location, in one place.
        </Typography>
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 4, maxWidth: 520 }}>
          {HIGHLIGHTS.map((text) => (
            <Box component="li" key={text} sx={{ py: 1.75, borderTop: 1, borderColor: "brand.track", "&:last-of-type": { borderBottom: 1, borderColor: "brand.track" } }}>
              {text}
            </Box>
          ))}
        </Box>
      </div>
    </Box>
  );
}

/** Auth page shell: the form half and the brand half side by side from tablet width up, stacked on phones. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
      <Box component="main" sx={{ display: "flex", flexDirection: "column", p: { xs: 3, sm: 5 }, minHeight: { xs: "auto", md: "100dvh" } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", color: "brand.head", fontWeight: 600, fontSize: "1.0625rem" }}>
          <BrandMark />
          <span>Review Dashboard</span>
        </Stack>
        <Box sx={{ flexGrow: 1, display: "grid", alignItems: "center", py: 5 }}>
          <Box sx={{ width: "100%", maxWidth: 440, mx: "auto" }}>
            <Typography component="h1" sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, color: "brand.head" }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {subtitle}
              </Typography>
            )}
            <Box sx={{ mt: 4 }}>{children}</Box>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Access is by administrator approval.
        </Typography>
      </Box>
      <BrandPanel />
    </Box>
  );
}

/**
 * Stacked form: fields, an error line, the submit button (spinner while `pending`, with the `extra` link beside it) and a link to
 * the other auth page. The whole form dims under a centred spinner while `pending`.
 */
export function AuthForm({
  error,
  onSubmit,
  submit,
  pending,
  link,
  extra,
  children,
}: {
  error: string | null;
  onSubmit: (e: FormEvent) => void;
  /** Button text, and its text while `pending`. */
  submit: [label: string, pendingLabel: string];
  pending: boolean;
  /** "New here? Create an account": `prompt` is plain text, `text` the link. */
  link: { href: string; text: string; prompt?: string };
  /** Small link on the submit row, right-aligned, e.g. "Forgot your password?". */
  extra?: { href: string; text: string };
  children: ReactNode;
}) {
  return (
    <LoadingOverlay active={pending} centered>
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={3}>
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          {children}
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2, pt: 1 }}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth={!extra}
              disabled={pending}
              startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ minHeight: 52, minWidth: 160 }}
            >
              {pending ? submit[1] : submit[0]}
            </Button>
            {extra && (
              <MuiLink component={Link} href={extra.href} variant="body2" underline="hover">
                {extra.text}
              </MuiLink>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {link.prompt && `${link.prompt} `}
            <MuiLink component={Link} href={link.href} underline="hover" sx={{ fontWeight: 600 }}>
              {link.text}
            </MuiLink>
          </Typography>
        </Stack>
      </form>
    </LoadingOverlay>
  );
}
