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
