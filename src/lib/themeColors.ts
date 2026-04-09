/**
 * Theme color customization with 3 school colors.
 *
 * The user picks:
 *   primary   → accent color (buttons, highlights, active states, make indicator)
 *   secondary → page backgrounds (bg, surface, surface-2 derived as lighter shades)
 *   tertiary  → borders, muted elements, secondary highlights
 *
 * These map to CSS custom properties on :root that Tailwind reads via var().
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

export const PRESETS: { name: string; colors: ThemeColors }[] = [
  { name: "Default", colors: DEFAULT_THEME },
  { name: "Blue & Navy", colors: { primary: "#3b82f6", secondary: "#0a0f1a", tertiary: "#1e3a5f" } },
  { name: "Purple & Black", colors: { primary: "#8b5cf6", secondary: "#0f0a1a", tertiary: "#2e1f5f" } },
  { name: "Red & Black", colors: { primary: "#ef4444", secondary: "#0e0808", tertiary: "#3f1f1f" } },
  { name: "Gold & Black", colors: { primary: "#f59e0b", secondary: "#0e0c08", tertiary: "#3f3520" } },
  { name: "Maroon & Black", colors: { primary: "#7c2d3c", secondary: "#0e0808", tertiary: "#3d1820" } },
  { name: "Orange & Navy", colors: { primary: "#f97316", secondary: "#0a0d14", tertiary: "#2a1f1f" } },
  { name: "Crimson & Cream", colors: { primary: "#dc2626", secondary: "#1a1614", tertiary: "#3a2820" } },
  { name: "Green & Gold", colors: { primary: "#16a34a", secondary: "#0a100c", tertiary: "#2a3520" } },
  { name: "Royal & White", colors: { primary: "#2563eb", secondary: "#0c1020", tertiary: "#1e2d5f" } },
  { name: "Scarlet & Gray", colors: { primary: "#cc0000", secondary: "#121212", tertiary: "#333333" } },
  { name: "Black & Gold", colors: { primary: "#eab308", secondary: "#0a0a0a", tertiary: "#2a2510" } },
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

  // Primary → accent, make
  root.style.setProperty("--accent", colors.primary);
  root.style.setProperty("--accent-dim", hexToRgba(colors.primary, 0.15));
  root.style.setProperty("--make", colors.primary);

  // Secondary → bg, surface, surface-2
  root.style.setProperty("--bg", colors.secondary);
  root.style.setProperty("--surface", lighten(colors.secondary, 0.06));
  root.style.setProperty("--surface-2", lighten(colors.secondary, 0.10));

  // Tertiary → border
  root.style.setProperty("--border", colors.tertiary);

  // Muted text — derived to be readable on the background
  root.style.setProperty("--muted", lighten(colors.secondary, 0.35));

  // Keep miss and warn fixed
  root.style.setProperty("--miss", "#ef4444");
  root.style.setProperty("--warn", "#f59e0b");
  root.style.setProperty("--text", "#f1f5f9");
}

/** Load saved theme from localStorage, apply it, and return it */
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
  // Apply defaults explicitly so CSS vars are always set
  applyTheme(DEFAULT_THEME);
  return DEFAULT_THEME;
}

/** Save theme to localStorage + apply immediately */
export function saveTheme(colors: ThemeColors): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  applyTheme(colors);
}
