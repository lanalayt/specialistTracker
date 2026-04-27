"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import type { FGKick, AthleteStats, Session, SessionMode } from "@/types";
import {
  emptyAthleteStats,
  recomputeFGStats,
  genId,
  sessionLabel,
} from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { teamGet, getTeamId } from "@/lib/teamData";
import { insertSession, loadSessions, updateSession as updateSessionRow, softDeleteSession, useSessionSync, stampSessionWrite } from "@/lib/sessionStore";
import { loadAthletes, insertAthlete, removeAthlete as removeAthleteRow, useAthleteSync, stampAthleteWrite, type StoredAthlete } from "@/lib/athleteStore";
import { useAuth } from "@/lib/auth";

interface FGStateData {
  athletes: string[];
  stats: Record<string, AthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface FGContextValue {
  athletes: StoredAthlete[];
  stats: Record<string, AthleteStats>;
  history: Session[];
  addAthletes: (names: string[]) => void;
  removeAthlete: (athleteId: string) => void;
  commitPractice: (kicks: FGKick[], label?: string, weather?: string, mode?: SessionMode, opponent?: string, gameTime?: string) => Session;
  resetStatsKeepAthletes: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  updateSessionOpponent: (sessionId: string, opponent: string) => void;
  updateSessionEntries: (sessionId: string, entries: FGKick[]) => void;
  deleteSession: (sessionId: string) => void;
  restoreSession: (session: Session) => void;
}

const FGContext = createContext<FGContextValue | null>(null);

export function FGProvider({ children }: { children: React.ReactNode }) {
  const [athletes, setAthletes] = useState<StoredAthlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [migrated, setMigrated] = useState(false);
  const { user } = useAuth();

  // Stats computed on the fly from practice sessions
  const stats = useMemo(() => {
    const names = athletes.map((a) => a.name);
    return recomputeFGStats(
      names,
      sessions
        .filter((s) => s.mode !== "game")
        .map((s) => ({ kicks: (s.entries as FGKick[]) ?? [] }))
    );
  }, [athletes, sessions]);

  // History = sessions sorted by date
  const history = useMemo(
    () => [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [sessions]
  );

  // ─── Load + migrate ──────────────────────────────────────────────
  useEffect(() => {
    const userId = user?.id;
    if (userId) setCloudUserId(userId);

    async function loadData() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }

      // Load athletes from athletes table
      if (tid && tid !== "local-dev") {
        const dbAthletes = await loadAthletes(tid, "KICKING");
        if (dbAthletes.length > 0) {
          setAthletes(dbAthletes);
        }
      }

      // Load sessions from sessions table
      if (tid && tid !== "local-dev") {
        const dbSessions = await loadSessions(tid, "KICKING");
        if (dbSessions.length > 0) {
          setSessions(dbSessions);
          setMigrated(true);
          return;
        }
      }

      // ─── Migration: blob → tables ──────────────────────────────
      let blob: FGStateData | null = null;
      if (tid && tid !== "local-dev") {
        blob = await teamGet<FGStateData>(tid, "fg_data");
      }
      if (!blob && userId && userId !== "local-dev") {
        blob = await cloudGet<FGStateData>(userId, getCloudKey("FG"));
      }
      if (!blob) {
        blob = localGet<FGStateData>("FG");
      }

      // Also check localStorage for sessions that might only exist locally
      const localBlob = localGet<FGStateData>("FG");

      if (blob || localBlob) {
        const source = blob ?? localBlob!;
        const localHistory = localBlob?.history ?? [];
        const blobHistory = blob?.history ?? [];

        // Merge both histories by ID
        const sessionMap = new Map<string, Session>();
        for (const s of localHistory) sessionMap.set(s.id, s);
        for (const s of blobHistory) {
          const existing = sessionMap.get(s.id);
          if (!existing || (Array.isArray(s.entries) ? s.entries.length : 0) >= (Array.isArray(existing.entries) ? existing.entries.length : 0)) {
            sessionMap.set(s.id, s);
          }
        }
        const allSessions = Array.from(sessionMap.values()).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Migrate athletes to athletes table
        const athleteNames = source.athletes ?? [];
        if (tid && tid !== "local-dev" && athleteNames.length > 0) {
          const existing = await loadAthletes(tid, "KICKING");
          const existingNames = new Set(existing.map((a) => a.name));
          const toInsert = athleteNames.filter((n) => !existingNames.has(n));
          const inserted: StoredAthlete[] = [...existing];
          for (const name of toInsert) {
            const result = await insertAthlete(tid, "KICKING", name);
            if (result) inserted.push(result);
          }
          setAthletes(inserted);
        }

        // Migrate sessions to sessions table
        if (tid && tid !== "local-dev" && allSessions.length > 0) {
          for (const s of allSessions) {
            await insertSession(tid, { ...s, sport: "KICKING", teamId: tid });
          }
          // Re-load from DB to get consistent data
          const dbSessions = await loadSessions(tid, "KICKING");
          setSessions(dbSessions);
        } else {
          setSessions(allSessions);
        }

        setMigrated(true);
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Realtime sync for sessions ─────────────────────────────────
  const tid = getTeamId();
  useSessionSync(tid, "KICKING", {
    onInsert: (session) => {
      setSessions((prev) => {
        if (prev.some((s) => s.id === session.id)) return prev;
        return [...prev, session].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      });
    },
    onUpdate: (session) => {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
    },
    onDelete: (sessionId) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    onRestore: (session) => {
      setSessions((prev) => {
        if (prev.some((s) => s.id === session.id)) return prev;
        return [...prev, session].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      });
    },
  });

  // ─── Realtime sync for athletes ─────────────────────────────────
  useAthleteSync(tid, "KICKING", (dbAthletes) => {
    setAthletes(dbAthletes);
  });

  // ─── Actions ────────────────────────────────────────────────────

  const addAthletes = useCallback(
    (names: string[]) => {
      const tid = getTeamId();
      const existing = new Set(athletes.map((a) => a.name));
      const toAdd = names.filter((n) => n.trim() && !existing.has(n.trim()));
      if (toAdd.length === 0) return;

      if (tid && tid !== "local-dev") {
        stampAthleteWrite(tid);
        Promise.all(toAdd.map((n) => insertAthlete(tid, "KICKING", n))).then((results) => {
          const added = results.filter(Boolean) as StoredAthlete[];
          setAthletes((prev) => [...prev, ...added]);
        });
      } else {
        // Local fallback
        const added = toAdd.map((n) => ({ id: genId(), name: n.trim() }));
        setAthletes((prev) => [...prev, ...added]);
      }
    },
    [athletes]
  );

  const removeAthleteAction = useCallback(
    (athleteId: string) => {
      const tid = getTeamId();
      setAthletes((prev) => prev.filter((a) => a.id !== athleteId));
      if (tid && tid !== "local-dev") {
        stampAthleteWrite(tid);
        removeAthleteRow(tid, athleteId);
      }
    },
    []
  );

  const commitPractice = useCallback(
    (kicks: FGKick[], label?: string, weather?: string, mode: SessionMode = "practice", opponent?: string, gameTime?: string): Session => {
      const tid = getTeamId();
      const session: Session = {
        id: genId(),
        teamId: tid ?? "local",
        sport: "KICKING",
        label: label ?? sessionLabel(),
        date: new Date().toISOString(),
        weather: weather || undefined,
        mode,
        opponent: opponent || undefined,
        gameTime: gameTime || undefined,
        entries: kicks,
      };

      setSessions((prev) => [...prev, session]);

      if (tid && tid !== "local-dev") {
        stampSessionWrite(tid);
        insertSession(tid, session);
      }

      return session;
    },
    []
  );

  const updateSessionDate = useCallback(
    (sessionId: string, date: string, label: string) => {
      setSessions((prev) => prev.map((s) =>
        s.id === sessionId ? { ...s, date, label } : s
      ));
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        stampSessionWrite(tid);
        updateSessionRow(tid, sessionId, { date, label });
      }
    },
    []
  );

  const updateSessionWeather = useCallback(
    (sessionId: string, weather: string) => {
      setSessions((prev) => prev.map((s) =>
        s.id === sessionId ? { ...s, weather: weather || undefined } : s
      ));
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        stampSessionWrite(tid);
        updateSessionRow(tid, sessionId, { weather: weather || undefined });
      }
    },
    []
  );

  const updateSessionOpponent = useCallback(
    (sessionId: string, opponent: string) => {
      setSessions((prev) => prev.map((s) =>
        s.id === sessionId ? { ...s, opponent: opponent || undefined } : s
      ));
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        stampSessionWrite(tid);
        updateSessionRow(tid, sessionId, { opponent: opponent || undefined });
      }
    },
    []
  );

  const updateSessionEntries = useCallback((sessionId: string, entries: FGKick[]) => {
    setSessions((prev) => prev.map((s) =>
      s.id === sessionId ? { ...s, entries } : s
    ));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      stampSessionWrite(tid);
      updateSessionRow(tid, sessionId, { entries });
    }
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      stampSessionWrite(tid);
      softDeleteSession(tid, sessionId);
    }
  }, []);

  const restoreSessionAction = useCallback((session: Session) => {
    setSessions((prev) => {
      if (prev.some((s) => s.id === session.id)) return prev;
      return [...prev, session].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      stampSessionWrite(tid);
      // Insert in case it was hard-deleted, otherwise the row already exists
      insertSession(tid, { ...session, sport: "KICKING", teamId: tid });
    }
  }, []);

  const resetStatsKeepAthletes = useCallback(() => {
    // Soft-delete all sessions for this sport
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      stampSessionWrite(tid);
      sessions.forEach((s) => softDeleteSession(tid, s.id));
    }
    setSessions([]);
  }, [sessions]);

  return (
    <FGContext.Provider
      value={{
        athletes,
        stats,
        history,
        addAthletes,
        removeAthlete: removeAthleteAction,
        commitPractice,
        resetStatsKeepAthletes,
        updateSessionDate,
        updateSessionWeather,
        updateSessionOpponent,
        updateSessionEntries,
        deleteSession,
        restoreSession: restoreSessionAction,
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
