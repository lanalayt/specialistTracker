import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { SPORT_MAP, localKeyForSport, isTeamScoped } from "@/lib/settingsKeys";
import { useBootstrap } from "@/lib/bootstrapContext";
import { getTeamId } from "@/lib/teamData";

function getSport(localKey: string): string | null {
  return SPORT_MAP[localKey] ?? null;
}

// ─── DB-backed store ────────────────────────────────────────────────────────
// The user_settings table is the single source of truth. This in-app store
// holds the values loaded from the DB so ANY code (component render, event
// callback, or a non-React module like exportStats) can read them
// synchronously — the browser cannot read the DB synchronously, and settings
// are read outside React render in several places. There is NO localStorage.
// Seed from the server-injected bootstrap (app/layout) so synchronous readers
// get the correct values on the very first paint — no flash, no client storage.
function initialCache(): Record<string, unknown> {
  if (typeof window !== "undefined") {
    const boot = (window as unknown as { __ST_BOOTSTRAP__?: { settings?: Record<string, unknown> } }).__ST_BOOTSTRAP__;
    if (boot?.settings) return { ...boot.settings };
  }
  return {};
}

const _cache: Record<string, unknown> = initialCache();
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
    let settings: unknown = null;
    if (isTeamScoped(localKey)) {
      // Team charting config — read from the per-team table (RLS: team members).
      const teamId = getTeamId();
      if (!teamId || teamId === "local-dev") return null;
      const { data } = await supabase
        .from("team_sport_settings")
        .select("settings")
        .eq("team_id", teamId)
        .eq("sport", sport)
        .maybeSingle();
      settings = data?.settings ?? null;
    } else {
      // Per-user pref — read from user_settings.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .eq("sport", sport)
        .maybeSingle();
      settings = data?.settings ?? null;
    }
    if (settings) {
      _cache[localKey] = settings;
      notify();
      return settings as T;
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
    if (isTeamScoped(localKey)) {
      // Team charting config — write to the per-team table. RLS allows only
      // coaches; an athlete's write silently affects 0 rows (that's the guard).
      const teamId = getTeamId();
      if (teamId && teamId !== "local-dev") {
        supabase.from("team_sport_settings").upsert(
          {
            team_id: teamId,
            sport,
            settings: data as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "team_id,sport" }
        ).then(() => {}, () => {});
      }
    } else {
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
  const boot = useBootstrap();
  const fromBoot = () => (boot?.settings?.[localKey] as T) ?? null;
  const [val, setVal] = useState<T | null>(() => getCachedSettings<T>(localKey) ?? fromBoot());
  useEffect(() => {
    const update = () => setVal(getCachedSettings<T>(localKey) ?? fromBoot());
    _subs.add(update);
    update();                       // sync to current cache on mount
    loadSettingsFromCloud<T>(localKey); // ensure it's loaded
    return () => { _subs.delete(update); };
  }, [localKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return val;
}

// ─── App prefs bucket ────────────────────────────────────────────────────────
// Assorted per-user UI prefs that aren't sport settings live together in one
// user_settings row (sport = "app") as a JSON object, read/written by sub-key.
const APP_KEY = "appSettings";

/** Synchronous read of a single app pref (null until loaded / unset). */
export function getAppPref<T>(key: string): T | null {
  const app = getCachedSettings<Record<string, unknown>>(APP_KEY);
  return (app?.[key] as T) ?? null;
}

/** Merge a single app pref into the "app" bucket and persist it. */
export function setAppPref(key: string, value: unknown): void {
  const app = (getCachedSettings<Record<string, unknown>>(APP_KEY)) ?? {};
  saveSettingsToCloud(APP_KEY, { ...app, [key]: value });
}

/** Reactive hook for a single app pref. */
export function useAppPref<T>(key: string): T | null {
  const app = useSettings<Record<string, unknown>>(APP_KEY);
  return (app?.[key] as T) ?? null;
}

/**
 * Subscribe to settings realtime so changes propagate into the store:
 *  - user_settings for THIS user (per-user prefs, cross-device), and
 *  - team_sport_settings for the user's TEAM, so a coach's charting-config change
 *    reaches every athlete's open session live.
 * Returns an unsubscribe fn.
 */
export function subscribeSettingsRealtime(userId: string): () => void {
  const supabase = createClient();
  const apply = (row: { sport?: string; settings?: unknown } | null) => {
    if (!row?.sport) return;
    const localKey = localKeyForSport(row.sport);
    if (localKey && row.settings !== undefined) {
      _cache[localKey] = row.settings;
      notify();
    }
  };

  const userChannel = supabase
    .channel(`user_settings:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` },
      (payload) => apply((payload.new ?? null) as { sport?: string; settings?: unknown } | null)
    )
    .subscribe();

  const teamId = getTeamId();
  const teamChannel = teamId && teamId !== "local-dev"
    ? supabase
        .channel(`team_sport_settings:${teamId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "team_sport_settings", filter: `team_id=eq.${teamId}` },
          (payload) => apply((payload.new ?? null) as { sport?: string; settings?: unknown } | null)
        )
        .subscribe()
    : null;

  return () => {
    try { supabase.removeChannel(userChannel); } catch {}
    if (teamChannel) { try { supabase.removeChannel(teamChannel); } catch {} }
  };
}
