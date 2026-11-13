import { alpha, keyframes, type SxProps, type Theme } from "@mui/material/styles";

/** Class for the column that names the row (location name, branch): weight 600. */
export const STRONG_CELL = "cell-strong";

/** Class for a row whose extraction just finished: a short teal tint that fades out. */
export const DONE_ROW = "row-just-done";

const fade = (color: string) => keyframes({ from: { backgroundColor: color }, to: { backgroundColor: "transparent" } });

/** Row and header heights for the Extraction tables: 13px text with 15px above and below. */
export const PLAIN_GRID_PROPS = { rowHeight: 50, columnHeaderHeight: 44 } as const;

/**
 * The Extraction tables: no outer border or card. Header row in small muted text over a 1px rule in the text color,
 * body rows separated by hairlines.
 */
export const plainGridSx = (t: Theme) => ({
  border: 0,
  borderRadius: 0,
  backgroundColor: "transparent",
  fontSize: 13,
  "--DataGrid-t-header-background-base": t.palette.background.default,
  "& .MuiDataGrid-columnHeaders": { borderBottom: 1, borderColor: "text.primary" },
  "& .MuiDataGrid-columnHeader": { borderBottom: "0 !important" },
  "& .MuiDataGrid-columnHeaderTitle": { fontSize: 12, fontWeight: 600, color: "text.secondary" },
  "& .MuiDataGrid-columnSeparator": { display: "none" },
  "& .MuiDataGrid-cell": { fontSize: 13, borderColor: "divider" },
  [`& .${STRONG_CELL}`]: { fontWeight: 600 },
  "& .MuiDataGrid-footerContainer": { borderTop: 0 },
  [`& .${DONE_ROW}`]: {
    animation: `${fade(alpha(t.palette.brand.teal, 0.3))} 2.4s ease-out 1`,
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
});

/** Wrapper that keeps a wide table scrolling sideways inside itself instead of widening the page. */
export const gridScrollSx: SxProps<Theme> = { overflowX: "auto" };
