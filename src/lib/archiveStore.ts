import { createClient } from "@/lib/supabase";
import type { AthleteStats, PuntAthleteStats, KickoffAthleteStats, StatScope } from "@/types";

export interface StoredArchive {
  id: string;
  name: string;
  createdAt: string;
  /** Practice sessions, game sessions, or both. Defaults to "all". */
  scope: StatScope;
  fg: Record<string, unknown>;
  punt: Record<string, unknown>;
  kickoff: Record<string, unknown>;
}

function isScope(v: unknown): v is StatScope {
  return v === "all" || v === "practice" || v === "game";
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function insertArchive(teamId: string, archive: StoredArchive): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const row = {
      id: archive.id,
      team_id: teamId,
      name: archive.name,
      created_at: archive.createdAt,
      fg: archive.fg,
      punt: archive.punt,
      kickoff: archive.kickoff,
    };
    const withScope = await supabase.from("archives").insert({ ...row, scope: archive.scope });
    let error = withScope.error;
    if (error) {
      // The scope column arrives with supabase-archive-scope.sql. Until that
      // has been run, save the archive anyway — the scope also rides along
      // inside the phase JSON, so it still reads back correctly.
      const basic = await supabase.from("archives").insert(row);
      error = basic.error;
    }
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[ArchiveStore] insertArchive failed:", err);
    return false;
  }
}

export async function loadArchives(teamId: string): Promise<StoredArchive[]> {
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("archives")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToArchive);
  } catch (err) {
    console.warn("[ArchiveStore] loadArchives failed:", err);
    return [];
  }
}

export async function deleteArchive(teamId: string, archiveId: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("archives")
      .delete()
      .eq("team_id", teamId)
      .eq("id", archiveId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[ArchiveStore] deleteArchive failed:", err);
    return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToArchive(row: Record<string, unknown>): StoredArchive {
  const fg = (row.fg as Record<string, unknown>) ?? {};
  const punt = (row.punt as Record<string, unknown>) ?? {};
  const kickoff = (row.kickoff as Record<string, unknown>) ?? {};
  // Prefer the column; fall back to the copy inside the phase JSON for rows
  // written before the column existed. Anything older covered everything.
  const scope = [row.scope, fg.scope, punt.scope, kickoff.scope].find(isScope) ?? "all";
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    scope,
    fg,
    punt,
    kickoff,
  };
}
