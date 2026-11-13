import Box from "@mui/material/Box";
import { keyframes, type Theme } from "@mui/material/styles";

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

const ring = keyframes({ from: { transform: "scale(1)", opacity: 0.7 }, to: { transform: "scale(2.6)", opacity: 0 } });

/**
 * A status as an 8px dot and its label (no filled chip). `ok` is teal; the other tones keep the signal colors.
 * `pulse` adds a ring that spreads from the dot, for work in progress (not shown when the user asked for less motion).
 */
export function StatusDot({ tone, label, pulse = false }: { tone: StatusTone; label: string; pulse?: boolean }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1, fontWeight: 600, whiteSpace: "nowrap", color: (t) => textColor(t, tone) }}>
      <Box
        component="span"
        aria-hidden
        sx={{
          position: "relative",
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          bgcolor: (t) => dotColor(t, tone),
          ...(pulse && {
            "&::after": {
              content: '""',
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              bgcolor: "inherit",
              animation: `${ring} 1.4s ease-out infinite`,
              "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
            },
          }),
        }}
      />
      {label}
    </Box>
  );
}
