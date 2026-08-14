import { createClient } from "@/lib/supabase";
import { useEffect, useRef } from "react";

export interface StoredAthlete {
  id: string;
  name: string;
  /** Optional jersey number — used to match imported (XOS/Thunder) rows to athletes. */
  number?: string;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function insertAthlete(
  teamId: string,
  sport: string,
  name: string
): Promise<StoredAthlete | null> {
  if (!teamId || teamId === "local-dev") return null;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("athletes").upsert(
      {
        id,
        team_id: teamId,
        sport,
        name: name.trim(),
      },
      { onConflict: "team_id,sport,name", ignoreDuplicates: true }
    ).select("id, name");
    if (error) throw error;
    // Return the existing or newly inserted row
    if (data && data.length > 0) return { id: data[0].id, name: data[0].name };
    // If ignoreDuplicates suppressed, load the existing one
    const existing = await loadAthletes(teamId, sport);
    const match = existing.find((a) => a.name === name.trim());
    return match ?? { id, name: name.trim() };
  } catch (err) {
    console.warn("[AthleteStore] insertAthlete failed:", err);
    return null;
  }
}

export async function loadAthletes(
  teamId: string,
  sport: string
): Promise<StoredAthlete[]> {
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    // Prefer selecting the optional jersey `number`; if that column hasn't been
    // added yet, transparently fall back so athlete loading never breaks.
    const withNum = await supabase
      .from("athletes")
      .select("id, name, number")
      .eq("team_id", teamId)
      .eq("sport", sport)
      .order("created_at", { ascending: true });
    let rows: Record<string, unknown>[] | null = withNum.data as Record<string, unknown>[] | null;
    let err = withNum.error;
    if (err) {
      const basic = await supabase
        .from("athletes")
        .select("id, name")
        .eq("team_id", teamId)
        .eq("sport", sport)
        .order("created_at", { ascending: true });
      rows = basic.data as Record<string, unknown>[] | null;
      err = basic.error;
    }
    if (err) throw err;
    return (rows ?? []).map((r) => {
      const num = r.number as string | number | null | undefined;
      return { id: r.id as string, name: r.name as string, number: num != null && num !== "" ? String(num) : undefined };
    });
  } catch (err) {
    console.warn("[AthleteStore] loadAthletes failed:", err);
    return [];
  }
}

/**
 * Set (or clear) an athlete's jersey number. Requires a `number` column on the
 * athletes table; fails softly (logs) if it hasn't been added yet.
 */
export async function setAthleteNumber(teamId: string, athleteId: string, number: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("athletes")
      .update({ number: number.trim() || null })
      .eq("id", athleteId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[AthleteStore] setAthleteNumber failed (has the `number` column been added?):", err);
    return false;
  }
}

export async function removeAthlete(teamId: string, athleteId: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    // Delete by id only — do NOT also filter on team_id. A row whose stored
    // team_id drifted (null/empty/legacy or a different team the user belongs to)
    // would be visible but survive a team-scoped delete, "coming back" on reload.
    // RLS (is_team_member(team_id)) still guarantees the user can only delete
    // rows in their own team(s). `.select()` lets us confirm a row was removed.
    const { data, error } = await supabase
      .from("athletes")
      .delete()
      .eq("id", athleteId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      console.warn("[AthleteStore] removeAthlete deleted 0 rows (id:", athleteId, ") — likely an orphaned/foreign team_id blocked by RLS");
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[AthleteStore] removeAthlete failed:", err);
    return false;
  }
}

// ─── Realtime sync ───────────────────────────────────────────────────────────

const LOCAL_WRITE_GRACE_MS = 5000;
const lastWriteTimestamps: Record<string, number> = {};

export function stampAthleteWrite(teamId: string) {
  lastWriteTimestamps[teamId] = Date.now();
}

export function useAthleteSync(
  teamId: string | null,
  sport: string,
  callback: (athletes: StoredAthlete[]) => void
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!teamId || teamId === "local-dev") return;

    let active = true;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function reload() {
      if (!active) return;
      const last = lastWriteTimestamps[teamId!] ?? 0;
      if (Date.now() - last < LOCAL_WRITE_GRACE_MS) return;
      const athletes = await loadAthletes(teamId!, sport);
      if (active) cbRef.current(athletes);
    }

    channel = supabase
      .channel(`athletes:${teamId}:${sport}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "athletes",
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
          if (!row || row.sport !== sport) return;
          reload();
        }
      )
      .subscribe();

    // Fallback poll every 15s
    const intervalId = setInterval(reload, 15000);

    return () => {
      active = false;
      clearInterval(intervalId);
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [teamId, sport]);
}
