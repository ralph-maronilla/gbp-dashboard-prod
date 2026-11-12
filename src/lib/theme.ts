import { alpha, createTheme } from "@mui/material/styles";
import { CONTROL_HEIGHT, PALETTE, radius } from "./design-tokens";

const FONT_STACK = "var(--font-sans), system-ui, sans-serif";

/** The Pathways colors that have no MUI palette slot. Read as `theme.palette.brand.head` or `"brand.head"` in `sx`. */
interface BrandColors {
  /** Headings and the brand name. */
  head: string;
  /** Teal-tint side panel background. */
  panel: string;
  /** Meter track and dividers inside the panel. */
  track: string;
  /** Borders and row dividers (same as `palette.divider`). */
  line: string;
  /** Links and outlined / text buttons: the blue that is readable as text in this mode. */
  primaryText: string;
  /** Status dots and the active nav underline. */
  teal: string;
  /** Status text. */
  tealText: string;
  star: string;
  starOff: string;
  inputBg: string;
}

declare module "@mui/material/styles" {
  interface Palette {
    brand: BrandColors;
    /** Orange fill: one action per screen, the stars and the credit meter. Its text is always `contrastText` (dark). */
    accent: Palette["primary"];
  }
  interface PaletteOptions {
    brand?: BrandColors;
    accent?: PaletteOptions["primary"];
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    accent: true;
  }
}

