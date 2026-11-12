import Box from "@mui/material/Box";
import type { Theme } from "@mui/material/styles";

export type StatusTone = "ok" | "info" | "warning" | "error" | "neutral";

const dotColor = (t: Theme, tone: StatusTone) =>
  tone === "ok" ? t.palette.brand.teal : tone === "neutral" ? t.palette.text.disabled : t.palette[tone].main;

const textColor = (t: Theme, tone: StatusTone) =>
  tone === "ok"
    ? t.palette.brand.tealText
    : tone === "neutral"
      ? t.palette.text.secondary
      : t.palette.mode === "light"
        ? t.palette[tone].dark
        : t.palette[tone].main;

/** A status as an 8px dot and its label (no filled chip). `ok` is teal; the other tones keep the signal colors. */
export function StatusDot({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1, fontWeight: 600, whiteSpace: "nowrap", color: (t) => textColor(t, tone) }}>
      <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: (t) => dotColor(t, tone) }} />
      {label}
    </Box>
  );
}
