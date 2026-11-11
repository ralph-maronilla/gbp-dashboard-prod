import { alpha, createTheme } from "@mui/material/styles";
import { PALETTE, radius } from "./design-tokens";

const FONT_STACK = 'var(--font-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Single theme definition; light/dark selected by mode. Navy/sky surfaces and brand, orange accent
 * marks, amber for ratings; status colors are reserved for signals. Values live in PALETTE. */
export function buildTheme(mode: "light" | "dark") {
  const c = PALETTE[mode];
  const s = c.surface;
  const tint = c.primary.light; // selected nav item / segment / tab background

  const base = createTheme({
    palette: {
      mode,
      primary: c.primary,
      secondary: c.amber,
      info: c.info,
      success: c.success,
      warning: c.warning,
      error: c.error,
      background: { default: s.bg, paper: s.paper },
      divider: s.border,
      text: c.text,
      action: { hover: alpha(c.primary.main, 0.06), selected: tint },
    },
    shape: { borderRadius: radius.md },
    typography: {
      fontFamily: FONT_STACK,
      h4: { fontWeight: 600, fontSize: "1.75rem", letterSpacing: "-0.015em" },
      h5: { fontWeight: 600, fontSize: "1.375rem", letterSpacing: "-0.01em" },
      h6: { fontWeight: 600, fontSize: "1rem" },
      subtitle2: { fontWeight: 600, fontSize: "0.875rem" },
      body1: { fontSize: "0.9375rem" },
      body2: { fontSize: "0.875rem" },
      caption: { fontSize: "0.78125rem", fontWeight: 400 },
      button: { fontWeight: 500 },
    },
  });

  return createTheme(base, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { scrollbarColor: `${s.border} transparent`, fontVariantNumeric: "tabular-nums" },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
        variants: [
          {
            props: { variant: "outlined" },
            style: { borderColor: s.border, borderRadius: radius.lg },
          },
        ],
      },
      MuiAppBar: {
        styleOverrides: {
          root: { backgroundColor: s.paper, color: base.palette.text.primary },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: s.sidebar, borderRight: `1px solid ${s.border}`, backgroundImage: "none" },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: "none", borderRadius: radius.md, fontWeight: 500 },
          sizeMedium: { padding: "7px 16px" },
          sizeLarge: { padding: "10px 20px", fontSize: "0.95rem" },
          outlined: { borderColor: s.border, color: base.palette.text.primary },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: s.border },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: base.palette.text.disabled },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: c.primary.main, borderWidth: 1.5 },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { "&.Mui-focused": { color: c.primary.main } } },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, borderRadius: radius.sm },
          outlined: { borderColor: s.border },
        },
        variants: (["success", "warning", "error", "info"] as const).flatMap((color) => [
          {
            props: { color, variant: "filled" as const },
            style: {
              backgroundColor: alpha(base.palette[color].main, 0.14),
              color: mode === "light" ? base.palette[color].dark : base.palette[color].main,
            },
          },
          {
            props: { color, variant: "outlined" as const },
            style: {
              backgroundColor: alpha(base.palette[color].main, 0.1),
              borderColor: "transparent",
              color: mode === "light" ? base.palette[color].dark : base.palette[color].main,
            },
          },
        ]),
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40, borderBottom: `1px solid ${s.border}` },
          indicator: { height: 2, backgroundColor: c.accent },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.875rem",
            minHeight: 40,
            minWidth: 0,
            padding: "8px 2px",
            marginRight: 24,
            color: base.palette.text.secondary,
            "&.Mui-selected": { color: c.primary.main },
          },
        },
      },
      // Segmented control: one bordered track, the selected segment gets a neutral fill.
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { gap: 2, padding: 2, border: `1px solid ${s.border}`, borderRadius: radius.md, backgroundColor: s.paper },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            borderRadius: `${radius.sm}px !important`,
            border: 0,
            padding: "4px 10px",
            color: base.palette.text.secondary,
            "&.Mui-selected": {
              backgroundColor: tint,
              color: c.primary.main,
            },
            "&.Mui-selected:hover": {
              backgroundColor: tint,
            },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            paddingTop: 6,
            paddingBottom: 6,
            color: base.palette.text.secondary,
            "&:hover": { color: base.palette.text.primary },
            "&.Mui-selected": {
              backgroundColor: tint,
              color: c.primary.main,
              fontWeight: 600,
            },
            "&.Mui-selected:hover": {
              backgroundColor: tint,
            },
            "&.Mui-selected .MuiListItemIcon-root": { color: c.primary.main },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: { root: { color: "inherit", minWidth: 34, "& svg": { fontSize: 20 } } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: s.border },
          head: {
            fontSize: "0.75rem",
            fontWeight: 600,
            color: base.palette.text.secondary,
            backgroundColor: s.raised,
            whiteSpace: "nowrap",
          },
          stickyHeader: { backgroundColor: s.raised },
        },
      },
      MuiTableRow: {
        styleOverrides: { root: { "&.MuiTableRow-hover:hover": { backgroundColor: s.raised } } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: c.text.primary,
            color: s.paper,
            borderRadius: radius.sm,
          },
          arrow: { color: c.text.primary },
        },
      },
      MuiRating: {
        styleOverrides: { iconFilled: { color: c.amber.main }, iconEmpty: { color: s.border } },
      },
      MuiAvatar: {
        styleOverrides: { colorDefault: { backgroundColor: tint, color: c.primary.main } },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: radius.md } },
      },
      MuiSkeleton: {
        styleOverrides: { rounded: { borderRadius: radius.lg } },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: `1px solid ${s.border}`,
            borderRadius: radius.lg,
            backgroundColor: s.paper,
            "--DataGrid-rowBorderColor": s.border,
            "--DataGrid-containerBackground": s.raised,
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: s.raised,
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 600,
              fontSize: "0.75rem",
              color: base.palette.text.secondary,
            },
            "& .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within": {
              outline: "none",
            },
            "& .MuiDataGrid-row:hover": { backgroundColor: s.raised },
            "& .MuiDataGrid-footerContainer": { borderTop: `1px solid ${s.border}` },
          },
        },
      },
    },
  });
}