/** Single theme definition; light/dark selected by mode. Values live in PALETTE (design-tokens.ts). */
export function buildTheme(mode: "light" | "dark") {
  const c = PALETTE[mode];
  const tint = alpha(c.primary, mode === "light" ? 0.08 : 0.24); // selected segment / list item background
  const subtle = alpha(c.line, mode === "light" ? 0.45 : 0.4); // table header and row hover
  const focusRing = { outline: `2px solid ${c.primaryText}`, outlineOffset: 2 };

  const base = createTheme({
    palette: {
      mode,
      primary: { main: c.primary, dark: c.primaryDark, light: tint, contrastText: c.onPrimary },
      // Secondary is teal as text (tags in the User guide).
      secondary: { main: c.tealText, contrastText: c.bg },
      accent: { main: c.accent, dark: c.accentDark, light: c.accent, contrastText: c.onAccent },
      info: c.info,
      success: c.success,
      warning: c.warning,
      error: c.error,
      background: { default: c.bg, paper: c.bg },
      divider: c.line,
      text: { primary: c.text, secondary: c.muted, disabled: alpha(c.text, 0.45) },
      action: { hover: alpha(c.primary, mode === "light" ? 0.05 : 0.14), selected: tint },
      brand: {
        head: c.head,
        panel: c.panel,
        track: c.track,
        line: c.line,
        primaryText: c.primaryText,
        teal: c.teal,
        tealText: c.tealText,
        star: c.star,
        starOff: c.starOff,
        inputBg: c.inputBg,
      },
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: FONT_STACK,
      h4: { fontWeight: 700, fontSize: "1.75rem", letterSpacing: "-0.015em", color: c.head },
      h5: { fontWeight: 600, fontSize: "1.375rem", letterSpacing: "-0.01em", color: c.head },
      h6: { fontWeight: 600, fontSize: "1rem", color: c.head },
      subtitle2: { fontWeight: 600, fontSize: "0.875rem" },
      body1: { fontSize: "0.9375rem" },
      body2: { fontSize: "0.875rem" },
      caption: { fontSize: "0.78125rem", fontWeight: 400 },
      button: { fontWeight: 600 },
    },
  });

  return createTheme(base, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { scrollbarColor: `${c.line} transparent`, fontVariantNumeric: "tabular-nums" },
        },
      },
      MuiButtonBase: {
        styleOverrides: { root: { "&.Mui-focusVisible": focusRing } },
      },
      // No gradients and no card shadows: surfaces are flat, separated by hairlines.
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
        variants: [
          {
            props: { variant: "outlined" },
            style: { borderColor: c.line, borderRadius: radius.control },
          },
        ],
      },
      MuiAppBar: {
        styleOverrides: {
          root: { backgroundColor: c.bg, color: c.text },
        },
      },
      // Floating surfaces share the page color, so a hairline marks their edge in both modes.
      MuiPopover: {
        styleOverrides: { paper: { border: `1px solid ${c.line}`, borderRadius: radius.control } },
      },
      MuiDialog: {
        styleOverrides: { paper: { border: `1px solid ${c.line}`, borderRadius: radius.panel } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: "none", borderRadius: radius.control, fontWeight: 600, minHeight: CONTROL_HEIGHT },
          sizeSmall: { padding: "6px 14px" },
          sizeMedium: { padding: "8px 18px" },
          sizeLarge: { padding: "12px 22px", fontSize: "0.95rem" },
        },
        variants: [
          // The fill blue is too dark to read as text on the dark page, so text and outlined buttons use primaryText.
          { props: { variant: "text", color: "primary" }, style: { color: c.primaryText } },
          {
            props: { variant: "outlined", color: "primary" },
            style: { color: c.primaryText, borderColor: c.line, "&:hover": { borderColor: c.primaryText } },
          },
          { props: { variant: "outlined", color: "inherit" }, style: { borderColor: c.line } },
        ],
      },
      MuiLink: {
        styleOverrides: {
          root: { color: c.primaryText, textDecorationColor: alpha(c.primaryText, 0.4), borderRadius: 2, "&:focus-visible": focusRing },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius.control,
            minHeight: CONTROL_HEIGHT,
            backgroundColor: c.inputBg,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: c.line },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: c.muted },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: c.primaryText, borderWidth: 2 },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { "&.Mui-focused": { color: c.primaryText } },
          // The default small label is centered on a 40px box; inputs are 44px.
          outlined: { "&.MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)": { transform: "translate(14px, 11px) scale(1)" } },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, borderRadius: radius.sm },
          outlined: { borderColor: c.line },
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
      // Tabs follow the top bar: muted labels, the selected one in head color over a teal underline.
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: CONTROL_HEIGHT, borderBottom: `1px solid ${c.line}` },
          indicator: { height: 3, backgroundColor: c.teal },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.875rem",
            minHeight: CONTROL_HEIGHT,
            minWidth: 0,
            padding: "8px 2px",
            marginRight: 24,
            color: c.muted,
            "&.Mui-selected": { color: c.head, fontWeight: 600 },
          },
        },
      },
      // Segmented control: one bordered track, the selected segment gets a tinted fill.
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { gap: 2, padding: 3, border: `1px solid ${c.line}`, borderRadius: radius.control, backgroundColor: c.inputBg },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            borderRadius: `${radius.control - 3}px !important`,
            border: 0,
            padding: "6px 12px",
            minHeight: CONTROL_HEIGHT - 8,
            color: c.muted,
            "&.Mui-selected": {
              backgroundColor: tint,
              color: c.primaryText,
              fontWeight: 600,
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
            borderRadius: radius.sm,
            paddingTop: 6,
            paddingBottom: 6,
            color: c.muted,
            "&:hover": { color: c.text },
            "&.Mui-selected": {
              backgroundColor: tint,
              color: c.primaryText,
              fontWeight: 600,
            },
            "&.Mui-selected:hover": {
              backgroundColor: tint,
            },
            "&.Mui-selected .MuiListItemIcon-root": { color: c.primaryText },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: { root: { color: "inherit", minWidth: 34, "& svg": { fontSize: 20 } } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.line },
          head: {
            fontSize: "0.75rem",
            fontWeight: 600,
            color: c.muted,
            backgroundColor: subtle,
            whiteSpace: "nowrap",
          },
          stickyHeader: { backgroundColor: c.inputBg },
        },
      },
      MuiTableRow: {
        styleOverrides: { root: { "&.MuiTableRow-hover:hover": { backgroundColor: subtle } } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: c.text,
            color: c.bg,
            borderRadius: radius.sm,
          },
          arrow: { color: c.text },
        },
      },
      MuiRating: {
        styleOverrides: { iconFilled: { color: c.star }, iconEmpty: { color: c.starOff } },
      },
      MuiAvatar: {
        styleOverrides: { colorDefault: { backgroundColor: tint, color: c.primaryText } },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: radius.control } },
      },
      MuiSkeleton: {
        styleOverrides: { rounded: { borderRadius: radius.control } },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: `1px solid ${c.line}`,
            borderRadius: radius.control,
            backgroundColor: c.bg,
            "--DataGrid-rowBorderColor": c.line,
            "--DataGrid-t-header-background-base": c.bg,
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 600,
              fontSize: "0.75rem",
              color: c.muted,
            },
            "& .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within": {
              outline: "none",
            },
            // Controls inside rows stay compact; the 44px minimum is for standalone controls.
            "& .MuiDataGrid-cell .MuiButton-root": { minHeight: 0 },
            "& .MuiDataGrid-row:hover": { backgroundColor: subtle },
            "& .MuiDataGrid-footerContainer": { borderTop: `1px solid ${c.line}` },
          },
        },
      },
    },
  });
}
