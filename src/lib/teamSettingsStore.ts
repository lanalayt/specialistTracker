import { createClient } from "@/lib/supabase";
import { useEffect, useRef } from "react";

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

const DEFAULTS: Omit<TeamSettings, "id"> = {
  name: "My Team",
  school: "My School",
  dashTitle: "Special Teams Dashboard",
  colorPrimary: "#00d4a0",
  colorSecondary: "#0a0f14",
  colorTertiary: "#1f2f42",
  logo: null,
  enabledSports: ["KICKING", "PUNTING", "KICKOFF", "LONGSNAP"],
};

/** Map DB snake_case row to camelCase TeamSettings */
function rowToSettings(row: Record<string, unknown>): TeamSettings {
  return {
    id: row.id as string,
    name: row.name as string,
    school: row.school as string,
    dashTitle: row.dash_title as string,
    colorPrimary: row.color_primary as string,
    colorSecondary: row.color_secondary as string,
    colorTertiary: row.color_tertiary as string,
    logo: (row.logo as string) ?? null,
    enabledSports: (row.enabled_sports as string[]) ?? DEFAULTS.enabledSports,
  };
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
