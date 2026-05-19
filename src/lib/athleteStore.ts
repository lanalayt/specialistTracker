import { createClient } from "@/lib/supabase";
import { useEffect, useRef } from "react";

export interface StoredAthlete {
  id: string;
  name: string;
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
    const { data, error } = await supabase
      .from("athletes")
      .select("id, name")
      .eq("team_id", teamId)
      .eq("sport", sport)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }));
  } catch (err) {
    console.warn("[AthleteStore] loadAthletes failed:", err);
    return [];
  }
}

export async function removeAthlete(teamId: string, athleteId: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("athletes")
      .delete()
      .eq("team_id", teamId)
      .eq("id", athleteId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[AthleteStore] removeAthlete failed:", err);
    return false;
  }
}

// ─── Sync team → athlete mode ────────────────────────────────────────────────

const ATHLETE_PAIRS: [string, string][] = [
  ["KICKING", "ATHLETE_KICKING"], ["PUNTING", "ATHLETE_PUNTING"],
  ["KICKOFF", "ATHLETE_KICKOFF"], ["LONGSNAP", "ATHLETE_LONGSNAP"],
];

export async function syncAthleteKeys(teamId: string): Promise<void> {
  if (!teamId || teamId === "local-dev") return;
  const supabase = createClient();
  for (const [team, athlete] of ATHLETE_PAIRS) {
    const teamList = await loadAthletes(teamId, team);
    const athleteList = await loadAthletes(teamId, athlete);
    const teamNames = new Set(teamList.map((a) => a.name));
    const athleteNames = new Set(athleteList.map((a) => a.name));
    // Add missing
    for (const a of teamList) {
      if (!athleteNames.has(a.name)) await insertAthlete(teamId, athlete, a.name);
    }
    // Remove stale — delete directly by name to avoid silent failures
    for (const a of athleteList) {
      if (!teamNames.has(a.name)) {
        try {
          await supabase.from("athletes").delete().eq("team_id", teamId).eq("sport", athlete).eq("name", a.name);
        } catch {}
      }
    }
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
