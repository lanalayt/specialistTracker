"use client";

import { useContext, createContext } from "react";
import type { AuthUser, UserRole } from "@/types";

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isCoach: boolean;
  isAthlete: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  setDemoRole: (role: UserRole) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isCoach: false,
  isAthlete: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  setDemoRole: () => {},
});

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
