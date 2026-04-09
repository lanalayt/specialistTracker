/**
 * Theme color customization.
 * Stores user-chosen colors and applies them as CSS custom properties on :root.
 */

const STORAGE_KEY = "st_theme";

export interface ThemeColors {
  accent: string;   // primary accent (buttons, highlights, make)
  bg: string;       // page background
  surface: string;  // card / sidebar background
  surface2: string; // secondary surface
  border: string;   // borders
}

export const DEFAULT_THEME: ThemeColors = {
  accent: "#00d4a0",
  bg: "#0a0f14",
  surface: "#141c26",
  surface2: "#1a2535",
  border: "#1f2f42",
};

// Preset palettes
export const PRESETS: { name: string; colors: ThemeColors }[] = [
  {
    name: "Default (Teal)",
    colors: DEFAULT_THEME,
  },
  {
    name: "Blue",
    colors: { accent: "#3b82f6", bg: "#0a0f1a", surface: "#111827", surface2: "#1e293b", border: "#1e3a5f" },
  },
  {
    name: "Purple",
    colors: { accent: "#8b5cf6", bg: "#0f0a1a", surface: "#1a1127", surface2: "#251a3b", border: "#2e1f5f" },
  },
  {
    name: "Red",
    colors: { accent: "#ef4444", bg: "#140a0a", surface: "#1c1111", surface2: "#2a1a1a", border: "#3f1f1f" },
  },
  {
    name: "Gold",
    colors: { accent: "#f59e0b", bg: "#0f0d0a", surface: "#1a1711", surface2: "#2a2418", border: "#3f3520" },
  },
  {
    name: "Emerald",
    colors: { accent: "#10b981", bg: "#0a1410", surface: "#111c16", surface2: "#1a2b22", border: "#1f3f2f" },
  },
  {
    name: "Pink",
    colors: { accent: "#ec4899", bg: "#140a10", surface: "#1c1118", surface2: "#2a1a25", border: "#3f1f35" },
  },
  {
    name: "Orange",
    colors: { accent: "#f97316", bg: "#140e0a", surface: "#1c1511", surface2: "#2a2018", border: "#3f2f1f" },
  },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Apply theme colors to :root CSS variables */
export function applyTheme(colors: ThemeColors): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-dim", hexToRgba(colors.accent, 0.15));
  root.style.setProperty("--make", colors.accent);
  root.style.setProperty("--bg", colors.bg);
  root.style.setProperty("--surface", colors.surface);
  root.style.setProperty("--surface-2", colors.surface2);
  root.style.setProperty("--border", colors.border);
}

/** Load saved theme from localStorage, apply it, and return it */
export function loadAndApplyTheme(): ThemeColors {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeColors;
      if (parsed.accent && parsed.bg) {
        applyTheme(parsed);
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_THEME;
}

/** Save theme to localStorage + apply immediately */
export function saveTheme(colors: ThemeColors): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  applyTheme(colors);
}
