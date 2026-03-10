"use client";

import React, {
  createContext, useContext, useState, useCallback, useEffect,
} from "react";
import type { LongSnapEntry, LongSnapAthleteStats, Session } from "@/types";
import { emptyLongSnapStats, processLongSnap, genId, sessionLabel } from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
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

      if (userId && userId !== "local-dev") {
        saved = await cloudGet<LongSnapStateData>(userId, getCloudKey("LONGSNAP"));
      }

      if (!saved) {
        saved = localGet<LongSnapStateData>("LONGSNAP");
      }

      if (saved) {
        const stats = { ...saved.stats };
        (saved.athletes || []).forEach((a) => {
          if (!stats[a]) {
            stats[a] = emptyLongSnapStats();
          } else if (stats[a].overall.excellent === undefined) {
            stats[a] = emptyLongSnapStats();
          }
        });
        const migrated = { ...saved, stats };
        setState(migrated);
        localSet("LONGSNAP", migrated);
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      success = true;
      return next;
    });
    return success;
  }, []);

  return (
    <LongSnapContext.Provider value={{
      ...state, commitPractice, undoLastCommit, updateSessionWeather, canUndo: state.snapshot !== null,
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
