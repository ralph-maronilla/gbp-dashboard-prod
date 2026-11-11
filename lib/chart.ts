import type { Theme } from "@mui/material/styles";

/** Axis and grid lines in the theme's divider and text colors (MUI X Charts `sx`). */
export const axisSx = (t: Theme) => ({
  "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: t.palette.divider },
  "& .MuiChartsAxis-tickLabel": { fill: t.palette.text.secondary },
  "& .MuiChartsGrid-line": { stroke: t.palette.divider },
});

export const CHART_MARGIN = { left: 8, right: 16, top: 16, bottom: 8 };
