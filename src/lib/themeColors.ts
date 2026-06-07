/**
 * Theme color customization with 3 school colors.
 * Syncs to team_data so all devices on the same account share the same theme.
 */

import { getTeamId } from "@/lib/teamData";
import { updateTeamSettings, stampTeamSettingsWrite } from "@/lib/teamSettingsStore";
import { saveSettingsToCloud, loadSettingsFromCloud } from "@/lib/settingsSync";

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
  { name: "Auburn", colors: { primary: "#ffffff", secondary: "#0a1428", tertiary: "#f47b20" } },
  { name: "LSU", colors: { primary: "#fdd023", secondary: "#1a0a2e", tertiary: "#461d7c" } },
  { name: "Georgia", colors: { primary: "#ba0c2f", secondary: "#0a0a0a", tertiary: "#ba0c2f" } },
  { name: "Texas A&M", colors: { primary: "#500000", secondary: "#0a0606", tertiary: "#2a1010" } },
  { name: "Tennessee", colors: { primary: "#ff8200", secondary: "#0a0a0a", tertiary: "#1a1a1a" } },
  { name: "Florida", colors: { primary: "#fa4616", secondary: "#003087", tertiary: "#fa4616" } },
  { name: "Ole Miss", colors: { primary: "#ce1126", secondary: "#0a0d1a", tertiary: "#14213d" } },
  // Big 12 / Big Ten / ACC
  { name: "Texas", colors: { primary: "#ffffff", secondary: "#bf5700", tertiary: "#0a0a0a" } },
  { name: "Oklahoma", colors: { primary: "#841617", secondary: "#0a0606", tertiary: "#2a1010" } },
  { name: "Ohio State", colors: { primary: "#bb0000", secondary: "#0a0a0a", tertiary: "#333333" } },
  { name: "Michigan", colors: { primary: "#ffcb05", secondary: "#00274c", tertiary: "#ffcb05" } },
  { name: "Penn State", colors: { primary: "#ffffff", secondary: "#041e42", tertiary: "#0a2a5f" } },
  { name: "Oregon", colors: { primary: "#154733", secondary: "#0a0a08", tertiary: "#fce122" } },
  { name: "Clemson", colors: { primary: "#f56600", secondary: "#1a0a2e", tertiary: "#522d80" } },
  { name: "Colorado", colors: { primary: "#cfb87c", secondary: "#0a0a0a", tertiary: "#cfb87c" } },
  { name: "New Mexico State", colors: { primary: "#861f41", secondary: "#0a0606", tertiary: "#2a1018" } },
  { name: "Missouri Western", colors: { primary: "#ffc700", secondary: "#0a0a0a", tertiary: "#2a2410" } },
  // WCC / Other D1
  { name: "San Diego", colors: { primary: "#ffffff", secondary: "#001a3a", tertiary: "#84BCE8" } },
  // Other / D2 / Common combos
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

// ── Custom saved themes (per-team) ──────────────────────────────────────────

const CUSTOM_THEMES_KEY = "st_custom_themes";

export interface SavedTheme {
  name: string;
  colors: ThemeColors;
}

export function loadCustomThemes(): SavedTheme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (raw) return JSON.parse(raw) as SavedTheme[];
  } catch {}
  return [];
}

export function saveCustomThemes(themes: SavedTheme[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  // Save per-team so other teams don't see these
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    import("@/lib/teamData").then(({ teamSet }) => {
      teamSet(tid, CUSTOM_THEMES_KEY, { themes });
    });
  }
}

export async function loadCustomThemesFromCloud(): Promise<SavedTheme[]> {
  // Load per-team first
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    try {
      const { teamGet } = await import("@/lib/teamData");
      const teamData = await teamGet<{ themes: SavedTheme[] }>(tid, CUSTOM_THEMES_KEY);
      if (teamData?.themes?.length) {
        localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(teamData.themes));
        return teamData.themes;
      }
    } catch {}
  }
  // Fall back to legacy user_data
  const cloud = await loadSettingsFromCloud<{ themes: SavedTheme[] }>(CUSTOM_THEMES_KEY);
  if (cloud?.themes?.length) {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(cloud.themes));
    return cloud.themes;
  }
  return loadCustomThemes();
}

/** Derive all CSS variables from the 3 user-chosen colors */
export function applyTheme(colors: ThemeColors): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--accent", colors.primary);
  root.style.setProperty("--accent-dim", hexToRgba(colors.primary, 0.15));
  root.style.setProperty("--make", "#00d4a0");
  root.style.setProperty("--bg", colors.secondary);
  root.style.setProperty("--surface", lighten(colors.secondary, 0.06));
  root.style.setProperty("--surface-2", lighten(colors.secondary, 0.10));
  root.style.setProperty("--border", colors.tertiary);
  root.style.setProperty("--muted", lighten(colors.secondary, 0.45));
  root.style.setProperty("--miss", "#ef4444");
  root.style.setProperty("--warn", "#f59e0b");
  root.style.setProperty("--text", "#ffffff");
}

/** Load from localStorage immediately + apply. Cloud load is handled by AppProviders via useTeamSettingsSync. */
export function loadAndApplyTheme(): ThemeColors {
  if (typeof window === "undefined") return DEFAULT_THEME;
  let theme = DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ThemeColors;
      if (parsed.primary && parsed.secondary) {
        theme = parsed;
      }
    }
  } catch {}
  applyTheme(theme);
  return theme;
}

/** Save theme to localStorage + teams table + apply immediately */
export function saveTheme(colors: ThemeColors): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  applyTheme(colors);
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    stampTeamSettingsWrite();
    updateTeamSettings(tid, {
      colorPrimary: colors.primary,
      colorSecondary: colors.secondary,
      colorTertiary: colors.tertiary,
    });
  }
}
