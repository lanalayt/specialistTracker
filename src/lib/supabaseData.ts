import { createClient } from "@/lib/supabase";

// ─── Cloud persistence (Supabase) ─────────────────────────────────────────────

// Debounce timers per key to avoid hammering the DB
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 500;

/**
 * Load data from Supabase for a given user + key.
 * Returns null if not found or on error.
 */
export async function cloudGet<T>(userId: string, dataKey: string): Promise<T | null> {
  if (userId === "local-dev") return null; // skip for local dev
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_data")
      .select("data")
      .eq("user_id", userId)
      .eq("data_key", dataKey)
      .single();

    if (error || !data) return null;
    return data.data as T;
  } catch {
    return null;
  }
}

/**
 * Save data to Supabase for a given user + key.
 * Uses upsert so it works for both insert and update.
 * Debounced to avoid excessive writes.
 */
export function cloudSet<T>(userId: string, dataKey: string, value: T): void {
  if (userId === "local-dev") return; // skip for local dev

  // Clear any pending debounce for this key
  const timerKey = `${userId}:${dataKey}`;
  if (debounceTimers[timerKey]) {
    clearTimeout(debounceTimers[timerKey]);
  }

  debounceTimers[timerKey] = setTimeout(async () => {
    try {
      const supabase = createClient();
      await supabase
        .from("user_data")
        .upsert(
          {
            user_id: userId,
            data_key: dataKey,
            data: value as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,data_key" }
        );
    } catch (err) {
      console.warn("[CloudSync] Failed to save to Supabase:", err);
    }
  }, DEBOUNCE_MS);
}

/**
 * Load data + updated_at timestamp from Supabase.
 * Used for polling to detect remote changes.
 */
export async function cloudGetWithTimestamp<T>(
  userId: string,
  dataKey: string
): Promise<{ data: T; updatedAt: string } | null> {
  if (userId === "local-dev") return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_data")
      .select("data, updated_at")
      .eq("user_id", userId)
      .eq("data_key", dataKey)
      .single();

    if (error || !data) return null;
    return { data: data.data as T, updatedAt: data.updated_at as string };
  } catch {
    return null;
  }
}

/**
 * Immediately save data to Supabase (no debounce).
 * Use this for critical saves like committing a session.
 */
export async function cloudSetImmediate<T>(userId: string, dataKey: string, value: T): Promise<void> {
  if (userId === "local-dev") return;

  // Clear any pending debounce for this key
  const timerKey = `${userId}:${dataKey}`;
  if (debounceTimers[timerKey]) {
    clearTimeout(debounceTimers[timerKey]);
  }

  try {
    const supabase = createClient();
    await supabase
      .from("user_data")
      .upsert(
        {
          user_id: userId,
          data_key: dataKey,
          data: value as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,data_key" }
      );
  } catch (err) {
    console.warn("[CloudSync] Failed to save to Supabase:", err);
  }
}
