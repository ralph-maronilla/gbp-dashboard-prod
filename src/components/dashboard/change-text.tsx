"use client";

import { createContext, useContext } from "react";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { Change } from "@/lib/insights/compare";
import { toneColor } from "./signal";

const TONE = { better: "success", worse: "error", same: "neutral", none: "neutral" } as const;

/** "▲ +0.80★" in green when better, red when worse; the arrow follows the number, the colour follows the meaning. */
export function ChangeText({ change, size = "body2" }: { change: Change; size?: "body2" | "caption" }) {
  const arrow = change.delta === null || change.delta === 0 ? "" : change.delta > 0 ? "▲ " : "▼ ";
  return (
    <Typography component="span" variant={size} sx={{ fontWeight: 600, whiteSpace: "nowrap", color: (t) => toneColor(t, TONE[change.direction]) }}>
      {arrow}
      {change.text}
    </Typography>
  );
}

/**
 * The Compare-to dates shown on the Dashboard tabs ("Sep 1 – 30, 2026"); null when Compare to is off. Set once by the
 * Dashboard page so every change line can say what it compares with.
 */
export const CompareLabel = createContext<{ label: string; sameLength: boolean } | null>(null);
export const useCompareLabel = () => useContext(CompareLabel)?.label ?? null;

/**
 * "▲ +0.12★ vs 4.31★" under a figure while Compare to is on (nothing otherwise). `was` is the compared value as shown;
 * the tooltip names the compared dates. A change of "-" (too few reviews, no value) says so instead of an arrow.
 */
export function VsChange({ change, was, block = true, volume = false }: { change: Change; was: string; block?: boolean; volume?: boolean }) {
  const ctx = useContext(CompareLabel);
  if (!ctx) return null;
  const { label, sameLength } = ctx;
  // A count over ranges of different lengths differs by length alone: show it without good / bad colour.
  const shown = volume && !sameLength && change.direction !== "none" ? { ...change, direction: "same" as const } : change;
  const tip =
    change.direction === "none"
      ? `Not compared: too few reviews in one of the ranges (${was} in ${label})`
      : `${was} in ${label}${shown !== change ? ". The two ranges have different lengths, so this count is not marked better or worse." : ""}`;
  return (
    <Tooltip title={tip}>
      <Box component="span" sx={{ display: block ? "flex" : "inline-flex", alignItems: "baseline", gap: 0.5, flexWrap: "wrap", lineHeight: 1.4 }}>
        <ChangeText change={shown} size="caption" />
        <Typography component="span" variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          vs {was}
        </Typography>
      </Box>
    </Tooltip>
  );
}
