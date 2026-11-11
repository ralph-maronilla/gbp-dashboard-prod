"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import type { ReactNode } from "react";

/** Small ⓘ that explains a figure in plain words. Opens on hover, keyboard focus and tap (phones). */
export function InfoTip({ text, color = "text.secondary" }: { text: string; color?: string }) {
  return (
    <Tooltip
      arrow
      enterTouchDelay={0}
      leaveTouchDelay={6000}
      title={<Typography variant="body2">{text}</Typography>}
      slotProps={{ tooltip: { sx: { maxWidth: 320, p: 1.25 } } }}
    >
      <IconButton size="small" aria-label="What does this mean?" sx={{ p: 0.25, color, verticalAlign: "middle" }}>
        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

/** A label followed by its ⓘ, kept on one line (table headers, figure labels). */
export function LabelWithTip({ label, text, color }: { label: ReactNode; text: string; color?: string }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
      {label}
      <InfoTip text={text} color={color} />
    </Box>
  );
}
