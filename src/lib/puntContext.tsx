"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { PuntEntry, PuntAthleteStats, Session } from "@/types";
import {
  emptyPuntStats,
  processPunt,
  recomputePuntStats,
  genId,
  sessionLabel,
} from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { useAuth } from "@/lib/auth";

interface PuntStateData {
  athletes: string[];
  stats: Record<string, PuntAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface PuntContextValue extends PuntStateData {
  addAthletes: (names: string[]) => void;
  removeAthlete: (name: string) => void;
  commitPractice: (entries: PuntEntry[], label?: string, weather?: string) => Session;
  undoLastCommit: () => boolean;
  resetAll: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  canUndo: boolean;
}

const DEFAULT_ATHLETES = ["Kyle", "LeSieur", "Eich"];

function defaultState(): PuntStateData {
  const athletes = DEFAULT_ATHLETES;
  const stats: Record<string, PuntAthleteStats> = {};
  athletes.forEach((a) => { stats[a] = emptyPuntStats(); });
  return { athletes, stats, snapshot: null, history: [] };
}

const PuntContext = createContext<PuntContextValue | null>(null);

export function PuntProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PuntStateData>(defaultState);
  const { user } = useAuth();

  useEffect(() => {
    const userId = user?.id;
    if (userId) setCloudUserId(userId);

    async function loadData() {
      let saved: PuntStateData | null = null;

      if (userId && userId !== "local-dev") {
        saved = await cloudGet<PuntStateData>(userId, getCloudKey("PUNT"));
      }

      if (!saved) {
        saved = localGet<PuntStateData>("PUNT");
      }

      if (saved) {
        const stats = { ...saved.stats };
        (saved.athletes || []).forEach((a) => {
          if (!stats[a]) {
            stats[a] = emptyPuntStats();
          } else if (
            !stats[a].byLanding ||
            stats[a].overall.totalDirectionalAccuracy === undefined ||
            stats[a].overall.criticalDirections === undefined ||
            stats[a].overall.poochYardLineTotal === undefined
          ) {
            stats[a] = emptyPuntStats();
          }
        });
        const migrated = { ...saved, stats };
        setState(migrated);
        localSet("PUNT", migrated);
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addAthletes = useCallback((names: string[]) => {
    setState((prev) => {
      const existing = new Set(prev.athletes);
      const toAdd = names.filter((n) => n.trim() && !existing.has(n.trim()));
      if (toAdd.length === 0) return prev;
      const newAthletes = [...prev.athletes, ...toAdd.map((n) => n.trim())];
      const newStats = { ...prev.stats };
      toAdd.forEach((a) => { if (!newStats[a.trim()]) newStats[a.trim()] = emptyPuntStats(); });
      const next = { ...prev, athletes: newAthletes, stats: newStats };
      localSet("PUNT", next);
      return next;
    });
  }, []);

  const removeAthlete = useCallback((name: string) => {
    setState((prev) => {
      const next = { ...prev, athletes: prev.athletes.filter((a) => a !== name) };
      localSet("PUNT", next);
      return next;
    });
  }, []);

  const commitPractice = useCallback((entries: PuntEntry[], label?: string, weather?: string): Session => {
    const session: Session = {
      id: genId(),
      teamId: "local",
      sport: "PUNTING",
      label: label ?? sessionLabel(),
      date: new Date().toISOString(),
      weather: weather || undefined,
      entries,
    };
    setState((prev) => {
      const snapshot = JSON.parse(JSON.stringify(prev.history)) as Session[];
      const newHistory = [...prev.history, session];
      let newStats = { ...prev.stats };
      entries.forEach((e) => { newStats = processPunt(e, newStats); });
      const next = { ...prev, stats: newStats, history: newHistory, snapshot };
      localSet("PUNT", next);
      return next;
    });
    return session;
  }, []);

  const undoLastCommit = useCallback((): boolean => {
    let success = false;
    setState((prev) => {
      if (!prev.snapshot) return prev;
      const newHistory = JSON.parse(JSON.stringify(prev.snapshot)) as Session[];
      const newStats = recomputePuntStats(
        prev.athletes,
        newHistory.map((s) => ({ punts: (s.entries as PuntEntry[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, snapshot: null, stats: newStats };
      localSet("PUNT", next);
      success = true;
      return next;
    });
    return success;
  }, []);

  const updateSessionDate = useCallback(
    (sessionId: string, date: string, label: string) => {
      setState((prev) => {
        const newHistory = prev.history.map((s) =>
          s.id === sessionId ? { ...s, date, label } : s
        );
        const next = { ...prev, history: newHistory };
        localSet("PUNT", next);
        return next;
      });
    },
    []
  );

  const updateSessionWeather = useCallback(
    (sessionId: string, weather: string) => {
      setState((prev) => {
        const newHistory = prev.history.map((s) =>
          s.id === sessionId ? { ...s, weather: weather || undefined } : s
        );
        const next = { ...prev, history: newHistory };
        localSet("PUNT", next);
        return next;
      });
    },
    []
  );

  const resetAll = useCallback(() => {
    const next = defaultState();
    localSet("PUNT", next);
    setState(next);
  }, []);

  return (
    <PuntContext.Provider value={{
      ...state, addAthletes, removeAthlete, commitPractice,
      undoLastCommit, resetAll, updateSessionDate, updateSessionWeather, canUndo: state.snapshot !== null,
    }}>
      {children}
    </PuntContext.Provider>
  );
}

export function usePunt(): PuntContextValue {
  const ctx = useContext(PuntContext);
  if (!ctx) throw new Error("usePunt must be used within PuntProvider");
  return ctx;
}
