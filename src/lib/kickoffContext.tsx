"use client";

import React, {
  createContext, useContext, useState, useCallback, useEffect,
} from "react";
import type { KickoffEntry, KickoffAthleteStats, Session, SessionMode } from "@/types";
import { emptyKickoffStats, processKickoff, recomputeKickoffStats, genId, sessionLabel } from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { teamGet, teamSet, teamSetImmediate, getTeamId } from "@/lib/teamData";
import { useTeamDataSync } from "@/lib/useTeamDataSync";
import { useAuth } from "@/lib/auth";

interface KickoffStateData {
  athletes: string[];
  stats: Record<string, KickoffAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface KickoffContextValue extends KickoffStateData {
  addAthletes: (names: string[]) => void;
  removeAthlete: (name: string) => void;
  commitPractice: (entries: KickoffEntry[], label?: string, weather?: string, mode?: SessionMode, opponent?: string, gameTime?: string) => Session;
  undoLastCommit: () => boolean;
  resetStatsKeepAthletes: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  deleteSession: (sessionId: string) => void;
  canUndo: boolean;
}

const DEFAULT_ATHLETES = ["Kyle", "LeSieur", "Eich"];

function defaultState(): KickoffStateData {
  const athletes = DEFAULT_ATHLETES;
  const stats: Record<string, KickoffAthleteStats> = {};
  athletes.forEach((a) => { stats[a] = emptyKickoffStats(); });
  return { athletes, stats, snapshot: null, history: [] };
}

const KickoffContext = createContext<KickoffContextValue | null>(null);

export function KickoffProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<KickoffStateData>(defaultState);
  const { user } = useAuth();

