/**
 * Pure theme-color helpers with NO client/runtime dependencies, so they can be
 * imported from both client code (themeColors.ts) and server code
 * (serverTheme.ts / app/layout.tsx) without pulling React hooks into a Server
 * Component.
 */

export interface ThemeColors {
  primary: string;    // accent — buttons, active states
  secondary: string;  // background base
  tertiary: string;   // border / highlight accent
}

export const DEFAULT_THEME: ThemeColors = {
  primary: "#00d4a0",
  secondary: "#0a0f14",
  tertiary: "#1f2f42",
};

function parseHex(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const lr = Math.min(255, r + Math.round((255 - r) * amount));
  const lg = Math.min(255, g + Math.round((255 - g) * amount));
  const lb = Math.min(255, b + Math.round((255 - b) * amount));
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Derive all CSS variables from the 3 user-chosen colors. */
export function themeVarMap(colors: ThemeColors): Record<string, string> {
  return {
    "--accent": colors.primary,
    "--accent-dim": hexToRgba(colors.primary, 0.15),
    "--make": "#00d4a0",
    "--bg": colors.secondary,
    "--surface": lighten(colors.secondary, 0.06),
    "--surface-2": lighten(colors.secondary, 0.10),
    "--border": colors.tertiary,
    "--muted": lighten(colors.secondary, 0.45),
    "--miss": "#ef4444",
    "--warn": "#f59e0b",
    "--text": "#ffffff",
  };
}

/** CSS declaration text (e.g. "--accent:#fff;--bg:#000") for a `:root { }` block. */
export function themeCssText(colors: ThemeColors): string {
  return Object.entries(themeVarMap(colors)).map(([k, v]) => `${k}:${v}`).join(";");
}
