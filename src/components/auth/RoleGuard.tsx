"use client";

import React from "react";
import { useAuth } from "@/lib/auth";

interface RoleGuardProps {
  children: React.ReactNode;
  /** If true, hide element for athletes (show only to coaches) */
  coachOnly?: boolean;
  /** If true, render children but disable them for athletes */
  disableForAthletes?: boolean;
  /** Fallback to render when access is denied */
  fallback?: React.ReactNode;
}

/**
 * Wraps elements that should only be visible/interactive for coaches.
 * - coachOnly: hides the element entirely for athletes
 * - disableForAthletes: renders children wrapped in a non-interactive overlay
 */
export function RoleGuard({
  children,
  coachOnly = false,
  disableForAthletes = false,
  fallback = null,
}: RoleGuardProps) {
  const { isAthlete } = useAuth();

  if (isAthlete && coachOnly) {
    return <>{fallback}</>;
  }

  if (isAthlete && disableForAthletes) {
    return (
      <div className="relative" title="Read-only in athlete mode">
        <div className="pointer-events-none opacity-50 select-none">
          {children}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
