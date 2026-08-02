/**
 * Pure team-settings types/defaults — no client or runtime deps, so both client
 * code (teamSettingsStore) and server code (serverBootstrap / app/layout) can
 * import them without pulling React hooks into a Server Component.
 */

export interface TeamSettings {
  id: string;
  name: string;
  school: string;
  dashTitle: string;
  colorPrimary: string;
  colorSecondary: string;
  colorTertiary: string;
  logo: string | null;
  enabledSports: string[];
}

export const TEAM_DEFAULTS: Omit<TeamSettings, "id"> = {
  name: "My Team",
  school: "My School",
  dashTitle: "Special Teams Dashboard",
  colorPrimary: "#00d4a0",
  colorSecondary: "#0a0f14",
  colorTertiary: "#1f2f42",
  logo: null,
  enabledSports: ["KICKING", "PUNTING", "KICKOFF", "LONGSNAP"],
};

/** Map a DB `teams` row (snake_case) to camelCase TeamSettings. */
export function rowToTeamSettings(row: Record<string, unknown>): TeamSettings {
  return {
    id: row.id as string,
    name: row.name as string,
    school: row.school as string,
    dashTitle: row.dash_title as string,
    colorPrimary: row.color_primary as string,
    colorSecondary: row.color_secondary as string,
    colorTertiary: row.color_tertiary as string,
    logo: (row.logo as string) ?? null,
    enabledSports: (row.enabled_sports as string[]) ?? TEAM_DEFAULTS.enabledSports,
  };
}
