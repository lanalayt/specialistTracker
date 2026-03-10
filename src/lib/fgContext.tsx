"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { FGKick, AthleteStats, Session } from "@/types";
import {
  emptyAthleteStats,
  processKick,
  recomputeFGStats,
  genId,
  sessionLabel,
} from "@/lib/stats";
import { localGet, localSet } from "@/lib/amplify";

interface FGStateData {
  athletes: string[];
  stats: Record<string, AthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface FGContextValue extends FGStateData {
  addAthletes: (names: string[]) => void;
  removeAthlete: (name: string) => void;
  commitPractice: (kicks: FGKick[], label?: string, weather?: string) => Session;
  undoLastCommit: () => boolean;
  resetAll: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  canUndo: boolean;
}

const DEFAULT_ATHLETES = ["Kyle", "LeSieur", "Eich"];

function defaultState(): FGStateData {
  const athletes = DEFAULT_ATHLETES;
  const stats: Record<string, AthleteStats> = {};
  athletes.forEach((a) => {
    stats[a] = emptyAthleteStats();
  });
  return { athletes, stats, snapshot: null, history: [] };
}

const FGContext = createContext<FGContextValue | null>(null);

export function FGProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FGStateData>(defaultState);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localGet<FGStateData>("FG");
    if (saved) {
      const stats = { ...saved.stats };
      (saved.athletes || []).forEach((a) => {
        if (!stats[a]) {
          stats[a] = emptyAthleteStats();
        } else if (!stats[a].pat) {
          // Migration: add pat bucket for old data
          stats[a] = { ...stats[a], pat: { att: 0, made: 0, score: 0 } };
        }
      });
      setState({ ...saved, stats });
    }
  }, []);

  const save = useCallback((next: FGStateData) => {
    setState(next);
    localSet("FG", next);
  }, []);

  const addAthletes = useCallback(
    (names: string[]) => {
      setState((prev) => {
        const existing = new Set(prev.athletes);
        const toAdd = names.filter((n) => n.trim() && !existing.has(n.trim()));
        if (toAdd.length === 0) return prev;
        const newAthletes = [...prev.athletes, ...toAdd.map((n) => n.trim())];
        const newStats = { ...prev.stats };
        toAdd.forEach((a) => {
          if (!newStats[a.trim()]) newStats[a.trim()] = emptyAthleteStats();
        });
        const next = { ...prev, athletes: newAthletes, stats: newStats };
        localSet("FG", next);
        return next;
      });
    },
    []
  );

  const removeAthlete = useCallback(
    (name: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          athletes: prev.athletes.filter((a) => a !== name),
        };
        localSet("FG", next);
        return next;
      });
    },
    []
  );

  const commitPractice = useCallback(
    (kicks: FGKick[], label?: string, weather?: string): Session => {
      const session: Session = {
        id: genId(),
        teamId: "local",
        sport: "KICKING",
        label: label ?? sessionLabel(),
        date: new Date().toISOString(),
        weather: weather || undefined,
        entries: kicks,
      };

      setState((prev) => {
        const snapshot = JSON.parse(JSON.stringify(prev.history)) as Session[];
        const newHistory = [...prev.history, session];
        let newStats = { ...prev.stats };
        kicks.forEach((k) => {
          newStats = processKick(k, newStats);
        });
        const next = { ...prev, stats: newStats, history: newHistory, snapshot };
        localSet("FG", next);
        return next;
      });

      return session;
    },
    []
  );

  const undoLastCommit = useCallback((): boolean => {
    let success = false;
    setState((prev) => {
      if (!prev.snapshot) return prev;
      const newHistory = JSON.parse(JSON.stringify(prev.snapshot)) as Session[];
      const newStats = recomputeFGStats(
        prev.athletes,
        newHistory.map((s) => ({ kicks: (s.entries as FGKick[]) ?? [] }))
      );
      const next = {
        ...prev,
        history: newHistory,
        snapshot: null,
        stats: newStats,
      };
      localSet("FG", next);
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
        localSet("FG", next);
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
        localSet("FG", next);
        return next;
      });
    },
    []
  );

  const resetAll = useCallback(() => {
    const next = defaultState();
    save(next);
  }, [save]);

  return (
    <FGContext.Provider
      value={{
        ...state,
        addAthletes,
        removeAthlete,
        commitPractice,
        undoLastCommit,
        resetAll,
        updateSessionDate,
        updateSessionWeather,
        canUndo: state.snapshot !== null,
      }}
    >
      {children}
    </FGContext.Provider>
  );
}

export function useFG(): FGContextValue {
  const ctx = useContext(FGContext);
  if (!ctx) throw new Error("useFG must be used within FGProvider");
  return ctx;
}
