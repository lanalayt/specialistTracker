import { createClient } from "@/lib/supabase";

// ─── Team-shared cloud persistence ─────────────────────────────────────────

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const pendingWrites: Record<string, { teamId: string; dataKey: string; value: unknown }> = {};
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

// Track last write timestamp per key — set IMMEDIATELY on teamSet, not after async write.
// This ensures the grace period in useTeamDataSync covers the full debounce window.
const lastWriteTimestamp: Record<string, number> = {};
export function getLastWriteTimestamp(teamId: string, dataKey: string): number {
  return lastWriteTimestamp[`${teamId}:${dataKey}`] ?? 0;
}

function stampWrite(teamId: string, dataKey: string) {
  lastWriteTimestamp[`${teamId}:${dataKey}`] = Date.now();
}

async function writeWithRetry<T>(teamId: string, dataKey: string, value: T, attempt = 0): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase
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
    if (error) throw error;
    // Refresh timestamp after successful write too
    stampWrite(teamId, dataKey);
    // Clear from pending
    delete pendingWrites[`team:${teamId}:${dataKey}`];
    return true;
  } catch (err) {
    if (attempt < 2) {
      // Retry up to 2 times with backoff
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return writeWithRetry(teamId, dataKey, value, attempt + 1);
    }
    console.warn(`[TeamSync] Failed to save ${dataKey} after retries:`, err);
    return false;
  }
}

/** Write to team_data (debounced with retry) */
export function teamSet<T>(teamId: string, dataKey: string, value: T): void {
  if (!teamId || teamId === "local-dev") return;

  // Stamp IMMEDIATELY so grace period is active during the debounce window
  stampWrite(teamId, dataKey);

  const timerKey = `team:${teamId}:${dataKey}`;
  if (debounceTimers[timerKey]) {
    clearTimeout(debounceTimers[timerKey]);
  }

  // Track the pending write so it can be flushed on tab close
  pendingWrites[timerKey] = { teamId, dataKey, value };

  debounceTimers[timerKey] = setTimeout(() => {
    writeWithRetry(teamId, dataKey, value);
  }, DEBOUNCE_MS);
}

/** Write immediately (no debounce, with retry) */
export async function teamSetImmediate<T>(teamId: string, dataKey: string, value: T): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;

  // Stamp immediately
  stampWrite(teamId, dataKey);

  const timerKey = `team:${teamId}:${dataKey}`;
  if (debounceTimers[timerKey]) {
    clearTimeout(debounceTimers[timerKey]);
  }
  delete pendingWrites[timerKey];

  return writeWithRetry(teamId, dataKey, value);
}

// ─── Flush pending writes on tab close ──────────────────────────────────────
// Uses fetch with keepalive to ensure debounced writes reach the server even
// when the tab is closing. Prevents data loss from writes still in the debounce window.

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    for (const key of Object.keys(pendingWrites)) {
      const { teamId, dataKey, value } = pendingWrites[key];
      if (debounceTimers[key]) {
        clearTimeout(debounceTimers[key]);
        delete debounceTimers[key];
      }
      try {
        fetch(`${supabaseUrl}/rest/v1/team_data?on_conflict=team_id,data_key`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Prefer": "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            team_id: teamId,
            data_key: dataKey,
            data: value,
            updated_at: new Date().toISOString(),
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Best effort — localStorage still has the data as backup
      }
      delete pendingWrites[key];
    }
  });
}
