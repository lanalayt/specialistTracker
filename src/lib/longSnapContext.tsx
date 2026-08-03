"use client";

import React, {
  createContext, useContext, useState, useCallback, useEffect, useMemo,
} from "react";
import type { LongSnapEntry, LongSnapAthleteStats, Session } from "@/types";
import { emptyLongSnapStats, recomputeLongSnapStats, genId, sessionLabel } from "@/lib/stats";
import { getTeamId } from "@/lib/teamData";
import { insertSession, loadSessions, updateSession as updateSessionRow, softDeleteSession, useSessionSync, stampSessionWrite } from "@/lib/sessionStore";
import { loadAthletes, insertAthlete, removeAthlete as removeAthleteRow, useAthleteSync, stampAthleteWrite, type StoredAthlete } from "@/lib/athleteStore";
import { useAuth } from "@/lib/auth";

interface LongSnapContextValue {
  athletes: StoredAthlete[];
  stats: Record<string, LongSnapAthleteStats>;
  history: Session[];
  addAthletes: (names: string[]) => void;
  removeAthlete: (athleteId: string) => void;
  commitPractice: (entries: LongSnapEntry[], label?: string, weather?: string, mode?: "practice" | "game", opponent?: string, gameTime?: string) => Session;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  updateSessionEntries: (sessionId: string, entries: LongSnapEntry[]) => void;
  deleteSession: (sessionId: string) => void;
}

const LongSnapContext = createContext<LongSnapContextValue | null>(null);

export function LongSnapProvider({ children, sportKey = "LONGSNAP" }: { children: React.ReactNode; sportKey?: string }) {
  const [athletes, setAthletes] = useState<StoredAthlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const { user } = useAuth();

  const stats = useMemo(() => {
    const names = athletes.map((a) => a.name);
    return recomputeLongSnapStats(
      names,
      sessions.map((s) => ({ entries: (s.entries as LongSnapEntry[]) ?? [] }))
    );
  }, [athletes, sessions]);

  const history = useMemo(
    () => [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [sessions]
  );

  useEffect(() => {
    async function loadData() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }

      if (tid && tid !== "local-dev") {
        const dbAthletes = await loadAthletes(tid, sportKey);
        if (dbAthletes.length > 0) setAthletes(dbAthletes);

        const dbSessions = await loadSessions(tid, sportKey);
        if (dbSessions.length > 0) setSessions(dbSessions);
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tid = getTeamId();
  useSessionSync(tid, sportKey, {
    onInsert: (s) => setSessions((prev) => prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())),
    onUpdate: (s) => setSessions((prev) => prev.map((x) => x.id === s.id ? s : x)),
    onDelete: (id) => setSessions((prev) => prev.filter((x) => x.id !== id)),
    onRestore: (s) => setSessions((prev) => prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())),
  });

  useAthleteSync(tid, sportKey, (dbAthletes) => setAthletes(dbAthletes));

  const addAthletes = useCallback((names: string[]) => {
    const tid = getTeamId();
    const existing = new Set(athletes.map((a) => a.name));
    const toAdd = names.filter((n) => n.trim() && !existing.has(n.trim()));
    if (toAdd.length === 0) return;
    if (tid && tid !== "local-dev") {
      stampAthleteWrite(tid);
      Promise.all(toAdd.map((n) => insertAthlete(tid, sportKey, n))).then((results) => {
        const added = results.filter(Boolean) as StoredAthlete[];
        setAthletes((prev) => [...prev, ...added]);
      });
    } else {
      const added = toAdd.map((n) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: n.trim() }));
      setAthletes((prev) => [...prev, ...added]);
    }
  }, [athletes]);

  const removeAthleteAction = useCallback((athleteId: string) => {
    const tid = getTeamId();
    setAthletes((prev) => prev.filter((a) => a.id !== athleteId));
    if (tid && tid !== "local-dev") {
      stampAthleteWrite(tid);
      removeAthleteRow(tid, athleteId);
    }
  }, []);

  const commitPractice = useCallback((entries: LongSnapEntry[], label?: string, weather?: string, mode: "practice" | "game" = "practice", opponent?: string, gameTime?: string): Session => {
    const tid = getTeamId();
    const session: Session = {
      id: genId(), teamId: tid ?? "local", sport: sportKey as Session["sport"],
      label: label ?? sessionLabel(), date: new Date().toISOString(),
      weather: weather || undefined, entries,
      mode, opponent: opponent || undefined, gameTime: gameTime || undefined,
    };
    setSessions((prev) => [...prev, session]);
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); insertSession(tid, session); }
    return session;
  }, []);

  const updateSessionWeather = useCallback((sessionId: string, weather: string) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, weather: weather || undefined } : s));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); updateSessionRow(tid, sessionId, { weather: weather || undefined }); }
  }, []);

  const updateSessionEntries = useCallback((sessionId: string, entries: LongSnapEntry[]) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, entries } : s));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); updateSessionRow(tid, sessionId, { entries }); }
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); softDeleteSession(tid, sessionId); }
  }, []);

  return (
    <LongSnapContext.Provider value={{
      athletes, stats, history, addAthletes, removeAthlete: removeAthleteAction, commitPractice, updateSessionWeather, updateSessionEntries, deleteSession,
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
