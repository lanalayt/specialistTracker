import { createClient } from "@/lib/supabase";
import type { AthleteStats, PuntAthleteStats, KickoffAthleteStats } from "@/types";

export interface StoredArchive {
  id: string;
  name: string;
  createdAt: string;
  fg: Record<string, unknown>;
  punt: Record<string, unknown>;
  kickoff: Record<string, unknown>;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function insertArchive(teamId: string, archive: StoredArchive): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase.from("archives").insert({
      id: archive.id,
      team_id: teamId,
      name: archive.name,
      created_at: archive.createdAt,
      fg: archive.fg,
      punt: archive.punt,
      kickoff: archive.kickoff,
    });
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
  return {
    id: row.id as string,
    name: row.name as string,
    createdAt: row.created_at as string,
    fg: (row.fg as Record<string, unknown>) ?? {},
    punt: (row.punt as Record<string, unknown>) ?? {},
    kickoff: (row.kickoff as Record<string, unknown>) ?? {},
  };
}
