"use client";

import { useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadDraft, saveDraft, clearDraft } from "@/lib/draftStore";

/**
 * In-progress scout-chart draft persistence.
 *
 * Charting state lives in React memory; we mirror it to the `session_drafts`
 * table (via draftStore) so a refresh/crash can restore it — and, unlike the
 * old sessionStorage approach, recovery now works cross-device. The table is
 * keyed by team_id, so one account never picks up another team's draft.
 */

export function chartDraftKey(sport: string, mode = "default"): string {
  return `scout_chart_${sport}_${mode}`;
}

export async function readChartDraft<T>(key: string, teamId: string | null): Promise<T | null> {
  if (!teamId || teamId === "local-dev") return null;
  return loadDraft<T>(teamId, key);
}

export function clearChartDraft(key: string, teamId?: string | null): void {
  const tid = teamId ?? getTeamId();
  if (tid && tid !== "local-dev") clearDraft(tid, key);
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

/** Persists `value` to session_drafts (debounced) whenever it changes while `enabled`. */
export function useChartDraft(key: string, value: unknown, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const tid = getTeamId();
    if (tid && tid !== "local-dev") saveDraft(tid, key, value);
  }, [key, value, enabled]);
}
