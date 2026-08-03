import { createClient } from "@/lib/supabase";

/**
 * Scout Mode data persistence layer.
 * The database is the single source of truth — every concern has its own
 * dedicated table (scout_profiles, scout_athletes, scout_numbers,
 * scout_ranking_groups, scout_session_rankings, assigned_charts,
 * scout_archives, scout_presets). Scout sessions use the existing `sessions`
 * table with SCOUT_* sport values to stay isolated from coach mode.
 *
 * Phase 5: an account is always required, so scout data is DB-only.
 */

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

/** Replace one athlete's entries in a session (for editing a saved chart). */
export async function updateSessionAthleteEntries(teamId: string, sessionId: string, athleteName: string, athleteEntries: Record<string, unknown>[]): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { data } = await supabase.from("sessions").select("entries").eq("team_id", teamId).eq("id", sessionId).single();
    if (!data) return false;
    const all = data.entries as Record<string, unknown>[];
    const sessionMode = (all.find((e) => (e as { chartMode?: string }).chartMode) as { chartMode?: string } | undefined)?.chartMode;
    const others = all.filter((e) => (e as { athlete?: string }).athlete !== athleteName);
    const strip = (e: Record<string, unknown>) => { const { chartMode: _cm, ...rest } = e as { chartMode?: unknown }; return rest as Record<string, unknown>; };
    const merged = [...others, ...athleteEntries].map(strip);
    if (sessionMode != null && merged.length > 0) merged[0] = { ...merged[0], chartMode: sessionMode };
    if (merged.length === 0) {
      await supabase.from("sessions").delete().eq("team_id", teamId).eq("id", sessionId);
    } else {
      await supabase.from("sessions").update({ entries: merged, updated_at: new Date().toISOString() }).eq("team_id", teamId).eq("id", sessionId);
    }
    return true;
  } catch (err) {
    console.warn("[ScoutStore] updateSessionAthleteEntries failed:", err);
    return false;
  }
}

/**
 * Reassign one athlete's chart to a DIFFERENT athlete as its own separate chart.
 * The reps are removed from the source session and placed in a brand-new session
 * owned by the new athlete. The source chart's sport, label, date, weather,
 * chart-mode tag, and ranking group all carry over. Returns the new session id.
 */
