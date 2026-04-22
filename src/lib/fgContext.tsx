"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { FGKick, AthleteStats, Session, SessionMode } from "@/types";
import {
  emptyAthleteStats,
  processKick,
  recomputeFGStats,
  genId,
  sessionLabel,
} from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { teamGet, teamSet, teamSetImmediate, getTeamId } from "@/lib/teamData";
import { useTeamDataSync } from "@/lib/useTeamDataSync";
import { mergeHistory } from "@/lib/mergeHistory";
import { verifyCloudWrite } from "@/lib/integritySync";
import { useAuth } from "@/lib/auth";

interface FGStateData {
  athletes: string[];
  stats: Record<string, AthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface FGContextValue extends FGStateData {
  addAthletes: (names: string[]) => void;
  removeAthlete: (name: string) => void;
  commitPractice: (kicks: FGKick[], label?: string, weather?: string, mode?: SessionMode, opponent?: string, gameTime?: string) => Session;
  undoLastCommit: () => boolean;
  resetAll: () => void;
  resetStatsKeepAthletes: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  updateSessionEntries: (sessionId: string, entries: FGKick[]) => void;
  deleteSession: (sessionId: string) => void;
  restoreSession: (session: Session) => void;
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
  const { user } = useAuth();

  // Load from Supabase first, fall back to localStorage
  useEffect(() => {
    const userId = user?.id;
    if (userId) setCloudUserId(userId);

    async function loadData() {
      let saved: FGStateData | null = null;
      // Wait briefly for team ID to be set by AppProviders after auth resolves
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }

      // Try team_data first (shared across team members)
      if (tid && tid !== "local-dev") {
        saved = await teamGet<FGStateData>(tid, "fg_data");
      }

      // Fall back to user's own Supabase data
      if (!saved && userId && userId !== "local-dev") {
        saved = await cloudGet<FGStateData>(userId, getCloudKey("FG"));
      }

      // Fall back to localStorage (read-only — never write local back to cloud)
      if (!saved) {
        saved = localGet<FGStateData>("FG");
      }

      if (saved) {
        // Merge with localStorage to prevent losing sessions that only exist locally
        const local = localGet<FGStateData>("FG");
        const history = local?.history
          ? mergeHistory(local.history, saved.history ?? [])
          : (saved.history ?? []);
        const stats = { ...saved.stats };
        (saved.athletes || []).forEach((a) => {
          if (!stats[a]) {
            stats[a] = emptyAthleteStats();
          } else if (!stats[a].pat) {
            stats[a] = { ...stats[a], pat: { att: 0, made: 0, score: 0 } };
          }
        });
        const migrated = { ...saved, stats, history };
        setState(migrated);
        localSet("FG", migrated);
        // If local had sessions the cloud didn't, push merged version to cloud
        if (local?.history && history.length > (saved.history ?? []).length) {
          const tid = getTeamId();
          if (tid && tid !== "local-dev") teamSet(tid, "fg_data", migrated);
        }
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll team_data for remote updates (changes made on other devices)
  // CRITICAL: merge histories instead of blind replacement to prevent data loss
  useTeamDataSync<FGStateData>("fg_data", (remote) => {
    if (!remote) return;
    setState((prev) => {
      const mergedHistory = mergeHistory(prev.history, remote.history ?? []);
      // Merge athlete lists (union)
      const athleteSet = new Set([...(prev.athletes || []), ...(remote.athletes || [])]);
      const athletes = Array.from(athleteSet);
      const stats = { ...remote.stats };
      athletes.forEach((a) => {
        if (!stats[a]) {
          stats[a] = emptyAthleteStats();
        } else if (!stats[a].pat) {
          stats[a] = { ...stats[a], pat: { att: 0, made: 0, score: 0 } };
        }
      });
      const merged = { ...remote, athletes, stats, history: mergedHistory, snapshot: prev.snapshot };
      localSet("FG", merged, true); // skipCloud — don't write remote data back to user_data
      return merged;
    });
  });

  const save = useCallback((next: FGStateData) => {
    setState(next);
    localSet("FG", next);
    // Also write to team_data for cross-account sharing
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamSet(tid, "fg_data", next);
    }
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
        { const _t = getTeamId(); if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next); }
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
        { const _t = getTeamId(); if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next); }
        return next;
      });
    },
    []
  );

  const commitPractice = useCallback(
    (kicks: FGKick[], label?: string, weather?: string, mode: SessionMode = "practice", opponent?: string, gameTime?: string): Session => {
      const session: Session = {
        id: genId(),
        teamId: "local",
        sport: "KICKING",
        label: label ?? sessionLabel(),
        date: new Date().toISOString(),
        weather: weather || undefined,
        mode,
        opponent: opponent || undefined,
        gameTime: gameTime || undefined,
        entries: kicks,
      };

      setState((prev) => {
        const snapshot = JSON.parse(JSON.stringify(prev.history)) as Session[];
        const newHistory = [...prev.history, session];
        // Cached stats represent PRACTICE only. Game sessions are stored in
        // history but not added to cached stats.
        let newStats = { ...prev.stats };
        if (mode !== "game") {
          kicks.forEach((k) => {
            newStats = processKick(k, newStats);
          });
        }
        const next = { ...prev, stats: newStats, history: newHistory, snapshot };
        localSet("FG", next);
        // Critical: committed session must reach cloud immediately, not debounced
        const _t = getTeamId();
        if (_t && _t !== "local-dev") {
          teamSetImmediate(_t, "fg_data", next);
          verifyCloudWrite("fg_data", session.id, next);
        }
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
      // Cached stats = practice sessions only
      const newStats = recomputeFGStats(
        prev.athletes,
        newHistory
          .filter((s) => s.mode !== "game")
          .map((s) => ({ kicks: (s.entries as FGKick[]) ?? [] }))
      );
      const next = {
        ...prev,
        history: newHistory,
        snapshot: null,
        stats: newStats,
      };
      localSet("FG", next);
      { const _t = getTeamId(); if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next); }
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
        { const _t = getTeamId(); if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next); }
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
        { const _t = getTeamId(); if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next); }
        return next;
      });
    },
    []
  );

  const updateSessionEntries = useCallback((sessionId: string, entries: FGKick[]) => {
    setState((prev) => {
      const newHistory = prev.history.map((s) =>
        s.id === sessionId ? { ...s, entries } : s
      );
      const newStats = recomputeFGStats(
        prev.athletes,
        newHistory.filter((s) => s.mode !== "game").map((s) => ({ kicks: (s.entries as FGKick[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, stats: newStats };
      localSet("FG", next);
      const _t = getTeamId();
      if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next);
      return next;
    });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setState((prev) => {
      // Save to trash before deleting
      const deleted = prev.history.find((s) => s.id === sessionId);
      if (deleted) {
        import("@/lib/trashBin").then(({ trashSession }) => trashSession(deleted, "KICKING"));
      }
      const newHistory = prev.history.filter((s) => s.id !== sessionId);
      const newStats = recomputeFGStats(
        prev.athletes,
        newHistory
          .filter((s) => s.mode !== "game")
          .map((s) => ({ kicks: (s.entries as FGKick[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, stats: newStats };
      localSet("FG", next);
      { const _t = getTeamId(); if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next); }
      return next;
    });
  }, []);

  const restoreSession = useCallback((session: Session) => {
    setState((prev) => {
      if (prev.history.some((s) => s.id === session.id)) return prev;
      const newHistory = [...prev.history, session].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const newStats = recomputeFGStats(
        prev.athletes,
        newHistory.filter((s) => s.mode !== "game").map((s) => ({ kicks: (s.entries as FGKick[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, stats: newStats };
      localSet("FG", next);
      { const _t = getTeamId(); if (_t && _t !== "local-dev") teamSet(_t, "fg_data", next); }
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const next = defaultState();
    save(next);
  }, [save]);

  const resetStatsKeepAthletes = useCallback(() => {
    setState((prev) => {
      const freshStats: Record<string, AthleteStats> = {};
      prev.athletes.forEach((a) => { freshStats[a] = emptyAthleteStats(); });
      const next: FGStateData = {
        athletes: prev.athletes,
        stats: freshStats,
        snapshot: null,
        history: [],
      };
      localSet("FG", next);
      const _t = getTeamId();
      if (_t && _t !== "local-dev") teamSetImmediate(_t, "fg_data", next);
      return next;
    });
  }, []);

  return (
    <FGContext.Provider
      value={{
        ...state,
        addAthletes,
        removeAthlete,
        commitPractice,
        undoLastCommit,
        resetStatsKeepAthletes,
        resetAll,
        updateSessionDate,
        updateSessionWeather,
        updateSessionEntries,
        deleteSession,
        restoreSession,
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
