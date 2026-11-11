"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, type Theme } from "@mui/material/styles";
import type { Signal, Tone } from "@/lib/insights/signals";

/** Text color for a signal tone; darker shade in light mode so the bright brand colors stay readable. */
export function toneColor(t: Theme, tone: Tone): string {
  if (tone === "neutral") return t.palette.text.secondary;
  return t.palette.mode === "light" ? t.palette[tone].dark : t.palette[tone].main;
}

export function toneBg(t: Theme, tone: Tone): string {
  return tone === "neutral" ? "transparent" : alpha(t.palette[tone].main, t.palette.mode === "light" ? 0.16 : 0.22);
}

/** "Strong" / "Priority" in the signal's color, as in the guide's tables. */
export function SignalText({ signal, size = "body2" }: { signal: Signal; size?: "body2" | "caption" | "subtitle1" }) {
  return (
    <Typography component="span" variant={size} sx={{ fontWeight: 600, color: (t) => toneColor(t, signal.tone), whiteSpace: "nowrap" }}>
      {signal.label}
    </Typography>
  );
}

/** "● Strong" with a colored dot (Reputation tab table). */
export function SignalDot({ signal }: { signal: Signal }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, whiteSpace: "nowrap" }}>
      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: (t) => (signal.tone === "neutral" ? t.palette.text.disabled : t.palette[signal.tone].main) }} />
      <Typography component="span" variant="body2">
        {signal.label}
      </Typography>
    </Box>
  );
}

/** Pill with a tinted background (theme signal tiles, heatmap cells). */
export function SignalPill({ signal, fullWidth = false }: { signal: Signal; fullWidth?: boolean }) {
  return (
    <Box
      sx={{
        display: fullWidth ? "block" : "inline-block",
        textAlign: "center",
        px: 1.25,
        py: 0.5,
        borderRadius: 0.75,
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: (t) => toneColor(t, signal.tone),
        bgcolor: (t) => toneBg(t, signal.tone),
      }}
    >
      {signal.label}
    </Box>
  );
}