export async function reassignAthleteToOwnSession(
  teamId: string,
  sessionId: string,
  oldAthlete: string,
  newAthlete: string,
  newReps: Record<string, unknown>[]
): Promise<string | null> {
  if (!teamId || teamId === "local-dev") return null;
  try {
    const supabase = createClient();
    const { data } = await supabase.from("sessions").select("*").eq("team_id", teamId).eq("id", sessionId).single();
    if (!data) return null;
    const all = (data.entries ?? []) as Record<string, unknown>[];
    const sessionMode = (all.find((e) => (e as { chartMode?: string }).chartMode) as { chartMode?: string } | undefined)?.chartMode;
    const strip = (e: Record<string, unknown>) => { const { chartMode: _cm, ...rest } = e as { chartMode?: unknown }; return rest as Record<string, unknown>; };

    // 1) Remove the old athlete's reps from the source session (delete it if now empty).
    const remaining = all.filter((e) => (e as { athlete?: string }).athlete !== oldAthlete).map(strip);
    if (sessionMode != null && remaining.length > 0) remaining[0] = { ...remaining[0], chartMode: sessionMode };
    if (remaining.length === 0) {
      await supabase.from("sessions").delete().eq("team_id", teamId).eq("id", sessionId);
    } else {
      await supabase.from("sessions").update({ entries: remaining, updated_at: new Date().toISOString() }).eq("team_id", teamId).eq("id", sessionId);
    }

    // 2) Create a new session holding just the moved reps, under the new athlete.
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const moved = newReps.map(strip);
    if (sessionMode != null && moved.length > 0) moved[0] = { ...moved[0], chartMode: sessionMode };
    await supabase.from("sessions").upsert(
      {
        id: newId,
        team_id: teamId,
        sport: data.sport,
        label: data.label,
        date: data.date,
        weather: (data.weather as string) ?? null,
        mode: (data.mode as string) ?? "practice",
        entries: moved,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,id", ignoreDuplicates: true }
    );

    // 3) Give the new chart the same ranking group(s) the old chart had.
    const map = await loadSessionRankings(teamId);
    const pairKey = `${sessionId}|||${oldAthlete}`;
    const carried = map[pairKey] ?? map[sessionId] ?? ["overall"];
    await upsertSessionRanking(teamId, newId, carried);
    await deleteSessionRankingKey(teamId, pairKey);

    return newId;
  } catch (err) {
    console.warn("[ScoutStore] reassignAthleteToOwnSession failed:", err);
    return null;
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

// ── Scout Profiles (scout_profiles table) ────────────────────────────────────

export interface ScoutProfile {
  name: string;
  dob?: string;
  school?: string;
  schoolState?: string;
  schoolYear?: string;
  position?: string;
  /** Disciplines the athlete charts in: "fg" | "kickoff" | "punt" | "snap" */
  disciplines?: string[];
  height?: string;
  weight?: string;
  majorPreference?: string;
  notes?: string;
}

export async function loadScoutProfiles(teamId: string): Promise<Record<string, ScoutProfile>> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("scout_profiles")
      .select("name, profile")
      .eq("team_id", teamId);
    return Object.fromEntries((data ?? []).map((r) => [r.name, r.profile as ScoutProfile]));
  } catch {
    return {};
  }
}

/** Merge the given profiles into the table (adds/updates only — never removes). */
export async function saveScoutProfiles(teamId: string, profiles: Record<string, ScoutProfile>): Promise<void> {
  const supabase = createClient();
  for (const [name, profile] of Object.entries(profiles)) {
    await supabase.from("scout_profiles").upsert(
      { team_id: teamId, name, profile, updated_at: new Date().toISOString() },
      { onConflict: "team_id,name" }
    );
  }
}

export async function deleteScoutProfile(teamId: string, name: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("scout_profiles").delete().eq("team_id", teamId).eq("name", name);
}

// ── Presets (scout_presets table) ────────────────────────────────────────────

export async function loadScoutPreset<T>(teamId: string, key: string): Promise<T | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("scout_presets")
      .select("data")
      .eq("team_id", teamId)
      .eq("preset_key", key)
      .maybeSingle();
    if (data?.data) return data.data as T;
    return null;
  } catch {
    return null;
  }
}

export async function saveScoutPreset<T>(teamId: string, key: string, value: T): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from("scout_presets").upsert(
      {
        team_id: teamId,
        preset_key: key,
        data: value as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,preset_key" }
    );
  } catch {}
}

// ── Scout Athletes (scout_athletes table, per-sport) ─────────────────────────

export async function loadScoutAthletes(teamId: string, sport: string): Promise<string[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("scout_athletes")
      .select("name")
      .eq("team_id", teamId)
      .eq("sport", sport)
      .order("sort_order", { ascending: true });
    return (data ?? []).map((r) => r.name);
  } catch {
    return [];
  }
}

/** Add athletes to a sport list, merging with the current copy (never drops names). */
export async function saveScoutAthletes(teamId: string, sport: string, names: string[]): Promise<void> {
  const supabase = createClient();
  const existing = await loadScoutAthletes(teamId, sport);
  const merged = Array.from(new Set([...existing, ...names]));
  for (let i = 0; i < merged.length; i++) {
    await supabase.from("scout_athletes").upsert(
      { team_id: teamId, sport, name: merged[i], sort_order: i },
      { onConflict: "team_id,sport,name" }
    );
  }
}

/** Remove one athlete from a sport list. */
export async function removeScoutAthlete(teamId: string, sport: string, name: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("scout_athletes").delete().eq("team_id", teamId).eq("sport", sport).eq("name", name);
}

