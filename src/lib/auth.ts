"use client";

import { useContext, createContext } from "react";
import type { AuthUser, UserRole } from "@/types";

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  isCoach: boolean;
  isAthlete: boolean;
  /** True for coaches and athletes with edit access */
  canEdit: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves to true when email confirmation is required (no session yet). */
  signUp: (email: string, password: string, name: string, role?: UserRole, teamId?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  setDemoRole: (role: UserRole) => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAdmin: false,
  isCoach: false,
  isAthlete: false,
  canEdit: false,
  signIn: async () => {},
  signUp: async () => false,
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
  return role === "coach" || role === "admin";
}
