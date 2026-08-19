import { createClient } from "@/lib/supabase";

// A single split, captured each time the Lap button is pressed.
export interface StopwatchLap {
  n: number; // 1-based lap number
  splitMs: number; // elapsed since the run started
  lapMs: number; // elapsed since the previous lap (or the start)
}

export interface StopwatchRun {
  id: string;
  userId?: string | null;
  label?: string | null;
  startedAt: string; // ISO
  stoppedAt?: string | null; // ISO
  totalMs: number;
  laps: StopwatchLap[];
}

function rowToRun(row: Record<string, unknown>): StopwatchRun {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    label: (row.label as string) ?? null,
    startedAt: row.started_at as string,
    stoppedAt: (row.stopped_at as string) ?? null,
    totalMs: Number(row.total_ms ?? 0),
    laps: (row.laps as StopwatchLap[]) ?? [],
  };
}

/** Save a finished run. Returns false when there's no team (e.g. local dev). */
export async function saveStopwatchRun(teamId: string, run: StopwatchRun): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase.from("stopwatch_runs").upsert(
      {
        team_id: teamId,
        id: run.id,
        user_id: run.userId ?? null,
        label: run.label ?? null,
        started_at: run.startedAt,
        stopped_at: run.stoppedAt ?? null,
        total_ms: run.totalMs,
        laps: run.laps,
      },
      { onConflict: "team_id,id" }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[StopwatchStore] saveStopwatchRun failed:", err);
    return false;
  }
}

/** Most recent runs for the team, newest first. */
export async function loadStopwatchRuns(teamId: string, limit = 10): Promise<StopwatchRun[]> {
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("stopwatch_runs")
      .select("*")
      .eq("team_id", teamId)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(rowToRun);
  } catch (err) {
    console.warn("[StopwatchStore] loadStopwatchRuns failed:", err);
    return [];
  }
}

export async function deleteStopwatchRun(teamId: string, id: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("stopwatch_runs")
      .delete()
      .eq("team_id", teamId)
      .eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[StopwatchStore] deleteStopwatchRun failed:", err);
    return false;
  }
}