// ── Scout athlete jersey numbers (scout_numbers table) ───────────────────────
// Jersey numbers are shared across ALL disciplines (one team-wide map). The
// `sport` argument is accepted for backwards compatibility but ignored.

export async function loadScoutNumbers(teamId: string, _sport: string): Promise<Record<string, string>> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("scout_numbers")
      .select("name, jersey_number")
      .eq("team_id", teamId);
    return Object.fromEntries((data ?? []).map((r) => [r.name, r.jersey_number]));
  } catch {
    return {};
  }
}

/**
 * Save the full (team-wide) jersey-number map. Authoritative write — a name
 * absent from `numbers` is cleared. Applies across every discipline.
 */
export async function saveScoutNumbers(teamId: string, _sport: string, numbers: Record<string, string>): Promise<void> {
  const supabase = createClient();
  const existing = await loadScoutNumbers(teamId, _sport);
  for (const name of Object.keys(existing)) {
    if (!numbers[name]) {
      await supabase.from("scout_numbers").delete().eq("team_id", teamId).eq("name", name);
    }
  }
  for (const [name, num] of Object.entries(numbers)) {
    if (num) {
      await supabase.from("scout_numbers").upsert(
        { team_id: teamId, name, jersey_number: num, updated_at: new Date().toISOString() },
        { onConflict: "team_id,name" }
      );
    }
  }
}

/** Display name with optional jersey number prefix */
export function scoutDisplayName(name: string, numbers?: Record<string, string>): string {
  const num = numbers?.[name];
  return num ? `#${num} ${name}` : name;
}

/** The scout disciplines an athlete can be charted in. */
export const SCOUT_DISCIPLINES: { key: string; label: string }[] = [
  { key: "fg", label: "FG" },
  { key: "kickoff", label: "Kickoff" },
  { key: "punt", label: "Punt" },
  { key: "snap", label: "Snap" },
];

/**
 * Sync an athlete's discipline (charting) membership.
 */
export async function applyScoutDisciplines(
  teamId: string,
  name: string,
  disciplines: string[],
  removeUnselected: boolean
): Promise<void> {
  for (const d of SCOUT_DISCIPLINES) {
    if (disciplines.includes(d.key)) await saveScoutAthletes(teamId, d.key, [name]);
    else if (removeUnselected) await removeScoutAthlete(teamId, d.key, name);
  }
}

// ── Scout Rankings (scout_ranking_groups table) ──────────────────────────────
// Named groups shared across disciplines. "overall" always exists (default).

export interface ScoutRanking { id: string; name: string; }

const DEFAULT_RANKING: ScoutRanking = { id: "overall", name: "Overall" };

/**
 * Virtual "all charts" ranking. Always shown first, can't be renamed or
 * deleted, displays every chart regardless of group. Never persisted.
 */
export const ALL_RANKING_ID = "__all__";
export const ALL_RANKING: ScoutRanking = { id: ALL_RANKING_ID, name: "Overall" };

export function newRankingId(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function ensureOverall(list: ScoutRanking[]): ScoutRanking[] {
  return list.some((r) => r.id === "overall") ? list : [DEFAULT_RANKING, ...list];
}

export async function loadScoutRankings(teamId: string, _sport?: string): Promise<ScoutRanking[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("scout_ranking_groups")
      .select("ranking_id, name, sort_order")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: true });
    return ensureOverall((data ?? []).map((r) => ({ id: r.ranking_id, name: r.name })));
  } catch {
    return ensureOverall([]);
  }
}

export async function saveScoutRankings(teamId: string, _sport: string, rankings: ScoutRanking[]): Promise<void> {
  const supabase = createClient();
  // Authoritative ordered list: delete all then re-insert.
  await supabase.from("scout_ranking_groups").delete().eq("team_id", teamId);
  for (let i = 0; i < rankings.length; i++) {
    await supabase.from("scout_ranking_groups").upsert(
      { team_id: teamId, ranking_id: rankings[i].id, name: rankings[i].name, sort_order: i },
      { onConflict: "team_id,ranking_id" }
    );
  }
}

