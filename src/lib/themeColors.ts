/**
 * Theme color customization with 3 school colors.
 */

const STORAGE_KEY = "st_theme";

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

// Real football school color combos (primary, background, borders)
export const PRESETS: { name: string; colors: ThemeColors }[] = [
  { name: "Default", colors: DEFAULT_THEME },
  // SEC
  { name: "Alabama", colors: { primary: "#9e1b32", secondary: "#0a0606", tertiary: "#3d1520" } },
  { name: "Auburn", colors: { primary: "#f47b20", secondary: "#0a0d14", tertiary: "#1a2744" } },
  { name: "LSU", colors: { primary: "#fdd023", secondary: "#1a0a2e", tertiary: "#461d7c" } },
  { name: "Georgia", colors: { primary: "#ba0c2f", secondary: "#0a0a0a", tertiary: "#1a1a1a" } },
  { name: "Texas A&M", colors: { primary: "#500000", secondary: "#0a0606", tertiary: "#2a1010" } },
  { name: "Tennessee", colors: { primary: "#ff8200", secondary: "#0a0a0a", tertiary: "#1a1a1a" } },
  { name: "Florida", colors: { primary: "#fa4616", secondary: "#003087", tertiary: "#1a2a5f" } },
  { name: "Ole Miss", colors: { primary: "#ce1126", secondary: "#0a0d1a", tertiary: "#14213d" } },
  // Big 12 / Big Ten / ACC
  { name: "Texas", colors: { primary: "#bf5700", secondary: "#0a0a0a", tertiary: "#1a1a1a" } },
  { name: "Oklahoma", colors: { primary: "#841617", secondary: "#0a0606", tertiary: "#2a1010" } },
  { name: "Ohio State", colors: { primary: "#bb0000", secondary: "#0a0a0a", tertiary: "#333333" } },
  { name: "Michigan", colors: { primary: "#ffcb05", secondary: "#00274c", tertiary: "#0a1a30" } },
  { name: "Penn State", colors: { primary: "#ffffff", secondary: "#041e42", tertiary: "#0a2a5f" } },
  { name: "Oregon", colors: { primary: "#154733", secondary: "#0a0a08", tertiary: "#fce122" } },
  { name: "Clemson", colors: { primary: "#f56600", secondary: "#1a0a2e", tertiary: "#522d80" } },
  // Other / D2 / Common combos
  { name: "Navy & Orange", colors: { primary: "#ffffff", secondary: "#0a1428", tertiary: "#f97316" } },
  { name: "Black & Maroon", colors: { primary: "#ffffff", secondary: "#0a0a0a", tertiary: "#7c2d3c" } },
  { name: "Black & Gold", colors: { primary: "#ffd700", secondary: "#0a0a0a", tertiary: "#2a2510" } },
  { name: "Scarlet & Gray", colors: { primary: "#ce1141", secondary: "#121212", tertiary: "#555555" } },
  { name: "Green & White", colors: { primary: "#18453b", secondary: "#0a0f0c", tertiary: "#2a3f30" } },
  { name: "Purple & Gold", colors: { primary: "#8b5cf6", secondary: "#0f0a1a", tertiary: "#c4a000" } },
  { name: "Red & White", colors: { primary: "#e21833", secondary: "#0e0808", tertiary: "#ffffff" } },
  { name: "Blue & White", colors: { primary: "#003da5", secondary: "#0a0f1a", tertiary: "#ffffff" } },
];

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

/** Derive all CSS variables from the 3 user-chosen colors */
export function applyTheme(colors: ThemeColors): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--accent", colors.primary);
  root.style.setProperty("--accent-dim", hexToRgba(colors.primary, 0.15));
  root.style.setProperty("--make", colors.primary);
  root.style.setProperty("--bg", colors.secondary);
  root.style.setProperty("--surface", lighten(colors.secondary, 0.06));
  root.style.setProperty("--surface-2", lighten(colors.secondary, 0.10));
  root.style.setProperty("--border", colors.tertiary);
  root.style.setProperty("--muted", lighten(colors.secondary, 0.35));
  root.style.setProperty("--miss", "#ef4444");
  root.style.setProperty("--warn", "#f59e0b");
  root.style.setProperty("--text", "#f1f5f9");
}

export function loadAndApplyTheme(): ThemeColors {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeColors;
      if (parsed.primary && parsed.secondary) {
        applyTheme(parsed);
        return parsed;
      }
    }
  } catch {}
  applyTheme(DEFAULT_THEME);
  return DEFAULT_THEME;
}

export function saveTheme(colors: ThemeColors): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  applyTheme(colors);
}
