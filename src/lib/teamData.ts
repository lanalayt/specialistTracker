import { createClient } from "@/lib/supabase";

// ─── Team-shared cloud persistence ─────────────────────────────────────────

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 500;

/**
 * Get the team ID for the current user.
 * Coaches: their user ID IS the team ID.
 * Athletes: stored in user metadata as teamId.
 */
let _teamId: string | null = null;

export function setTeamId(teamId: string | null) {
  _teamId = teamId;
}

export function getTeamId(): string | null {
  return _teamId;
}

/** Read from team_data table */
export async function teamGet<T>(teamId: string, dataKey: string): Promise<T | null> {
  if (!teamId || teamId === "local-dev") return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data")
      .select("data")
      .eq("team_id", teamId)
      .eq("data_key", dataKey)
      .single();

    if (error || !data) return null;
    return data.data as T;
  } catch {
    return null;
  }
}

/** Read with timestamp (for polling) */
export async function teamGetWithTimestamp<T>(
  teamId: string,
  dataKey: string
): Promise<{ data: T; updatedAt: string } | null> {
  if (!teamId || teamId === "local-dev") return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("team_data")
      .select("data, updated_at")
      .eq("team_id", teamId)
      .eq("data_key", dataKey)
      .single();

    if (error || !data) return null;
    return { data: data.data as T, updatedAt: data.updated_at as string };
  } catch {
    return null;
  }
}

/** Write to team_data (debounced) */
export function teamSet<T>(teamId: string, dataKey: string, value: T): void {
  if (!teamId || teamId === "local-dev") return;

  const timerKey = `team:${teamId}:${dataKey}`;
  if (debounceTimers[timerKey]) {
    clearTimeout(debounceTimers[timerKey]);
  }

  debounceTimers[timerKey] = setTimeout(async () => {
    try {
      const supabase = createClient();
      await supabase
        .from("team_data")
        .upsert(
          {
            team_id: teamId,
            data_key: dataKey,
            data: value as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "team_id,data_key" }
        );
    } catch (err) {
      console.warn("[TeamSync] Failed to save:", err);
    }
  }, DEBOUNCE_MS);
}

/** Write immediately (no debounce) */
export async function teamSetImmediate<T>(teamId: string, dataKey: string, value: T): Promise<void> {
  if (!teamId || teamId === "local-dev") return;

  const timerKey = `team:${teamId}:${dataKey}`;
  if (debounceTimers[timerKey]) {
    clearTimeout(debounceTimers[timerKey]);
  }

  try {
    const supabase = createClient();
    await supabase
      .from("team_data")
      .upsert(
        {
          team_id: teamId,
          data_key: dataKey,
          data: value as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,data_key" }
      );
  } catch (err) {
    console.warn("[TeamSync] Failed to save:", err);
  }
}
