/** Raw design tokens ("Pathways"). The MUI theme (theme.ts) is built from these; components read them through
 * `theme.palette`, never as hex values. Chart series colors are the only direct consumers. */

/** 14px for buttons and inputs, 20px for the side panel, 999px for toggles and meters. `sm` is for small marks
 * (chips, tooltips). */
export const radius = { sm: 6, control: 14, panel: 20, pill: 999 } as const;

/** Controls (buttons, inputs, selects) are at least this tall. */
export const CONTROL_HEIGHT = 44;

/**
 * App palette for both modes. Blue is the primary action, teal marks status and the active page, orange (`accent`)
 * is kept for one action per screen, the stars and the credit meter. Text on blue is white; text on orange is always
 * `onAccent`. Success, warning, error and info are signal colors: `dark` is the text shade used on light backgrounds.
 * Every text color is at least 4.5:1 on its mode's `bg` and `panel`.
 */
export const PALETTE = {
  light: {
    bg: "#FFFFFF",
    panel: "#E8F6F8",
    track: "#C5E4E8",
    line: "#DDE4EC",
    text: "#2E3440",
    head: "#060097",
    muted: "#5B6675",
    primary: "#0071CE",
    primaryDark: "#005FAD",
    onPrimary: "#FFFFFF",
    primaryText: "#0067BD",
    teal: "#00ADBB",
    tealText: "#006A73",
    accent: "#F88D2A",
    accentDark: "#E57C1A",
    onAccent: "#231300",
    star: "#E07A10",
    starOff: "#CBD3DC",
    inputBg: "#FFFFFF",
    success: { main: "#3E8E42", dark: "#2F7533" },
    warning: { main: "#FFB701", dark: "#8F6500" },
    error: { main: "#C8503F", dark: "#A83A2C" },
    info: { main: "#209EBB", dark: "#157389" },
  },
  dark: {
    bg: "#08131F",
    panel: "#0A2530",
    track: "#17414C",
    line: "#223A52",
    text: "#EAF1F8",
    head: "#EAF1F8",
    muted: "#9DB0C4",
    primary: "#0071CE",
    primaryDark: "#005FAD",
    onPrimary: "#FFFFFF",
    primaryText: "#6DB8F7",
    teal: "#00ADBB",
    tealText: "#7DE0E8",
    accent: "#F88D2A",
    accentDark: "#E57C1A",
    onAccent: "#231300",
    star: "#F88D2A",
    starOff: "#34495E",
    inputBg: "#0F1E2E",
    success: { main: "#7CC47F", dark: "#6AB26D" },
    warning: { main: "#FFB701", dark: "#E0A200" },
    error: { main: "#EF8A78", dark: "#DD7866" },
    info: { main: "#3FB6D3", dark: "#209EBB" },
  },
} as const;

/** Single flat accent used for all charts (the same teal in both modes). */
export const chartAccent = PALETTE.light.teal;

/** Second series where two periods are compared: primary blue beside the teal. */
export const chartCompare = PALETTE.light.primary;