  useEffect(() => {
    const userId = user?.id;
    if (userId) setCloudUserId(userId);

    async function loadData() {
      let saved: KickoffStateData | null = null;

      // Wait briefly for team ID to be set by AppProviders after auth resolves
      let tid = getTeamId();
      for (let i = 0; i < 10 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }

      // Try team_data first (shared across team members)
      if (tid && tid !== "local-dev") {
        saved = await teamGet<KickoffStateData>(tid, "kickoff_data");
      }

      // Fall back to user's own Supabase data
      if (!saved && userId && userId !== "local-dev") {
        saved = await cloudGet<KickoffStateData>(userId, getCloudKey("KICKOFF"));
      }

      if (!saved) {
        saved = localGet<KickoffStateData>("KICKOFF");
      }

      if (saved) {
        const stats = { ...saved.stats };
        (saved.athletes || []).forEach((a) => { if (!stats[a]) stats[a] = emptyKickoffStats(); });
        const migrated = { ...saved, stats };
        setState(migrated);
        localSet("KICKOFF", migrated);
        if (tid && tid !== "local-dev") {
          teamSet(tid, "kickoff_data", migrated);
        }
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll team_data for remote updates (changes made on other devices)
  useTeamDataSync<KickoffStateData>("kickoff_data", (remote) => {
    if (!remote) return;
    const stats = { ...remote.stats };
    (remote.athletes || []).forEach((a) => {
      if (!stats[a]) stats[a] = emptyKickoffStats();
    });
    const migrated = { ...remote, stats };
    setState(migrated);
    localSet("KICKOFF", migrated);
  });

  const addAthletes = useCallback((names: string[]) => {
    setState((prev) => {
      const existing = new Set(prev.athletes);
      const toAdd = names.filter((n) => n.trim() && !existing.has(n.trim()));
      if (toAdd.length === 0) return prev;
      const newAthletes = [...prev.athletes, ...toAdd.map((n) => n.trim())];
      const newStats = { ...prev.stats };
      toAdd.forEach((a) => {
        if (!newStats[a.trim()]) newStats[a.trim()] = emptyKickoffStats();
      });
      const next = { ...prev, athletes: newAthletes, stats: newStats };
      localSet("KICKOFF", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") teamSet(tid, "kickoff_data", next);
      return next;
    });
  }, []);

  const removeAthlete = useCallback((name: string) => {
    setState((prev) => {
      const next = { ...prev, athletes: prev.athletes.filter((a) => a !== name) };
      localSet("KICKOFF", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") teamSet(tid, "kickoff_data", next);
      return next;
    });
  }, []);

  const commitPractice = useCallback((entries: KickoffEntry[], label?: string, weather?: string, mode: SessionMode = "practice", opponent?: string, gameTime?: string): Session => {
    const session: Session = {
      id: genId(), teamId: "local", sport: "KICKOFF",
      label: label ?? sessionLabel(), date: new Date().toISOString(),
      weather: weather || undefined, mode,
      opponent: opponent || undefined, gameTime: gameTime || undefined,
      entries,
    };
    setState((prev) => {
      const snapshot = JSON.parse(JSON.stringify(prev.history)) as Session[];
      let newStats = { ...prev.stats };
      if (mode !== "game") {
        entries.forEach((e) => { newStats = processKickoff(e, newStats); });
      }
      const next = { ...prev, stats: newStats, history: [...prev.history, session], snapshot };
      localSet("KICKOFF", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        // Critical: committed session must reach cloud immediately, not debounced
        teamSetImmediate(tid, "kickoff_data", next);
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
      const newStats = defaultState().stats;
      prev.athletes.forEach((a) => { newStats[a] = emptyKickoffStats(); });
      newHistory.filter((s) => s.mode !== "game").forEach((s) => {
        (s.entries as KickoffEntry[])?.forEach((e) => {
          Object.assign(newStats, processKickoff(e, newStats));
        });
      });
      const next = { ...prev, history: newHistory, snapshot: null, stats: newStats };
      localSet("KICKOFF", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        teamSet(tid, "kickoff_data", next);
      }
      success = true;
      return next;
    });
    return success;
  }, []);

  const updateSessionWeather = useCallback(
    (sessionId: string, weather: string) => {
      setState((prev) => {
        const newHistory = prev.history.map((s) =>
          s.id === sessionId ? { ...s, weather: weather || undefined } : s
        );
        const next = { ...prev, history: newHistory };
        localSet("KICKOFF", next);
        const tid = getTeamId();
        if (tid && tid !== "local-dev") {
          teamSet(tid, "kickoff_data", next);
        }
        return next;
      });
    },
    []
  );

  const updateSessionDate = useCallback(
    (sessionId: string, date: string, label: string) => {
      setState((prev) => {
        const newHistory = prev.history.map((s) =>
          s.id === sessionId ? { ...s, date, label } : s
        );
        const next = { ...prev, history: newHistory };
        localSet("KICKOFF", next);
        const tid = getTeamId();
        if (tid && tid !== "local-dev") {
          teamSet(tid, "kickoff_data", next);
        }
        return next;
      });
    },
    []
  );

  const deleteSession = useCallback((sessionId: string) => {
    setState((prev) => {
      const newHistory = prev.history.filter((s) => s.id !== sessionId);
      const newStats = recomputeKickoffStats(
        prev.athletes,
        newHistory
          .filter((s) => s.mode !== "game")
          .map((s) => ({ entries: (s.entries as KickoffEntry[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, stats: newStats };
      localSet("KICKOFF", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") { teamSet(tid, "kickoff_data", next); }
      return next;
    });
  }, []);

  const resetStatsKeepAthletes = useCallback(() => {
    setState((prev) => {
      const freshStats: Record<string, KickoffAthleteStats> = {};
      prev.athletes.forEach((a) => { freshStats[a] = emptyKickoffStats(); });
      const next: KickoffStateData = {
        athletes: prev.athletes,
        stats: freshStats,
        snapshot: null,
        history: [],
      };
      localSet("KICKOFF", next);
      const tid = getTeamId();
      if (tid && tid !== "local-dev") teamSetImmediate(tid, "kickoff_data", next);
      return next;
    });
  }, []);

  return (
    <KickoffContext.Provider value={{
      ...state, addAthletes, removeAthlete, commitPractice, undoLastCommit, updateSessionDate, updateSessionWeather, deleteSession, resetStatsKeepAthletes, canUndo: state.snapshot !== null,
    }}>
      {children}
    </KickoffContext.Provider>
  );
}

export function useKickoff() {
  const ctx = useContext(KickoffContext);
  if (!ctx) throw new Error("useKickoff must be used within KickoffProvider");
  return ctx;
}
