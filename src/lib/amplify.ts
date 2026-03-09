// ─── Storage helpers (localStorage) ──────────────────────────────────────────

const STORAGE_KEYS = {
  FG: "st_fg_v1",
  PUNT: "st_punt_v1",
  KICKOFF: "st_kickoff_v1",
  LONGSNAP: "st_longsnap_v1",
  TEAM: "st_team_v1",
  AUTH: "st_auth_v1",
} as const;

export function localGet<T>(key: keyof typeof STORAGE_KEYS): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function localSet<T>(key: keyof typeof STORAGE_KEYS, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(data));
  } catch {
    console.warn("[Storage] Could not write to localStorage");
  }
}
