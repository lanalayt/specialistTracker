"use client";

import React, { createContext, useContext, useRef } from "react";

/**
 * In-memory handoff for the coach "Chart Now" flow: a coaches-chart page stashes
 * the chart setup, then navigates (client-side) to the athlete-chart page which
 * takes it once. Survives client navigation (same React tree) but intentionally
 * does NOT persist — a full reload should not carry a pending chart. Replaces the
 * old coach_*_chart_now localStorage keys (no client storage).
 */
export type PendingChartKey = "fg" | "ko" | "punt" | "snap";
type Payload = Record<string, unknown>;

interface PendingChartApi {
  set: (key: PendingChartKey, data: Payload) => void;
  /** One-shot read: returns the pending payload (if any) and clears it. */
  take: (key: PendingChartKey) => Payload | null;
}

const Ctx = createContext<PendingChartApi | null>(null);

export function PendingChartProvider({ children }: { children: React.ReactNode }) {
  const store = useRef<Partial<Record<PendingChartKey, Payload>>>({});
  const api = useRef<PendingChartApi>({
    set: (key, data) => { store.current[key] = data; },
    take: (key) => { const v = store.current[key] ?? null; delete store.current[key]; return v; },
  });
  return <Ctx.Provider value={api.current}>{children}</Ctx.Provider>;
}

export function usePendingChart(): PendingChartApi | null {
  return useContext(Ctx);
}
