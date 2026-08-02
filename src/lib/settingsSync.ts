import { createClient } from "@/lib/supabase";

// Map localStorage keys to sport identifiers in user_settings table
const SPORT_MAP: Record<string, string> = {
  fgSettings: "fg",
  puntSettings: "punt",
  kickoffSettings: "kickoff",
  snapSettings: "snap",
};

function getSport(localKey: string): string | null {
  return SPORT_MAP[localKey] ?? null;
}

/**
 * Load a settings object from user_settings table first, falling back to localStorage.
 */
export async function loadSettingsFromCloud<T>(localKey: string): Promise<T | null> {
  const sport = getSport(localKey);
  if (sport) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("user_settings")
          .select("settings")
          .eq("user_id", user.id)
          .eq("sport", sport)
          .maybeSingle();
        if (data?.settings) return data.settings as T;
      }
    } catch {}
  }

  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(localKey);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

/**
 * Save a settings object to both localStorage and user_settings table.
 */
export function saveSettingsToCloud<T>(localKey: string, data: T): void {
  // Always write to localStorage
  localStorage.setItem(localKey, JSON.stringify(data));

  // Also sync to user_settings table
  const sport = getSport(localKey);
  if (sport) {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        await supabase.from("user_settings").upsert(
          {
            user_id: user.id,
            sport,
            settings: data as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,sport" }
        );
      }
    }).catch(() => {});
  }

  // Notify any open session pages that settings changed
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("settingsChanged"));
  }
}
