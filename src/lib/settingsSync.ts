import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

// Map legacy localStorage-era keys to per-user rows (the `sport` column) in the
// user_settings table. This is the single source of truth for these keys —
// nothing lives in localStorage. The sport column is free-form TEXT, so
// per-device calibrations (strike zones) get their own rows here too.
const SPORT_MAP: Record<string, string> = {
  fgSettings: "fg",
  puntSettings: "punt",
  kickoffSettings: "kickoff",
  snapSettings: "snap",
  strikeZoneBounds_v5: "punt_strike_zone",
  holderStrikeZoneBounds: "holder_strike_zone",
};

function getSport(localKey: string): string | null {
  return SPORT_MAP[localKey] ?? null;
}

// ─── DB-backed store ────────────────────────────────────────────────────────
// The user_settings table is the single source of truth. This in-app store
// holds the values loaded from the DB so ANY code (component render, event
// callback, or a non-React module like exportStats) can read them
// synchronously — the browser cannot read the DB synchronously, and settings
// are read outside React render in several places. There is NO localStorage.
const _cache: Record<string, unknown> = {};
const _subs = new Set<() => void>();

function notify() { _subs.forEach((fn) => { try { fn(); } catch {} }); }

/** Synchronous read of the last-known settings for a key (null until loaded). */
export function getCachedSettings<T>(localKey: string): T | null {
  return (_cache[localKey] as T) ?? null;
}

async function fetchSport<T>(localKey: string): Promise<T | null> {
  const sport = getSport(localKey);
  if (!sport) return null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", user.id)
      .eq("sport", sport)
      .maybeSingle();
    if (data?.settings) {
      _cache[localKey] = data.settings;
      notify();
      return data.settings as T;
    }
  } catch {}
  return null;
}

/** Load a settings object from user_settings, populating the store. */
export async function loadSettingsFromCloud<T>(localKey: string): Promise<T | null> {
  return fetchSport<T>(localKey);
}

/** Warm the store for every sport at app startup so synchronous readers hit it. */
export async function preloadSettings(): Promise<void> {
  await Promise.all(Object.keys(SPORT_MAP).map((k) => fetchSport(k)));
}

/**
 * Save a settings object to user_settings + the in-app store, and notify
 * subscribers. No localStorage.
 */
export function saveSettingsToCloud<T>(localKey: string, data: T): void {
  _cache[localKey] = data;
  notify();

  const sport = getSport(localKey);
  if (sport) {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        await supabase.from("user_settings").upsert(
          {
            user_id: user.id,
            sport,
            settings: data as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,sport" }
        );
      }
    }).catch(() => {});
  }

  // Legacy notifier for any listeners not yet migrated to useSettings().
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("settingsChanged"));
  }
}

/**
 * Reactive hook: returns the current settings object for a key and re-renders
 * when it changes (local save or realtime update from another device).
 */
export function useSettings<T>(localKey: string): T | null {
  const [val, setVal] = useState<T | null>(() => getCachedSettings<T>(localKey));
  useEffect(() => {
    const update = () => setVal(getCachedSettings<T>(localKey));
    _subs.add(update);
    update();                       // sync to current cache on mount
    loadSettingsFromCloud<T>(localKey); // ensure it's loaded
    return () => { _subs.delete(update); };
  }, [localKey]);
  return val;
}

/**
 * Subscribe to user_settings realtime for the signed-in user so cross-device
 * settings changes propagate into the store. Returns an unsubscribe fn.
 */
export function subscribeSettingsRealtime(userId: string): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(`user_settings:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? null) as { sport?: string; settings?: unknown } | null;
        if (!row?.sport) return;
        const localKey = Object.keys(SPORT_MAP).find((k) => SPORT_MAP[k] === row.sport);
        if (localKey && row.settings !== undefined) {
          _cache[localKey] = row.settings;
          notify();
        }
      }
    )
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch {} };
}
