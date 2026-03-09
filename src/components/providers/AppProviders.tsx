"use client";

import React, { useState, useCallback, useEffect } from "react";
import { AuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
      }
      setIsLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(mapSupabaseUser(session.user));
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = useCallback(async (email: string, password: string, name: string, role: UserRole = "coach") => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role },
      },
    });
    if (error) throw new Error(error.message);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
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
