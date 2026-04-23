import { createClient } from "@/lib/supabase";
import { useEffect, useRef } from "react";

export interface StoredMember {
  id: string;
  email: string;
  name: string;
  role: string;
  access: "view" | "edit";
  lastSeen: string;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function upsertMember(teamId: string, member: StoredMember): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase.from("members").upsert(
      {
        id: member.id,
        team_id: teamId,
        email: member.email,
        name: member.name,
        role: member.role,
        access: member.access,
        last_seen: member.lastSeen,
      },
      { onConflict: "team_id,id" }
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[MemberStore] upsertMember failed:", err);
    return false;
  }
}

export async function loadMembers(teamId: string): Promise<StoredMember[]> {
  if (!teamId || teamId === "local-dev") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToMember);
  } catch (err) {
    console.warn("[MemberStore] loadMembers failed:", err);
    return [];
  }
}

export async function updateMemberAccess(
  teamId: string,
  memberId: string,
  access: "view" | "edit"
): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("members")
      .update({ access })
      .eq("team_id", teamId)
      .eq("id", memberId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[MemberStore] updateMemberAccess failed:", err);
    return false;
  }
}

export async function removeMember(teamId: string, memberId: string): Promise<boolean> {
  if (!teamId || teamId === "local-dev") return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("members")
      .delete()
      .eq("team_id", teamId)
      .eq("id", memberId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("[MemberStore] removeMember failed:", err);
    return false;
  }
}

// ─── Realtime sync ───────────────────────────────────────────────────────────

export function useMemberSync(
  teamId: string | null,
  callback: (members: StoredMember[]) => void
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
      const members = await loadMembers(teamId!);
      if (active) cbRef.current(members);
    }

    channel = supabase
      .channel(`members:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "members",
          filter: `team_id=eq.${teamId}`,
        },
        () => reload()
      )
      .subscribe();

    // Fallback poll every 30s
    const intervalId = setInterval(reload, 30000);

    return () => {
      active = false;
      clearInterval(intervalId);
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [teamId]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToMember(row: Record<string, unknown>): StoredMember {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as string,
    access: (row.access as "view" | "edit") ?? "view",
    lastSeen: row.last_seen as string,
  };
}
