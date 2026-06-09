import { createClient } from "@/lib/supabase";

/**
 * Scout Mode data persistence layer.
 * Uses the existing `sessions` table with SCOUT_* sport values
 * to keep scout data completely isolated from coach mode.
 *
 * Persistence model (team_data keys):
 *   - Reads are CLOUD-AUTHORITATIVE: when signed in we always read the live
 *     cloud copy so changes made by other accounts/devices are visible.
 *     localStorage is only a same-device cache / offline fallback.
 *   - Writes MERGE with the current cloud copy (never blind-overwrite a whole
 *     collection) so two people editing at once don't clobber each other.
 *   - Removals go through dedicated remove* helpers so a delete on one device
 *     is not resurrected by another device's stale list.
 */

/** Read a team_data key from the cloud. ok:false means the read failed (offline / error). */
async function cloudGet<T>(teamId: string, key: string): Promise<{ ok: true; value: T | null } | { ok: false }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data")
      .select("data")
      .eq("team_id", teamId)
      .eq("data_key", key)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, value: (data?.data ?? null) as T | null };
  } catch {
    return { ok: false };
  }
}

/** Upsert a team_data key in the cloud (best effort). */
async function cloudPut(teamId: string, key: string, value: unknown): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from("team_data").upsert(
      { team_id: teamId, data_key: key, data: value as Record<string, unknown>, updated_at: new Date().toISOString() },
      { onConflict: "team_id,data_key" }
    );
  } catch {}
}

function cacheGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}

