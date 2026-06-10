"use client";

import { useEffect } from "react";

/**
 * In-progress chart draft persistence (per browser tab).
 *
 * Charting state lives only in React memory, so a refresh/crash loses it. We
 * mirror the live charting state to sessionStorage so a reload can restore it.
 * sessionStorage survives refreshes but clears when the tab closes, so drafts
 * don't linger forever. The team id is stored in the payload and verified on
 * restore so one account can't pick up another's draft on a shared tab.
 */

export function chartDraftKey(sport: string, mode = "default"): string {
  return `scout_chart_draft_${sport}_${mode}`;
}

export function readChartDraft<T extends { teamId?: string | null }>(key: string, teamId: string | null): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as T;
    if (draft.teamId && teamId && draft.teamId !== teamId) return null; // different account
    return draft;
  } catch {
    return null;
  }
}

export function clearChartDraft(key: string): void {
  try { sessionStorage.removeItem(key); } catch {}
}

/** True when the page got here via a browser refresh (vs. normal navigation). */
export function isPageReload(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === "reload";
  } catch {
    return false;
  }
}

/** Writes `value` to sessionStorage whenever it changes while `enabled`. */
export function useChartDraft(key: string, value: unknown, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value, enabled]);
}
