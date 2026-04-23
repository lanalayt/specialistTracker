import { createClient } from "@/lib/supabase";
import { getTeamId } from "@/lib/teamData";
import type { Session } from "@/types";
import { useEffect, useRef } from "react";

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function insertSession(teamId: string, session: Session): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase.from("sessions").upsert(
      {
        id: session.id,
        team_id: teamId,
        sport: session.sport,
        label: session.label,
        date: session.date,
        weather: session.weather ?? null,
        mode: session.mode ?? "practice",
        opponent: session.opponent ?? null,
        game_time: session.gameTime ?? null,
        entries: session.entries ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,id", ignoreDuplicates: true }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[SessionStore] insertSession failed:", err);
    return false;
  }
}

export async function loadSessions(
  teamId: string,
  sport: string
): Promise<Session[]> {
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("team_id", teamId)
      .eq("sport", sport)
      .is("deleted_at", null)
      .order("date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToSession);
  } catch (err) {
    console.warn("[SessionStore] loadSessions failed:", err);
    return [];
  }
}

export async function loadDeletedSessions(teamId: string): Promise<(Session & { deletedAt: string })[]> {
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("team_id", teamId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", cutoff)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...rowToSession(row),
      deletedAt: row.deleted_at as string,
    }));
  } catch (err) {
    console.warn("[SessionStore] loadDeletedSessions failed:", err);
    return [];
  }
}

export async function updateSession(
  teamId: string,
  sessionId: string,
  updates: Partial<Pick<Session, "label" | "date" | "weather" | "entries" | "opponent" | "gameTime">>
): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.label !== undefined) row.label = updates.label;
    if (updates.date !== undefined) row.date = updates.date;
    if (updates.weather !== undefined) row.weather = updates.weather || null;
    if (updates.entries !== undefined) row.entries = updates.entries;
    if (updates.opponent !== undefined) row.opponent = updates.opponent || null;
    if (updates.gameTime !== undefined) row.game_time = updates.gameTime || null;
    const { error } = await supabase
      .from("sessions")
      .update(row)
      .eq("team_id", teamId)
      .eq("id", sessionId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[SessionStore] updateSession failed:", err);
    return false;
  }
}

export async function softDeleteSession(teamId: string, sessionId: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("sessions")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("id", sessionId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[SessionStore] softDeleteSession failed:", err);
    return false;
  }
}

export async function restoreSession(teamId: string, sessionId: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("sessions")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("id", sessionId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[SessionStore] restoreSession failed:", err);
    return false;
  }
}

export async function hardDeleteExpired(teamId: string): Promise<void> {
  if (!teamId || teamId === "local-dev") return;
  try {
    const supabase = createClient();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("sessions")
      .delete()
      .eq("team_id", teamId)
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff);
  } catch (err) {
    console.warn("[SessionStore] hardDeleteExpired failed:", err);
  }
}

export async function hardDeleteSession(teamId: string, sessionId: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("team_id", teamId)
      .eq("id", sessionId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[SessionStore] hardDeleteSession failed:", err);
    return false;
  }
}

// ─── Realtime sync ───────────────────────────────────────────────────────────

const FALLBACK_POLL_MS = 15000;
const LOCAL_WRITE_GRACE_MS = 8000;

// Track local writes to avoid echo
const lastWriteTimestamps: Record<string, number> = {};

export function stampSessionWrite(teamId: string) {
  lastWriteTimestamps[teamId] = Date.now();
}

interface SessionSyncCallbacks {
  onInsert: (session: Session) => void;
  onUpdate: (session: Session) => void;
  onDelete: (sessionId: string) => void;
  onRestore: (session: Session) => void;
}

export function useSessionSync(
  teamId: string | null,
  sport: string,
  callbacks: SessionSyncCallbacks
) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!teamId || teamId === "local-dev") return;

    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastPollTime = new Date().toISOString();
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function isGracePeriod() {
      const last = lastWriteTimestamps[teamId!] ?? 0;
      return Date.now() - last < LOCAL_WRITE_GRACE_MS;
    }

    // Handle realtime payload
    function handlePayload(payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
      if (!active || isGracePeriod()) return;
      const row = (payload.new ?? payload.old) as Record<string, unknown> | null;
      if (!row || row.sport !== sport) return;

      const session = rowToSession(row);

      if (payload.eventType === "INSERT") {
        cbRef.current.onInsert(session);
      } else if (payload.eventType === "UPDATE") {
        if (row.deleted_at && !(payload.old as Record<string, unknown> | undefined)?.deleted_at) {
          cbRef.current.onDelete(session.id);
        } else if (!row.deleted_at && (payload.old as Record<string, unknown> | undefined)?.deleted_at) {
          cbRef.current.onRestore(session);
        } else {
          cbRef.current.onUpdate(session);
        }
      } else if (payload.eventType === "DELETE") {
        cbRef.current.onDelete(row.id as string);
      }
    }

    // Fallback polling — reload all sessions for this sport
    async function poll() {
      if (!active || isGracePeriod()) return;
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("*")
          .eq("team_id", teamId!)
          .eq("sport", sport)
          .is("deleted_at", null)
          .gt("updated_at", lastPollTime)
          .order("date", { ascending: true });
        if (error || !data || !active) return;
        lastPollTime = new Date().toISOString();
        for (const row of data) {
          cbRef.current.onUpdate(rowToSession(row));
        }
      } catch { /* ignore */ }
    }

    // Subscribe to realtime
    channel = supabase
      .channel(`sessions:${teamId}:${sport}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => handlePayload(payload as unknown as { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> })
      )
      .subscribe();

    intervalId = setInterval(poll, FALLBACK_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [teamId, sport]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    sport: row.sport as Session["sport"],
    label: row.label as string,
    date: row.date as string,
    weather: (row.weather as string) ?? undefined,
    mode: (row.mode as Session["mode"]) ?? "practice",
    opponent: (row.opponent as string) ?? undefined,
    gameTime: (row.game_time as string) ?? undefined,
    entries: (row.entries as Session["entries"]) ?? [],
  };
}
