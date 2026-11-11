"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha } from "@mui/material/styles";
import type { ReactNode } from "react";

/**
 * Dims `children` and shows a spinner over them while `active` (new data is loading and the old data is still on
 * screen). The spinner stays in view while a tall page is scrolled, and the content underneath cannot be clicked.
 * `centered` puts it in the middle of a small box (a form or dialog) instead of following the scroll position.
 */
export function LoadingOverlay({ active, centered = false, children }: { active: boolean; centered?: boolean; children: ReactNode }) {
  return (
    <Box sx={{ position: "relative" }}>
      {children}
      {active && (
        <Box
          role="status"
          aria-live="polite"
          aria-label="Loading"
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            justifyContent: "center",
            alignItems: centered ? "center" : "flex-start",
            borderRadius: 1,
            bgcolor: (t) => alpha(t.palette.background.default, 0.65),
          }}
        >
          <Box sx={{ position: centered ? "static" : "sticky", top: "40vh", p: 1.5, borderRadius: "50%", bgcolor: "background.paper", boxShadow: 3, display: "flex" }}>
            <CircularProgress size={36} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** DataGrid `slotProps` so every table shows the same spinner (the default is a thin bar, or skeleton rows when empty). */
export const GRID_LOADING_PROPS = { loadingOverlay: { variant: "circular-progress", noRowsVariant: "circular-progress" } } as const;
