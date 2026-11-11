import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import SentimentSatisfiedAltRoundedIcon from "@mui/icons-material/SentimentSatisfiedAltRounded";
import { BrandMark } from "@/components/brand-mark";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { BRAND } from "@/lib/design-tokens";

const HIGHLIGHTS = [
  { icon: <BarChartRoundedIcon />, text: "Ratings, review volume and reply rate for every location" },
  { icon: <SentimentSatisfiedAltRoundedIcon />, text: "What patients praise and complain about, by theme" },
  { icon: <CompareArrowsRoundedIcon />, text: "Compare any two months, location by location" },
];

/** `slotProps` for a TextField that shows `icon` at its start (the auth forms' email and name boxes). */
export const fieldIcon = (icon: ReactNode) => ({
  input: { startAdornment: <InputAdornment position="start">{icon}</InputAdornment> },
});

function BrandPanel() {
  return (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        flexDirection: "column",
        justifyContent: "space-between",
        p: 6,
        color: "#fff",
        background: `radial-gradient(circle at 15% 10%, ${BRAND.teal}59, transparent 55%), radial-gradient(circle at 90% 95%, ${BRAND.orange}26, transparent 45%), ${BRAND.navy}`,
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <BrandMark size={40} />
        <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
          Review Dashboard
        </Typography>
      </Stack>
      <Box>
        <Typography variant="h4" component="p" sx={{ fontWeight: 600, maxWidth: 460, lineHeight: 1.25 }}>
          Google Business Profile reviews for every location, in one place.
        </Typography>
        <Stack spacing={2} sx={{ mt: 4 }}>
          {HIGHLIGHTS.map((h) => (
            <Stack key={h.text} direction="row" spacing={1.5} sx={{ alignItems: "center", color: BRAND.sky }}>
              {h.icon}
              <Typography>{h.text}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Typography variant="caption" sx={{ color: BRAND.sky }}>
        Access is by administrator approval.
      </Typography>
    </Box>
  );
}

/** Sign-in page shell: brand panel on the left from tablet width up, the form on the right (alone, under a logo, on phones). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "5fr 6fr" } }}>
      <BrandPanel />
      <Box sx={{ display: "grid", placeItems: "center", p: { xs: 3, sm: 4 }, bgcolor: "background.paper" }}>
        <Box sx={{ width: "100%", maxWidth: 400 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 4, display: { md: "none" } }}>
            <BrandMark size={32} />
            <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
              Review Dashboard
            </Typography>
          </Stack>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
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
    </Box>
  );
}

/**
 * Stacked form: fields, an error line, a full-width submit button (spinner while `pending`) and, under a divider, a link to
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
  /** Small link right under the fields, e.g. "Forgot your password?". */
  extra?: { href: string; text: string };
  children: ReactNode;
}) {
  return (
    <LoadingOverlay active={pending} centered>
      <form onSubmit={onSubmit} noValidate>
        <Stack spacing={2.5}>
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          {children}
          {extra && (
            <MuiLink component={Link} href={extra.href} variant="body2" underline="hover" sx={{ alignSelf: "flex-end", mt: "-4px !important" }}>
              {extra.text}
            </MuiLink>
          )}
          <Button type="submit" variant="contained" size="large" fullWidth disabled={pending} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {pending ? submit[1] : submit[0]}
          </Button>
          <Divider />
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
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
