"use client";

import { useContext, createContext, useState, useCallback } from "react";
import type { AuthUser, UserRole } from "@/types";

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isCoach: boolean;
  isAthlete: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDemoRole: (role: UserRole) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isCoach: false,
  isAthlete: false,
  signIn: async () => {},
  signOut: async () => {},
  setDemoRole: () => {},
});

// ─── Demo auth (replace with Amplify when configured) ────────────────────────

export const DEMO_COACH: AuthUser = {
  id: "demo-coach-1",
  email: "coach@demo.com",
  name: "Coach Demo",
  role: "coach",
  teamId: "demo-team-1",
};

export const DEMO_ATHLETE: AuthUser = {
  id: "demo-athlete-1",
  email: "athlete@demo.com",
  name: "Demo Athlete",
  role: "athlete",
  teamId: "demo-team-1",
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function isCoachRole(role?: UserRole): boolean {
  return role === "coach";
}
