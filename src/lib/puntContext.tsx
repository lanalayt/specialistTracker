"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { PuntEntry, PuntAthleteStats, Session, SessionMode } from "@/types";
import {
  emptyPuntStats,
  processPunt,
  recomputePuntStats,
  genId,
  sessionLabel,
} from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { teamGet, teamSet, teamSetImmediate, getTeamId } from "@/lib/teamData";
import { useTeamDataSync } from "@/lib/useTeamDataSync";
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
  commitPractice: (entries: PuntEntry[], label?: string, weather?: string, mode?: SessionMode, opponent?: string, gameTime?: string) => Session;
  undoLastCommit: () => boolean;
  resetAll: () => void;
  resetStatsKeepAthletes: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  updateSessionEntries: (sessionId: string, entries: PuntEntry[]) => void;
  deleteSession: (sessionId: string) => void;
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
      let loadedFromCloud = false;
      // Wait briefly for team ID to be set by AppProviders after auth resolves
      let tid = getTeamId();
      for (let i = 0; i < 10 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }

      // Try team_data first (shared across team members)
      if (tid && tid !== "local-dev") {
        saved = await teamGet<PuntStateData>(tid, "punt_data");
        if (saved) loadedFromCloud = true;
      }

      // Fall back to user's own Supabase data
      if (!saved && userId && userId !== "local-dev") {
        saved = await cloudGet<PuntStateData>(userId, getCloudKey("PUNT"));
        if (saved) loadedFromCloud = true;
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
        if (!loadedFromCloud && tid && tid !== "local-dev") {
          teamSet(tid, "punt_data", migrated);
        }
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll team_data for remote updates (changes made on other devices)
  useTeamDataSync<PuntStateData>("punt_data", (remote) => {
    if (!remote) return;
    const stats = { ...remote.stats };
    (remote.athletes || []).forEach((a) => {
      if (!stats[a]) stats[a] = emptyPuntStats();
    });
    const migrated = { ...remote, stats };
    setState(migrated);
    localSet("PUNT", migrated);
  });

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
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        teamSet(tid, "punt_data", next);
      }
      return next;
    });
  }, []);

  const removeAthlete = useCallback((name: string) => {
    setState((prev) => {
      const next = { ...prev, athletes: prev.athletes.filter((a) => a !== name) };
      localSet("PUNT", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        teamSet(tid, "punt_data", next);
      }
      return next;
    });
  }, []);

  const commitPractice = useCallback((entries: PuntEntry[], label?: string, weather?: string, mode: SessionMode = "practice", opponent?: string, gameTime?: string): Session => {
    const session: Session = {
      id: genId(),
      teamId: "local",
      sport: "PUNTING",
      label: label ?? sessionLabel(),
      date: new Date().toISOString(),
      weather: weather || undefined,
      mode,
      opponent: opponent || undefined,
      gameTime: gameTime || undefined,
      entries,
    };
    setState((prev) => {
      const snapshot = JSON.parse(JSON.stringify(prev.history)) as Session[];
      const newHistory = [...prev.history, session];
      let newStats = { ...prev.stats };
      if (mode !== "game") {
        entries.forEach((e) => { newStats = processPunt(e, newStats); });
      }
      const next = { ...prev, stats: newStats, history: newHistory, snapshot };
      localSet("PUNT", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        // Critical: committed session must reach cloud immediately, not debounced
        teamSetImmediate(tid, "punt_data", next);
      }
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
        newHistory
          .filter((s) => s.mode !== "game")
          .map((s) => ({ punts: (s.entries as PuntEntry[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, snapshot: null, stats: newStats };
      localSet("PUNT", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        teamSet(tid, "punt_data", next);
      }
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
        const tid = getTeamId();
        if (tid && tid !== "local-dev") {
          teamSet(tid, "punt_data", next);
        }
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
        const tid = getTeamId();
        if (tid && tid !== "local-dev") {
          teamSet(tid, "punt_data", next);
        }
        return next;
      });
    },
    []
  );

  const updateSessionEntries = useCallback((sessionId: string, entries: PuntEntry[]) => {
    setState((prev) => {
      const newHistory = prev.history.map((s) =>
        s.id === sessionId ? { ...s, entries } : s
      );
      const newStats = recomputePuntStats(
        prev.athletes,
        newHistory
          .filter((s) => s.mode !== "game")
          .map((s) => ({ punts: (s.entries as PuntEntry[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, stats: newStats };
      localSet("PUNT", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") teamSet(tid, "punt_data", next);
      return next;
    });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setState((prev) => {
      const newHistory = prev.history.filter((s) => s.id !== sessionId);
      const newStats = recomputePuntStats(
        prev.athletes,
        newHistory
          .filter((s) => s.mode !== "game")
          .map((s) => ({ punts: (s.entries as PuntEntry[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, stats: newStats };
      localSet("PUNT", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") { teamSet(tid, "punt_data", next); }
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const next = defaultState();
    localSet("PUNT", next);
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamSet(tid, "punt_data", next);
    }
    setState(next);
  }, []);

  const resetStatsKeepAthletes = useCallback(() => {
    setState((prev) => {
      const freshStats: Record<string, PuntAthleteStats> = {};
      prev.athletes.forEach((a) => { freshStats[a] = emptyPuntStats(); });
      const next: PuntStateData = {
        athletes: prev.athletes,
        stats: freshStats,
        snapshot: null,
        history: [],
      };
      localSet("PUNT", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") teamSetImmediate(tid, "punt_data", next);
      return next;
    });
  }, []);

  return (
    <PuntContext.Provider value={{
      ...state, addAthletes, removeAthlete, commitPractice, resetStatsKeepAthletes,
      undoLastCommit, resetAll, updateSessionDate, updateSessionWeather, updateSessionEntries, deleteSession, canUndo: state.snapshot !== null,
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
