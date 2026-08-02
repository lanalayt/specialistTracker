import { createClient } from "@/lib/supabase";
import { getTeamId } from "@/lib/teamData";

const DEBOUNCE_MS = 500;
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const pendingWrites: Record<string, { teamId: string; draftKey: string; data: unknown }> = {};

/** Load a draft from the session_drafts table. */
export async function loadDraft<T>(teamId: string, draftKey: string): Promise<T | null> {
  if (!teamId || teamId === "local-dev") return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_drafts")
      .select("data")
      .eq("team_id", teamId)
      .eq("draft_key", draftKey)
      .maybeSingle();
    if (data?.data) return data.data as T;
    return null;
  } catch {
    return null;
  }
}

/** Save a draft (debounced). */
export function saveDraft<T>(teamId: string, draftKey: string, data: T): void {
  if (!teamId || teamId === "local-dev") return;

  const timerKey = `draft:${teamId}:${draftKey}`;
  if (debounceTimers[timerKey]) clearTimeout(debounceTimers[timerKey]);

  pendingWrites[timerKey] = { teamId, draftKey, data };

  debounceTimers[timerKey] = setTimeout(async () => {
    try {
      const supabase = createClient();
      await supabase.from("session_drafts").upsert(
        {
          team_id: teamId,
          draft_key: draftKey,
          data: data as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id,draft_key" }
      );
    } catch (err) {
      console.warn("[DraftStore] Failed to save draft:", err);
    }
    delete pendingWrites[timerKey];
  }, DEBOUNCE_MS);
}

/** Clear a draft (delete from table). */
export async function clearDraft(teamId: string, draftKey: string): Promise<void> {
  if (!teamId || teamId === "local-dev") return;

  const timerKey = `draft:${teamId}:${draftKey}`;
  if (debounceTimers[timerKey]) {
    clearTimeout(debounceTimers[timerKey]);
    delete debounceTimers[timerKey];
  }
  delete pendingWrites[timerKey];

  try {
    const supabase = createClient();
    await supabase
      .from("session_drafts")
      .delete()
      .eq("team_id", teamId)
      .eq("draft_key", draftKey);
  } catch {}
}

// Flush pending writes on tab close
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    for (const key of Object.keys(pendingWrites)) {
      const { teamId, draftKey, data } = pendingWrites[key];
      if (debounceTimers[key]) {
        clearTimeout(debounceTimers[key]);
        delete debounceTimers[key];
      }
      try {
        fetch(`${supabaseUrl}/rest/v1/session_drafts?on_conflict=team_id,draft_key`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Prefer": "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            team_id: teamId,
            draft_key: draftKey,
            data,
            updated_at: new Date().toISOString(),
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
      delete pendingWrites[key];
    }
  });
}
