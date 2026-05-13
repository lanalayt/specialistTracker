import { createClient } from "@/lib/supabase";

/**
 * Scout Mode data persistence layer.
 * Uses the existing `sessions` table with SCOUT_* sport values
 * to keep scout data completely isolated from coach mode.
 */

// ── Scout Sessions ──────────────────────────────────────────────────────────

export interface ScoutSession {
  id: string;
  sport: string; // SCOUT_FG, SCOUT_PUNT, SCOUT_KO, SCOUT_SNAP
  label: string;
  date: string;
  entries: Record<string, unknown>[];
}

export async function loadScoutSessions(teamId: string, sport: string): Promise<ScoutSession[]> {
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("team_id", teamId)
      .eq("sport", sport)
      .is("deleted_at", null)
      .order("date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id as string,
      sport: row.sport as string,
      label: row.label as string,
      date: row.date as string,
      entries: (row.entries ?? []) as Record<string, unknown>[],
    }));
  } catch (err) {
    console.warn("[ScoutStore] loadScoutSessions failed:", err);
    return [];
  }
}

export async function insertScoutSession(teamId: string, session: ScoutSession): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase.from("sessions").upsert(
      {
        id: session.id,
        team_id: teamId,
        sport: session.sport,
        label: session.label,
        date: session.date,
        mode: "practice",
        entries: session.entries,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,id", ignoreDuplicates: true }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[ScoutStore] insertScoutSession failed:", err);
    return false;
  }
}

export async function deleteAllScoutSessions(teamId: string, sport: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("team_id", teamId)
      .eq("sport", sport)
      .is("deleted_at", null);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[ScoutStore] deleteAllScoutSessions failed:", err);
    return false;
  }
}

export async function deleteAthleteFromSessions(teamId: string, sport: string, athleteName: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const sessions = await loadScoutSessions(teamId, sport);
    const supabase = createClient();
    for (const s of sessions) {
      const filtered = s.entries.filter((e) => (e as { athlete?: string }).athlete !== athleteName);
      if (filtered.length === 0) {
        await supabase.from("sessions").delete().eq("team_id", teamId).eq("id", s.id);
      } else {
        await supabase.from("sessions").update({ entries: filtered, updated_at: new Date().toISOString() }).eq("team_id", teamId).eq("id", s.id);
      }
    }
    return true;
  } catch (err) {
    console.warn("[ScoutStore] deleteAthleteFromSessions failed:", err);
    return false;
  }
}

// ── Scout Profiles (stored in team_data) ────────────────────────────────────

export interface ScoutProfile {
  name: string;
  dob?: string;
  school?: string;
  schoolYear?: string;
  position?: string;
  height?: string;
  weight?: string;
  majorPreference?: string;
  notes?: string;
}

const SCOUT_PROFILES_KEY = "scout_profiles";

export async function loadScoutProfiles(teamId: string): Promise<Record<string, ScoutProfile>> {
  try {
    const raw = localStorage.getItem(SCOUT_PROFILES_KEY);
    if (raw) return JSON.parse(raw) as Record<string, ScoutProfile>;
  } catch {}
  if (!teamId || teamId === "local-dev") return {};
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data").select("data").eq("team_id", teamId).eq("data_key", SCOUT_PROFILES_KEY).single();
    if (error || !data) return {};
    const profiles = data.data as unknown as Record<string, ScoutProfile>;
    if (profiles && typeof profiles === "object") {
      localStorage.setItem(SCOUT_PROFILES_KEY, JSON.stringify(profiles));
      return profiles;
    }
    return {};
  } catch { return {}; }
}

export async function saveScoutProfiles(teamId: string, profiles: Record<string, ScoutProfile>): Promise<void> {
  localStorage.setItem(SCOUT_PROFILES_KEY, JSON.stringify(profiles));
  if (!teamId || teamId === "local-dev") return;
  try {
    const supabase = createClient();
    await supabase.from("team_data").upsert(
      { team_id: teamId, data_key: SCOUT_PROFILES_KEY, data: profiles as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
      { onConflict: "team_id,data_key" }
    );
  } catch {}
}

// ── Presets (stored in team_data) ───────────────────────────────────────────

export async function loadScoutPreset<T>(teamId: string, key: string): Promise<T | null> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  if (!teamId || teamId === "local-dev") return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data")
      .select("data")
      .eq("team_id", teamId)
      .eq("data_key", key)
      .single();
    if (error || !data) return null;
    return data.data as T;
  } catch {
    return null;
  }
}

export async function saveScoutPreset<T>(teamId: string, key: string, value: T): Promise<void> {
  localStorage.setItem(key, JSON.stringify(value));
  if (!teamId || teamId === "local-dev") return;
  try {
    const supabase = createClient();
    await supabase.from("team_data").upsert(
      {
        team_id: teamId,
        data_key: key,
        data: value as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,data_key" }
    );
  } catch {}
}

// ── Scout Athletes (stored in team_data, per-sport) ─────────────────────────

export async function loadScoutAthletes(teamId: string, sport: string): Promise<string[]> {
  const key = `scout_athletes_${sport}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data")
      .select("data")
      .eq("team_id", teamId)
      .eq("data_key", key)
      .single();
    if (error || !data) return [];
    const names = data.data as unknown as string[];
    if (Array.isArray(names)) {
      localStorage.setItem(key, JSON.stringify(names));
      return names;
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveScoutAthletes(teamId: string, sport: string, names: string[]): Promise<void> {
  const key = `scout_athletes_${sport}`;
  localStorage.setItem(key, JSON.stringify(names));
  if (!teamId || teamId === "local-dev") return;
  try {
    const supabase = createClient();
    await supabase.from("team_data").upsert(
      {
        team_id: teamId,
        data_key: key,
        data: names as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,data_key" }
    );
  } catch {}
}

// ── Scout Archives (stored in team_data) ────────────────────────────────────

export interface ScoutArchive {
  id: string;
  name: string;
  createdAt: string;
  fg: ScoutSession[];
  punt: ScoutSession[];
  kickoff: ScoutSession[];
  snap: ScoutSession[];
}

const SCOUT_ARCHIVES_KEY = "scout_archives";

export async function loadScoutArchives(teamId: string): Promise<ScoutArchive[]> {
  if (!teamId || teamId === "local-dev") {
    try {
      const raw = localStorage.getItem(SCOUT_ARCHIVES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data")
      .select("data")
      .eq("team_id", teamId)
      .eq("data_key", SCOUT_ARCHIVES_KEY)
      .single();
    if (error || !data) return [];
    return (data.data as unknown as ScoutArchive[]) ?? [];
  } catch {
    return [];
  }
}

export async function saveScoutArchives(teamId: string, archives: ScoutArchive[]): Promise<void> {
  localStorage.setItem(SCOUT_ARCHIVES_KEY, JSON.stringify(archives));
  if (!teamId || teamId === "local-dev") return;
  try {
    const supabase = createClient();
    await supabase.from("team_data").upsert(
      {
        team_id: teamId,
        data_key: SCOUT_ARCHIVES_KEY,
        data: archives as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,data_key" }
    );
  } catch {}
}
