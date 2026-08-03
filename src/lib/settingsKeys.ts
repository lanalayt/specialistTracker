/**
 * Canonical mapping between legacy localStorage-era keys and the per-user
 * `user_settings.sport` values. Pure module (no client/runtime deps) so both the
 * client store (settingsSync) and server code (serverBootstrap) can share it.
 */
export const SPORT_MAP: Record<string, string> = {
  fgSettings: "fg",
  puntSettings: "punt",
  kickoffSettings: "kickoff",
  snapSettings: "snap",
  strikeZoneBounds_v5: "punt_strike_zone",
  holderStrikeZoneBounds: "holder_strike_zone",
  // Reserved bucket for assorted per-user UI prefs (tutorial, blocked athletes,
  // exclude-live-reps toggles, entry-mode default) stored as one JSON object.
  appSettings: "app",
};

/** Reverse lookup: sport value -> local key (null if unknown). */
export function localKeyForSport(sport: string): string | null {
  return Object.keys(SPORT_MAP).find((k) => SPORT_MAP[k] === sport) ?? null;
}

/**
 * Sport charting config that belongs to the TEAM (stored in team_sport_settings,
 * coach-writable, read by everyone on the team) rather than the individual user.
 * Everything else in SPORT_MAP (strike-zone calibrations, the "app" pref bucket)
 * stays per-user in user_settings.
 */
export const TEAM_SPORT_KEYS: ReadonlySet<string> = new Set([
  "fgSettings",
  "puntSettings",
  "kickoffSettings",
  "snapSettings",
  "strikeZoneBounds_v5",
  "holderStrikeZoneBounds",
]);

export function isTeamScoped(localKey: string): boolean {
  return TEAM_SPORT_KEYS.has(localKey);
}
