"use client";

import React, { useState, useCallback, useEffect } from "react";
import { AuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { setTeamId } from "@/lib/teamData";
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    console.log("[auth] signIn result:", { user: data?.user?.id, session: !!data?.session, error: error?.message });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error("No session returned from sign in");
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
      {children}
    </AuthContext.Provider>
  );
}
