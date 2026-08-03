import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { TEAM_DEFAULTS as DEFAULTS, rowToTeamSettings, type TeamSettings } from "@/lib/teamSettingsTypes";
import { useBootstrap } from "@/lib/bootstrapContext";

export type { TeamSettings };

// ─── In-memory cache + subscriptions ─────────────────────────────────────────
// The `teams` table is the single source of truth; this cache lets non-React
// code (e.g. exportStats) and synchronous initial renders read the last-known
// settings without hitting the DB or localStorage. Seeded from the server-
// injected bootstrap (app/layout) so the first paint is already correct, then
// kept fresh by every load + realtime; subscribers re-render on any change.
function getInitialTeamSettings(): TeamSettings | null {
  if (typeof window !== "undefined") {
    const boot = (window as unknown as { __ST_BOOTSTRAP__?: { team?: TeamSettings | null } }).__ST_BOOTSTRAP__;
    if (boot?.team?.id) return boot.team;
  }
  return null;
}

let _cache: TeamSettings | null = getInitialTeamSettings();
const _subs = new Set<() => void>();
function notify() { _subs.forEach((fn) => { try { fn(); } catch {} }); }

/** Synchronous read of the last-loaded team settings (null until first load). */
export function getCachedTeamSettings(): TeamSettings | null {
  return _cache;
}

/** Synchronous read of the last-loaded team logo (null until loaded / unset). */
export function getCachedTeamLogo(): string | null {
  return _cache?.logo ?? null;
}

/** Optimistically merge a partial into the cache + notify (for instant UI before
 *  the DB write resolves). No-op if the cache isn't loaded yet. */
export function patchTeamSettingsCache(partial: Partial<Omit<TeamSettings, "id">>): void {
  if (_cache) { _cache = { ..._cache, ...partial }; notify(); }
}

/** Reactive hook: current team settings, re-rendering on any load/update.
 *  Initial value comes from the server bootstrap context so the SSR render (and
 *  the matching first client render) already have the correct values. */
export function useTeamSettings(): TeamSettings | null {
  const boot = useBootstrap();
  const [val, setVal] = useState<TeamSettings | null>(() => _cache ?? boot?.team ?? null);
  useEffect(() => {
    const update = () => setVal(_cache ?? boot?.team ?? null);
    _subs.add(update);
    update();
    return () => { _subs.delete(update); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return val;
}

/** Map DB snake_case row to camelCase TeamSettings (and refresh the cache) */
function rowToSettings(row: Record<string, unknown>): TeamSettings {
  const settings = rowToTeamSettings(row);
  _cache = settings;
  notify();
  return settings;
}

/** Map camelCase partial to DB snake_case columns */
function toDbColumns(partial: Partial<Omit<TeamSettings, "id">>): Record<string, unknown> {
  const map: Record<string, string> = {
    name: "name",
    school: "school",
    dashTitle: "dash_title",
    colorPrimary: "color_primary",
    colorSecondary: "color_secondary",
    colorTertiary: "color_tertiary",
    logo: "logo",
    enabledSports: "enabled_sports",
  };
  const cols: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partial)) {
    const col = map[key];
    if (col) cols[col] = value;
  }
  return cols;
}

/** SELECT from teams table */
export async function getTeamSettings(teamId: string): Promise<TeamSettings | null> {
  if (!teamId || teamId === "local-dev") return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .eq("id", teamId)
      .single();
    if (error || !data) return null;
    return rowToSettings(data);
  } catch {
    return null;
  }
}

/** INSERT ON CONFLICT DO NOTHING, then SELECT — for new accounts */
export async function ensureTeamExists(
  teamId: string,
  overrides: Partial<Omit<TeamSettings, "id">> = {}
): Promise<TeamSettings | null> {
  if (!teamId || teamId === "local-dev") return null;
  try {
    const supabase = createClient();
    const row = {
      id: teamId,
      ...toDbColumns({ ...DEFAULTS, ...overrides }),
    };
    await supabase.from("teams").upsert(row, { onConflict: "id", ignoreDuplicates: true });
    return getTeamSettings(teamId);
  } catch {
    return null;
  }
}

/** UPDATE specific columns */
export async function updateTeamSettings(
  teamId: string,
  partial: Partial<Omit<TeamSettings, "id">>
): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const cols = toDbColumns(partial);
    cols.updated_at = new Date().toISOString();
    const { error } = await supabase.from("teams").update(cols).eq("id", teamId);
    if (error) throw error;
    if (_cache && _cache.id === teamId) { _cache = { ..._cache, ...partial }; notify(); }
    return true;
  } catch (err) {
    console.warn("[TeamSettings] update failed:", err);
    return false;
  }
}

// Track last local write to implement grace period
let lastLocalWrite = 0;
const LOCAL_WRITE_GRACE_MS = 10_000;
const FALLBACK_POLL_MS = 15_000;

export function stampTeamSettingsWrite() {
  lastLocalWrite = Date.now();
}

/**
 * Realtime subscription on the `teams` table for a single team row.
 * Calls `onUpdate` whenever the remote row changes (realtime + polling fallback).
 */
export function useTeamSettingsSync(
  teamId: string | null,
  onUpdate: (settings: TeamSettings) => void,
  enabled = true
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const lastUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !teamId || teamId === "local-dev") return;
    if (typeof window === "undefined") return;

    let active = true;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function applyIfNewer(row: Record<string, unknown>) {
      if (!active) return;
      if (Date.now() - lastLocalWrite < LOCAL_WRITE_GRACE_MS) return;
      const ts = row.updated_at as string;
      if (ts && ts === lastUpdatedAt.current) return;
      lastUpdatedAt.current = ts;
      onUpdateRef.current(rowToSettings(row));
    }

    async function pullLatest(initial = false) {
      if (!active) return;
      try {
        const { data, error } = await supabase
          .from("teams")
          .select("*")
          .eq("id", teamId)
          .single();
        if (error || !data) return;
        if (initial) {
          lastUpdatedAt.current = data.updated_at as string;
          return;
        }
        applyIfNewer(data);
      } catch {}
    }

    // Initial snapshot
    pullLatest(true).then(() => {
      if (!active) return;

      // Realtime channel
      channel = supabase
        .channel(`teams:${teamId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "teams",
            filter: `id=eq.${teamId}`,
          },
          (payload) => {
            if (!active) return;
            const row = payload.new as Record<string, unknown> | null;
            if (row) {
              applyIfNewer(row);
            } else {
              pullLatest();
            }
          }
        )
        .subscribe();

      // Fallback polling
      intervalId = setInterval(() => pullLatest(), FALLBACK_POLL_MS);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") pullLatest();
    };
    const onFocus = () => pullLatest();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [teamId, enabled]);
}
