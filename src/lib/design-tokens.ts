/** Raw design tokens shared between the MUI theme and components that need a direct CSS
 * value (chart series colors) rather than a theme palette lookup. */

export const radius = { sm: 4, md: 6, lg: 8, xl: 10, pill: 999 } as const;

/** Brand palette: navy (dark background), teal, sky, amber and orange. Every surface and text color
 * below is one of these or a tint derived from them; success/error greens and reds are the only
 * colors outside it (signals need them). */
export const BRAND = {
  navy: "#023047",
  teal: "#209EBB",
  sky: "#8ECAE6",
  amber: "#FFB701",
  orange: "#FC8500",
} as const;

/** Single flat accent used for all charts: brand teal holds ≥ 3:1 on both the light and dark card
 * surfaces, so data-viz stays single-hued in either mode. */
export const chartAccent = BRAND.teal;

/** App palette for both modes. `dark` on a tone is the text shade used on light backgrounds
 * (toneColor in signal.tsx). Orange is the primary accent (buttons, selection, tabs, header bars),
 * sky the secondary text in dark mode, teal the charts and amber the stars. Every text color here is
 * ≥ 4.5:1 on its mode's `paper` and `bg`. */
export const PALETTE = {
  light: {
    surface: { bg: "#F0F8FC", paper: "#FFFFFF", raised: "#E2F1F8", sidebar: "#E8F4FA", border: "#C6E2EF" },
    text: { primary: BRAND.navy, secondary: "#2E5E75", disabled: "#8DB3C4" },
    // Brand orange, deepened just enough to be readable as text on white (4.8:1 on its selected tint).
    primary: { main: "#A85700", dark: "#8A4800", light: "#FFF3E6", contrastText: "#FFFFFF" },
    amber: { main: BRAND.amber, dark: "#8F6500" },
    accent: BRAND.orange,
    success: { main: "#3E8E42", dark: "#2F7533" },
    warning: { main: BRAND.amber, dark: "#8F6500" },
    error: { main: "#C8503F", dark: "#A83A2C" },
    info: { main: BRAND.teal, dark: "#157389" },
  },
  dark: {
    surface: { bg: "#01131D", paper: "#01131D", raised: "#010D14", sidebar: "#010D14", border: "#1C4458" },
    text: { primary: "#EAF6FB", secondary: BRAND.sky, disabled: "#6E9AB0" },
    primary: { main: BRAND.orange, dark: "#E07600", light: "#1C3A40", contrastText: BRAND.navy },
    amber: { main: BRAND.amber, dark: "#E0A200" },
    accent: BRAND.orange,
    success: { main: "#7CC47F", dark: "#6AB26D" },
    warning: { main: BRAND.amber, dark: "#E0A200" },
    error: { main: "#EF8A78", dark: "#DD7866" },
    info: { main: "#3FB6D3", dark: BRAND.teal },
  },
} as const;