// ── Session rankings (scout_session_rankings table) ──────────────────────────
// lookup_key is either a sessionId (session-level assignment) or
// `${sessionId}|||${athlete}` (per-athlete override). Missing = ["overall"].

async function upsertSessionRanking(teamId: string, lookupKey: string, rankingIds: string[]): Promise<void> {
  const supabase = createClient();
  await supabase.from("scout_session_rankings").upsert(
    { team_id: teamId, lookup_key: lookupKey, ranking_ids: rankingIds, updated_at: new Date().toISOString() },
    { onConflict: "team_id,lookup_key" }
  );
}

async function deleteSessionRankingKey(teamId: string, lookupKey: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("scout_session_rankings").delete().eq("team_id", teamId).eq("lookup_key", lookupKey);
}

/** Map of lookup_key -> ranking ids it belongs to (team-wide). Missing = ["overall"]. */
export async function loadSessionRankings(teamId: string): Promise<Record<string, string[]>> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("scout_session_rankings")
      .select("lookup_key, ranking_ids")
      .eq("team_id", teamId);
    return Object.fromEntries((data ?? []).map((r) => [r.lookup_key, r.ranking_ids as string[]]));
  } catch {
    return {};
  }
}

export async function setSessionRankings(teamId: string, sessionId: string, rankingIds: string[]): Promise<void> {
  await upsertSessionRanking(teamId, sessionId, rankingIds);
}

/**
 * Remove a single athlete's chart from one ranking (un-assign) via a per-athlete
 * override (key `sessionId|||athlete`) that takes precedence over the
 * session-level assignment.
 */
export async function removeEntryFromRanking(teamId: string, sessionId: string, athlete: string, rankingId: string): Promise<void> {
  const pairKey = `${sessionId}|||${athlete}`;
  const all = await loadSessionRankings(teamId);
  const cur = all[pairKey] ?? all[sessionId] ?? ["overall"];
  await upsertSessionRanking(teamId, pairKey, cur.filter((r) => r !== rankingId));
}

/**
 * Set the ranking group(s) for a single athlete's chart within a session
 * (per-athlete override, key `sessionId|||athlete`). Empty falls back to Overall.
 */
export async function setEntryRankings(teamId: string, sessionId: string, athlete: string, rankingIds: string[]): Promise<void> {
  const pairKey = `${sessionId}|||${athlete}`;
  const ids = rankingIds.length > 0 ? rankingIds : ["overall"];
  await upsertSessionRanking(teamId, pairKey, ids);
}

/**
 * Move a per-athlete ranking override from one athlete name to another within a
 * session (used when a chart is re-assigned to a renamed athlete).
 */
export async function migrateEntryRanking(teamId: string, sessionId: string, oldAthlete: string, newAthlete: string): Promise<void> {
  if (oldAthlete === newAthlete) return;
  const oldKey = `${sessionId}|||${oldAthlete}`;
  const newKey = `${sessionId}|||${newAthlete}`;
  const all = await loadSessionRankings(teamId);
  if (all[oldKey] !== undefined) {
    await upsertSessionRanking(teamId, newKey, all[oldKey]);
    await deleteSessionRankingKey(teamId, oldKey);
  }
}

/** Remove a session from one ranking only (un-assign). Other rankings keep it. */
export async function removeSessionFromRanking(teamId: string, sessionId: string, rankingId: string): Promise<void> {
  const all = await loadSessionRankings(teamId);
  const cur = all[sessionId] ?? ["overall"];
  await upsertSessionRanking(teamId, sessionId, cur.filter((r) => r !== rankingId));
}

