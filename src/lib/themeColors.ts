/**
 * Theme color customization with 3 school colors.
 * Syncs to the teams/custom_themes tables so all devices on the same account share the theme.
 */

import { getTeamId } from "@/lib/teamData";
import { updateTeamSettings, stampTeamSettingsWrite, getCachedTeamSettings } from "@/lib/teamSettingsStore";
import { createClient } from "@/lib/supabase";
import { themeVarMap, themeCssText, DEFAULT_THEME, type ThemeColors } from "@/lib/themeCss";

export { themeVarMap, themeCssText, DEFAULT_THEME };
export type { ThemeColors };

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
  { name: "Purple, White & Magenta", colors: { primary: "#ffffff", secondary: "#1a0a2e", tertiary: "#d6249f" } },
];

// ── In-memory caches (source of truth is the DB) ────────────────────────────
// The active theme and the per-team saved themes are held in memory so
// synchronous readers (initial renders, field views) can access them without
// localStorage. Populated from the `teams` / `custom_themes` tables.
// Theme injected into the initial HTML by the server (see src/lib/serverTheme.ts
// + app/layout.tsx). Read synchronously on the client so the first render uses
// the correct team colors with no flash — this is server-rendered HTML, not
// client storage. Falls back to the default when logged out / not injected.
function getInitialTheme(): ThemeColors {
  if (typeof window !== "undefined") {
    const team = (window as unknown as {
      __ST_BOOTSTRAP__?: { team?: { colorPrimary?: string; colorSecondary?: string; colorTertiary?: string } | null };
    }).__ST_BOOTSTRAP__?.team;
    if (team?.colorPrimary && team?.colorSecondary && team?.colorTertiary) {
      return { primary: team.colorPrimary, secondary: team.colorSecondary, tertiary: team.colorTertiary };
    }
  }
  return DEFAULT_THEME;
}

let _themeCache: ThemeColors = getInitialTheme();
let _customThemesCache: SavedTheme[] = [];

/** Synchronous read of the currently-applied theme colors. */
export function getCurrentTheme(): ThemeColors {
  return _themeCache;
}

// ── Custom saved themes (per-team) ──────────────────────────────────────────

export interface SavedTheme {
  name: string;
  colors: ThemeColors;
}

export function loadCustomThemes(): SavedTheme[] {
  return _customThemesCache;
}

export function saveCustomThemes(themes: SavedTheme[]): void {
  _customThemesCache = themes;
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    (async () => {
      try {
        const supabase = createClient();
        await supabase.from("custom_themes").delete().eq("team_id", tid);
        for (let i = 0; i < themes.length; i++) {
          await supabase.from("custom_themes").upsert(
            {
              team_id: tid,
              name: themes[i].name,
              color_primary: themes[i].colors.primary,
              color_secondary: themes[i].colors.secondary,
              color_tertiary: themes[i].colors.tertiary,
              sort_order: i,
            },
            { onConflict: "team_id,name" }
          );
        }
      } catch {}
    })();
  }
}

export async function loadCustomThemesFromCloud(): Promise<SavedTheme[]> {
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("custom_themes")
        .select("name, color_primary, color_secondary, color_tertiary")
        .eq("team_id", tid)
        .order("sort_order", { ascending: true });
      if (data?.length) {
        const themes: SavedTheme[] = data.map((r) => ({
          name: r.name,
          colors: { primary: r.color_primary, secondary: r.color_secondary, tertiary: r.color_tertiary },
        }));
        _customThemesCache = themes;
        return themes;
      }
    } catch {}
  }
  return loadCustomThemes();
}

export function applyTheme(colors: ThemeColors): void {
  _themeCache = colors;
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = themeVarMap(colors);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

/** Apply the last-known theme (from the teams-table cache) immediately. The
 *  authoritative cloud load is handled by AppProviders via useTeamSettingsSync. */
export function loadAndApplyTheme(): ThemeColors {
  const s = getCachedTeamSettings();
  const theme: ThemeColors = s
    ? { primary: s.colorPrimary, secondary: s.colorSecondary, tertiary: s.colorTertiary }
    : getInitialTheme();
  applyTheme(theme);
  return theme;
}

/** Save theme to the teams table + apply immediately (no localStorage) */
export function saveTheme(colors: ThemeColors): void {
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
