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
};

/** Reverse lookup: user_settings.sport -> local key (null if unknown). */
export function localKeyForSport(sport: string): string | null {
  return Object.keys(SPORT_MAP).find((k) => SPORT_MAP[k] === sport) ?? null;
}
