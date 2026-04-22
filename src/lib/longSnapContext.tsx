"use client";

import React, {
  createContext, useContext, useState, useCallback, useEffect,
} from "react";
import type { LongSnapEntry, LongSnapAthleteStats, Session } from "@/types";
import { emptyLongSnapStats, processLongSnap, recomputeLongSnapStats, genId, sessionLabel } from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import { useTeamDataSync } from "@/lib/useTeamDataSync";
import { mergeHistory } from "@/lib/mergeHistory";
import { useAuth } from "@/lib/auth";

interface LongSnapStateData {
  athletes: string[];
  stats: Record<string, LongSnapAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface LongSnapContextValue extends LongSnapStateData {
  commitPractice: (entries: LongSnapEntry[], label?: string, weather?: string) => Session;
  undoLastCommit: () => boolean;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  deleteSession: (sessionId: string) => void;
  canUndo: boolean;
}

const DEFAULT_ATHLETES = ["Snapper1", "Snapper2"];

function defaultState(): LongSnapStateData {
  const athletes = DEFAULT_ATHLETES;
  const stats: Record<string, LongSnapAthleteStats> = {};
  athletes.forEach((a) => { stats[a] = emptyLongSnapStats(); });
  return { athletes, stats, snapshot: null, history: [] };
}

const LongSnapContext = createContext<LongSnapContextValue | null>(null);

export function LongSnapProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LongSnapStateData>(defaultState);
  const { user } = useAuth();

  useEffect(() => {
    const userId = user?.id;
    if (userId) setCloudUserId(userId);

    async function loadData() {
      let saved: LongSnapStateData | null = null;
      const tid = getTeamId();

      // Try team_data first (shared across team members)
      if (tid && tid !== "local-dev") {
        saved = await teamGet<LongSnapStateData>(tid, "longsnap_data");
      }

      // Fall back to user's own Supabase data
      if (!saved && userId && userId !== "local-dev") {
        saved = await cloudGet<LongSnapStateData>(userId, getCloudKey("LONGSNAP"));
      }

      if (!saved) {
        saved = localGet<LongSnapStateData>("LONGSNAP");
      }

      if (saved) {
        // Merge with localStorage to prevent losing sessions that only exist locally
        const local = localGet<LongSnapStateData>("LONGSNAP");
        const history = local?.history
          ? mergeHistory(local.history, saved.history ?? [])
          : (saved.history ?? []);
        const stats = { ...saved.stats };
        (saved.athletes || []).forEach((a) => {
          if (!stats[a]) {
            stats[a] = emptyLongSnapStats();
          } else if (stats[a].overall.excellent === undefined) {
            stats[a] = emptyLongSnapStats();
          }
        });
        const migrated = { ...saved, stats, history };
        setState(migrated);
        localSet("LONGSNAP", migrated);
        // If local had sessions the cloud didn't, push merged version to cloud
        if (local?.history && history.length > (saved.history ?? []).length) {
          const tid = getTeamId();
          if (tid && tid !== "local-dev") teamSet(tid, "longsnap_data", migrated);
        }
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll team_data for remote updates — was missing, causing stale data on multi-device
  // CRITICAL: merge histories instead of blind replacement to prevent data loss
  useTeamDataSync<LongSnapStateData>("longsnap_data", (remote) => {
    if (!remote) return;
    setState((prev) => {
      const mergedHistory = mergeHistory(prev.history, remote.history ?? []);
      const athleteSet = new Set([...(prev.athletes || []), ...(remote.athletes || [])]);
      const athletes = Array.from(athleteSet);
      const stats = { ...remote.stats };
      athletes.forEach((a) => {
        if (!stats[a]) stats[a] = emptyLongSnapStats();
        else if (stats[a].overall.excellent === undefined) stats[a] = emptyLongSnapStats();
      });
      const merged = { ...remote, athletes, stats, history: mergedHistory, snapshot: prev.snapshot };
      localSet("LONGSNAP", merged);
      return merged;
    });
  });

  const commitPractice = useCallback((entries: LongSnapEntry[], label?: string, weather?: string): Session => {
    const session: Session = {
      id: genId(), teamId: "local", sport: "LONGSNAP",
      label: label ?? sessionLabel(), date: new Date().toISOString(),
      weather: weather || undefined, entries,
    };
    setState((prev) => {
      const snapshot = JSON.parse(JSON.stringify(prev.history)) as Session[];
      let newStats = { ...prev.stats };
      entries.forEach((e) => { newStats = processLongSnap(e, newStats); });
      const next = { ...prev, stats: newStats, history: [...prev.history, session], snapshot };
      localSet("LONGSNAP", next);
      const _tid = getTeamId(); if (_tid && _tid !== "local-dev") teamSet(_tid, "longsnap_data", next);
      return next;
    });
    return session;
  }, []);

  const updateSessionWeather = useCallback(
    (sessionId: string, weather: string) => {
      setState((prev) => {
        const newHistory = prev.history.map((s) =>
          s.id === sessionId ? { ...s, weather: weather || undefined } : s
        );
        const next = { ...prev, history: newHistory };
        localSet("LONGSNAP", next);
      const _tid = getTeamId(); if (_tid && _tid !== "local-dev") teamSet(_tid, "longsnap_data", next);
        return next;
      });
    },
    []
  );

  const undoLastCommit = useCallback((): boolean => {
    let success = false;
    setState((prev) => {
      if (!prev.snapshot) return prev;
      const newHistory = JSON.parse(JSON.stringify(prev.snapshot)) as Session[];
      const newStats: Record<string, LongSnapAthleteStats> = {};
      prev.athletes.forEach((a) => { newStats[a] = emptyLongSnapStats(); });
      newHistory.forEach((s) => {
        (s.entries as LongSnapEntry[])?.forEach((e) => {
          Object.assign(newStats, processLongSnap(e, newStats));
        });
      });
      const next = { ...prev, history: newHistory, snapshot: null, stats: newStats };
      localSet("LONGSNAP", next);
      const _tid = getTeamId(); if (_tid && _tid !== "local-dev") teamSet(_tid, "longsnap_data", next);
      success = true;
      return next;
    });
    return success;
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setState((prev) => {
      const newHistory = prev.history.filter((s) => s.id !== sessionId);
      const newStats = recomputeLongSnapStats(
        prev.athletes,
        newHistory.map((s) => ({ entries: (s.entries as LongSnapEntry[]) ?? [] }))
      );
      const next = { ...prev, history: newHistory, stats: newStats };
      localSet("LONGSNAP", next);
      const _tid = getTeamId(); if (_tid && _tid !== "local-dev") teamSet(_tid, "longsnap_data", next);
      return next;
    });
  }, []);

  return (
    <LongSnapContext.Provider value={{
      ...state, commitPractice, undoLastCommit, updateSessionWeather, deleteSession, canUndo: state.snapshot !== null,
    }}>
      {children}
    </LongSnapContext.Provider>
  );
}

export function useLongSnap() {
  const ctx = useContext(LongSnapContext);
  if (!ctx) throw new Error("useLongSnap must be used within LongSnapProvider");
  return ctx;
}