/** Delete a ranking group. Its charts are kept and fall back to Overall. */
export async function deleteScoutRanking(teamId: string, sport: string, rankingId: string): Promise<void> {
  if (rankingId === "overall") return;
  const rankings = await loadScoutRankings(teamId, sport);
  await saveScoutRankings(teamId, sport, rankings.filter((r) => r.id !== rankingId));

  // Reassign every session-ranking row that referenced this group.
  const supabase = createClient();
  const { data } = await supabase
    .from("scout_session_rankings")
    .select("lookup_key, ranking_ids")
    .eq("team_id", teamId)
    .contains("ranking_ids", [rankingId]);
  for (const row of data ?? []) {
    const next = (row.ranking_ids as string[]).filter((r) => r !== rankingId);
    await upsertSessionRanking(teamId, row.lookup_key, next.length > 0 ? next : ["overall"]);
  }
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

// ── Assigned Charts (assigned_charts table) ──────────────────────────────────

export interface AssignedChart {
  id: string;
  sport: string;
  createdBy: string;
  createdAt: string;
  dueDate: string;
  athletes: string[];
  kicks: { distance: number; hash: string; pointValue: number }[];
  reps?: number;
  puntTypes?: { type: string; count: number }[];
  koRows?: { typeId: string; typeLabel: string; count: number; hash: string }[];
  completedBy: Record<string, string>;
}

export async function loadAssignedCharts(teamId: string): Promise<AssignedChart[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("assigned_charts")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => {
      const config = (r.config ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        sport: r.sport,
        createdBy: r.created_by,
        createdAt: r.created_at,
        dueDate: r.due_date ?? "",
        athletes: r.athletes ?? [],
        kicks: (config.kicks as AssignedChart["kicks"]) ?? [],
        reps: config.reps as number | undefined,
        puntTypes: config.puntTypes as AssignedChart["puntTypes"] | undefined,
        koRows: config.koRows as AssignedChart["koRows"] | undefined,
        completedBy: (r.completed_by ?? {}) as Record<string, string>,
      };
    });
  } catch {
    return [];
  }
}

export async function saveAssignedCharts(teamId: string, charts: AssignedChart[]): Promise<void> {
  const supabase = createClient();
  // Authoritative array: delete all then re-insert.
  await supabase.from("assigned_charts").delete().eq("team_id", teamId);
  for (const c of charts) {
    await supabase.from("assigned_charts").upsert(
      {
        team_id: teamId,
        id: c.id,
        sport: c.sport,
        created_by: c.createdBy,
        created_at: c.createdAt,
        due_date: c.dueDate || null,
        athletes: c.athletes,
        config: { kicks: c.kicks, reps: c.reps, puntTypes: c.puntTypes, koRows: c.koRows },
        completed_by: c.completedBy,
      },
      { onConflict: "team_id,id" }
    );
  }
}

// ── Scout Archives (scout_archives table) ────────────────────────────────────

export interface ScoutArchive {
  id: string;
  name: string;
  createdAt: string;
  fg: ScoutSession[];
  punt: ScoutSession[];
  kickoff: ScoutSession[];
  snap: ScoutSession[];
}

export async function loadScoutArchives(teamId: string): Promise<ScoutArchive[]> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("scout_archives")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      fg: (r.fg ?? []) as ScoutSession[],
      punt: (r.punt ?? []) as ScoutSession[],
      kickoff: (r.kickoff ?? []) as ScoutSession[],
      snap: (r.snap ?? []) as ScoutSession[],
    }));
  } catch {
    return [];
  }
}

export async function saveScoutArchives(teamId: string, archives: ScoutArchive[]): Promise<void> {
  const supabase = createClient();
  await supabase.from("scout_archives").delete().eq("team_id", teamId);
  for (const a of archives) {
    await supabase.from("scout_archives").upsert(
      {
        team_id: teamId,
        id: a.id,
        name: a.name,
        created_at: a.createdAt,
        fg: a.fg,
        punt: a.punt,
        kickoff: a.kickoff,
        snap: a.snap,
      },
      { onConflict: "team_id,id" }
    );
  }
}
