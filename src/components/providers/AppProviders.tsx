"use client";

import React, { useState, useCallback, useEffect } from "react";
import { AuthContext, DEMO_COACH } from "@/lib/auth";
import type { AuthUser, UserRole } from "@/types";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage (demo mode — replace with Amplify when configured)
    const raw = localStorage.getItem("st_auth_v1");
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {}
    } else {
      // Auto-login as demo coach for local development
      setUser(DEMO_COACH);
      localStorage.setItem("st_auth_v1", JSON.stringify(DEMO_COACH));
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, _password: string) => {
    // TODO: replace with Amplify Auth.signIn when backend configured
    const u: AuthUser = {
      id: "demo-coach-1",
      email,
      name: email.split("@")[0],
      role: "coach",
      teamId: "demo-team-1",
    };
    setUser(u);
    localStorage.setItem("st_auth_v1", JSON.stringify(u));
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    localStorage.removeItem("st_auth_v1");
  }, []);

  const setDemoRole = useCallback(
    (role: UserRole) => {
      if (!user) return;
      const updated = { ...user, role };
      setUser(updated);
      localStorage.setItem("st_auth_v1", JSON.stringify(updated));
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
        signOut,
        setDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
