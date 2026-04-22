// ─── Storage helpers (localStorage + Supabase sync) ──────────────────────────

import { cloudSet } from "@/lib/supabaseData";

export const STORAGE_KEYS = {
  FG: "st_fg_v1",
  PUNT: "st_punt_v1",
  KICKOFF: "st_kickoff_v1",
  LONGSNAP: "st_longsnap_v1",
  TEAM: "st_team_v1",
  AUTH: "st_auth_v1",
} as const;

// Maps storage keys to Supabase data_key values
const CLOUD_KEYS: Record<keyof typeof STORAGE_KEYS, string> = {
  FG: "fg_data",
  PUNT: "punt_data",
  KICKOFF: "kickoff_data",
  LONGSNAP: "longsnap_data",
  TEAM: "team_data",
  AUTH: "auth_data",
};

// Current user ID for cloud sync (set by context providers)
let _currentUserId: string | null = null;

export function setCloudUserId(userId: string | null) {
  _currentUserId = userId;
}

export function getCloudUserId(): string | null {
  return _currentUserId;
}

export function localGet<T>(key: keyof typeof STORAGE_KEYS): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Write to localStorage. Also syncs to user_data (Supabase) unless
 * `skipCloud` is true. Pass skipCloud=true when the write originates
 * from a remote sync to avoid writing stale data back to the cloud.
 */
export function localSet<T>(key: keyof typeof STORAGE_KEYS, data: T, skipCloud = false): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(data));
  } catch {
    console.warn("[Storage] Could not write to localStorage");
  }

  // Also sync to Supabase user_data in the background (debounced)
  // Skip when data comes FROM a remote sync to avoid writing stale data back
  if (!skipCloud && _currentUserId && _currentUserId !== "local-dev") {
    cloudSet(_currentUserId, CLOUD_KEYS[key], data);
  }
}

/** Get the cloud key for a storage key */
export function getCloudKey(key: keyof typeof STORAGE_KEYS): string {
  return CLOUD_KEYS[key];
}