function cacheSet(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── Scout Sessions ──────────────────────────────────────────────────────────

export interface ScoutSession {
  id: string;
  sport: string; // SCOUT_FG, SCOUT_PUNT, SCOUT_KO, SCOUT_SNAP
  label: string;
  date: string;
  weather?: string;
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
      weather: (row.weather as string) ?? undefined,
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
        weather: session.weather || null,
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

export async function deleteAthleteFromSession(teamId: string, sessionId: string, athleteName: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { data } = await supabase.from("sessions").select("entries").eq("team_id", teamId).eq("id", sessionId).single();
    if (!data) return false;
    const entries = (data.entries as Record<string, unknown>[]).filter((e) => (e as { athlete?: string }).athlete !== athleteName);
    if (entries.length === 0) {
      await supabase.from("sessions").delete().eq("team_id", teamId).eq("id", sessionId);
    } else {
      await supabase.from("sessions").update({ entries, updated_at: new Date().toISOString() }).eq("team_id", teamId).eq("id", sessionId);
    }
    return true;
  } catch (err) {
    console.warn("[ScoutStore] deleteAthleteFromSession failed:", err);
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
  if (!teamId || teamId === "local-dev") return cacheGet(SCOUT_PROFILES_KEY, {});
  const res = await cloudGet<Record<string, ScoutProfile>>(teamId, SCOUT_PROFILES_KEY);
  if (res.ok) {
    const profiles = res.value && typeof res.value === "object" ? res.value : {};
    cacheSet(SCOUT_PROFILES_KEY, profiles);
    return profiles;
  }
  // Offline / read failed — fall back to last-known cache.
  return cacheGet(SCOUT_PROFILES_KEY, {});
}

/** Merge the given profiles into the cloud copy (adds/updates only — never removes keys). */
export async function saveScoutProfiles(teamId: string, profiles: Record<string, ScoutProfile>): Promise<void> {
  cacheSet(SCOUT_PROFILES_KEY, profiles);
  if (!teamId || teamId === "local-dev") return;
  const res = await cloudGet<Record<string, ScoutProfile>>(teamId, SCOUT_PROFILES_KEY);
  const cloud = res.ok && res.value && typeof res.value === "object" ? res.value : {};
  const merged = { ...cloud, ...profiles };
  cacheSet(SCOUT_PROFILES_KEY, merged);
  await cloudPut(teamId, SCOUT_PROFILES_KEY, merged);
}

/** Remove a single profile from the cloud copy (safe delete — read/modify/write). */
export async function deleteScoutProfile(teamId: string, name: string): Promise<void> {
  if (!teamId || teamId === "local-dev") {
    const map = cacheGet<Record<string, ScoutProfile>>(SCOUT_PROFILES_KEY, {});
    delete map[name];
    cacheSet(SCOUT_PROFILES_KEY, map);
    return;
  }
  const res = await cloudGet<Record<string, ScoutProfile>>(teamId, SCOUT_PROFILES_KEY);
  const cloud = res.ok && res.value && typeof res.value === "object" ? { ...res.value } : {};
  delete cloud[name];
  cacheSet(SCOUT_PROFILES_KEY, cloud);
  await cloudPut(teamId, SCOUT_PROFILES_KEY, cloud);
}

// ── Presets (stored in team_data) ───────────────────────────────────────────

export async function loadScoutPreset<T>(teamId: string, key: string): Promise<T | null> {
  if (!teamId || teamId === "local-dev") return cacheGet<T | null>(key, null);
  const res = await cloudGet<T>(teamId, key);
  if (res.ok) {
    if (res.value != null) cacheSet(key, res.value);
    return res.value;
  }
  return cacheGet<T | null>(key, null);
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
  if (!teamId || teamId === "local-dev") return cacheGet<string[]>(key, []);
  const res = await cloudGet<string[]>(teamId, key);
  if (res.ok) {
    const names = Array.isArray(res.value) ? res.value : [];
    cacheSet(key, names);
    return names;
  }
  return cacheGet<string[]>(key, []);
}

/** Add athletes to a sport list, merging with the current cloud copy (never drops names). */
export async function saveScoutAthletes(teamId: string, sport: string, names: string[]): Promise<void> {
  const key = `scout_athletes_${sport}`;
  cacheSet(key, names);
  if (!teamId || teamId === "local-dev") return;
  const res = await cloudGet<string[]>(teamId, key);
  const cloud = res.ok && Array.isArray(res.value) ? res.value : [];
  const merged = Array.from(new Set([...cloud, ...names]));
  cacheSet(key, merged);
  await cloudPut(teamId, key, merged);
}

/** Remove one athlete from a sport list (safe delete — read/modify/write against the cloud). */
export async function removeScoutAthlete(teamId: string, sport: string, name: string): Promise<void> {
  const key = `scout_athletes_${sport}`;
  if (!teamId || teamId === "local-dev") {
    cacheSet(key, cacheGet<string[]>(key, []).filter((n) => n !== name));
    return;
  }
  const res = await cloudGet<string[]>(teamId, key);
  const cloud = res.ok && Array.isArray(res.value) ? res.value : cacheGet<string[]>(key, []);
  const next = cloud.filter((n) => n !== name);
  cacheSet(key, next);
  await cloudPut(teamId, key, next);
}

// ── Scout athlete jersey numbers ─────────────────────────────────────────────

export async function loadScoutNumbers(teamId: string, sport: string): Promise<Record<string, string>> {
  const key = `scout_numbers_${sport}`;
  if (!teamId || teamId === "local-dev") return cacheGet<Record<string, string>>(key, {});
  const res = await cloudGet<Record<string, string>>(teamId, key);
  if (res.ok) {
    const nums = res.value && typeof res.value === "object" ? res.value : {};
    cacheSet(key, nums);
    return nums;
  }
  return cacheGet<Record<string, string>>(key, {});
}

/**
 * Save the full jersey-number map. Callers pass the complete map (loaded
 * cloud-fresh), so this is an authoritative write — allowing a number to be
 * cleared. Reads are cloud-authoritative, so this is safe in normal use.
 */
export async function saveScoutNumbers(teamId: string, sport: string, numbers: Record<string, string>): Promise<void> {
  const key = `scout_numbers_${sport}`;
  cacheSet(key, numbers);
  if (!teamId || teamId === "local-dev") return;
  await cloudPut(teamId, key, numbers);
}

/** Display name with optional jersey number prefix */
export function scoutDisplayName(name: string, numbers?: Record<string, string>): string {
  const num = numbers?.[name];
  return num ? `#${num} ${name}` : name;
}

/** Today's local date as a YYYY-MM-DD string for <input type="date"> defaults */
export function todayDateInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Convert a YYYY-MM-DD date-input value to an ISO string, keeping the current time of day */
export function dateInputToISO(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  const now = new Date();
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

// ── Assigned Charts (stored in team_data) ────────────────────────────────────

export interface AssignedChart {
  id: string;
  sport: string;
  createdBy: string;
  createdAt: string;
  dueDate: string;
  athletes: string[];
  kicks: { distance: number; hash: string; pointValue: number }[];
  reps?: number; // for punt/KO — total number of reps per athlete
  puntTypes?: { type: string; count: number }[]; // punt type breakdown
  koRows?: { typeId: string; typeLabel: string; count: number; hash: string }[]; // KO type breakdown
  completedBy: Record<string, string>;
}

const ASSIGNED_CHARTS_KEY = "assigned_charts";

export async function loadAssignedCharts(teamId: string): Promise<AssignedChart[]> {
  if (!teamId || teamId === "local-dev") {
    try {
      const raw = localStorage.getItem(ASSIGNED_CHARTS_KEY);
      return raw ? JSON.parse(raw) as AssignedChart[] : [];
    } catch { return []; }
  }
  // Always check cloud for assigned charts (they may be assigned from another device)
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data").select("data").eq("team_id", teamId).eq("data_key", ASSIGNED_CHARTS_KEY).single();
    if (error || !data) {
      // Fall back to localStorage if cloud fails
      try { const raw = localStorage.getItem(ASSIGNED_CHARTS_KEY); return raw ? JSON.parse(raw) as AssignedChart[] : []; } catch { return []; }
    }
    const charts = data.data as unknown as AssignedChart[];
    if (Array.isArray(charts)) {
      localStorage.setItem(ASSIGNED_CHARTS_KEY, JSON.stringify(charts));
      return charts;
    }
    return [];
  } catch {
    try { const raw = localStorage.getItem(ASSIGNED_CHARTS_KEY); return raw ? JSON.parse(raw) as AssignedChart[] : []; } catch { return []; }
  }
}

export async function saveAssignedCharts(teamId: string, charts: AssignedChart[]): Promise<void> {
  localStorage.setItem(ASSIGNED_CHARTS_KEY, JSON.stringify(charts));
  if (!teamId || teamId === "local-dev") return;
  try {
    const supabase = createClient();
    await supabase.from("team_data").upsert(
      { team_id: teamId, data_key: ASSIGNED_CHARTS_KEY, data: charts as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
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
