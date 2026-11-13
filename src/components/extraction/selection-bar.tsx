"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { radius } from "@/lib/design-tokens";

/**
 * The actions for the ticked locations, pinned to the bottom of the screen so they stay in reach while the list is
 * scrolled. Shown to people who may extract; they may also refresh Google totals.
 */
export function SelectionBar({ count, onExtract, onRefresh, onClear }: { count: number; onExtract: () => void; onRefresh: () => void; onClear: () => void }) {
  return (
    <Box
      role="region"
      aria-label="Selected locations"
      sx={{
        position: "fixed",
        left: "50%",
        bottom: { xs: 12, sm: 24 },
        transform: "translateX(-50%)",
        zIndex: "speedDial",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 1,
        width: "max-content",
        maxWidth: "calc(100vw - 24px)",
        pl: 2.5,
        pr: 1,
        py: 1,
        bgcolor: "background.default",
        border: 1,
        borderColor: "text.primary",
        borderRadius: `${radius.control + 8}px`,
      }}
    >
      <Typography variant="body2" aria-live="polite" sx={{ fontWeight: 600, mr: 1 }}>
        {count} selected
      </Typography>
      <Button variant="contained" onClick={onExtract}>
        Extract {count === 1 ? "this location" : `these ${count}`}
      </Button>
      <Button variant="outlined" onClick={onRefresh}>
        Refresh Google totals
      </Button>
      <Button onClick={onClear}>Clear</Button>
    </Box>
  );
}
