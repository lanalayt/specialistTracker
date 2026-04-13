"use client";

import React, { useState, useCallback, useEffect } from "react";
import { AuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { setTeamId, getTeamId, teamGet, teamSet } from "@/lib/teamData";
import { loadAndApplyTheme, applyTheme, type ThemeColors } from "@/lib/themeColors";
import { useTeamDataSync } from "@/lib/useTeamDataSync";
import { TutorialProvider } from "@/components/ui/Tutorial";
import type { AuthUser, UserRole } from "@/types";

function mapSupabaseUser(supaUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const meta = supaUser.user_metadata ?? {};
  return {
    id: supaUser.id,
    email: supaUser.email ?? "",
    name: (meta.name as string) ?? supaUser.email?.split("@")[0] ?? "",
    role: (meta.role as UserRole) ?? "coach",
    teamId: (meta.teamId as string) ?? undefined,
  };
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  // Apply saved theme colors — re-run whenever user (and thus teamId) resolves
  useEffect(() => {
    loadAndApplyTheme();
  }, [user?.id]);

  // Live-sync theme across devices
  useTeamDataSync<ThemeColors>("theme_colors", (remote) => {
    if (remote && remote.primary && remote.secondary) {
      applyTheme(remote);
      try { localStorage.setItem("st_theme", JSON.stringify(remote)); } catch {}
    }
  }, !!user && user.id !== "local-dev");

  // Auto-register as team member so coaches can see who has access
  useEffect(() => {
    if (!user || user.id === "local-dev") return;
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }
      if (!tid || tid === "local-dev") return;
      const members = await teamGet<{ id: string; email: string; name: string; role: string; lastSeen: string }[]>(tid, "team_members") ?? [];
      const me = { id: user.id, email: user.email, name: user.name, role: user.role, lastSeen: new Date().toISOString() };
      const idx = members.findIndex((m) => m.id === me.id);
      if (idx >= 0) {
        members[idx] = me;
      } else {
        members.push(me);
      }
      teamSet(tid, "team_members", members);
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for auth state changes
  useEffect(() => {
    const isLocal =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = mapSupabaseUser(session.user);
        setUser(u);
        // Coach's team ID is their own user ID; athletes use their linked teamId
        setTeamId(u.role === "athlete" && u.teamId ? u.teamId : u.id);
      } else if (isLocal) {
        // Localhost fallback — auto-login as coach for local dev
        setUser({
          id: "local-dev",
          email: "dev@localhost",
          name: "Coach (Local)",
          role: "coach",
        });
      }
      setIsLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          const u = mapSupabaseUser(session.user);
          setUser(u);
          setTeamId(u.role === "athlete" && u.teamId ? u.teamId : u.id);
        } else {
          setUser(null);
          setTeamId(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = useCallback(async (email: string, password: string, name: string, role: UserRole = "coach", teamId?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role, teamId },
      },
    });
    if (error) throw new Error(error.message);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/login";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setDemoRole = useCallback(
    (role: UserRole) => {
      if (!user) return;
      const updated = { ...user, role };
      setUser(updated);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isCoach: user?.role === "coach",
        isAthlete: user?.role === "athlete",
        signIn,
        signUp,
        signOut,
        setDemoRole,
      }}
    >
      <TutorialProvider>
        {children}
      </TutorialProvider>
    </AuthContext.Provider>
  );
}
