"use client";

import { createContext, useContext } from "react";
import type { TeamSettings } from "@/lib/teamSettingsTypes";

export interface Bootstrap {
  team: TeamSettings | null;
  /** Per-user settings keyed by local key (fgSettings, snapSettings, ...). */
  settings: Record<string, unknown>;
}

// Carries the server-resolved bootstrap through React context so client
// components render the correct team/settings values during the SERVER render
// (and the matching first client render) — no flash, no hydration mismatch.
// Module-level caches (teamSettingsStore / settingsSync) can't hold per-request
// data on the server, so context is the source of truth for the initial render.
const BootstrapContext = createContext<Bootstrap | null>(null);

export const BootstrapProvider = BootstrapContext.Provider;

export function useBootstrap(): Bootstrap | null {
  return useContext(BootstrapContext);
}
