"use client";

import React, {
  createContext, useContext, useState, useCallback, useEffect, useMemo,
} from "react";
import type { KickoffEntry, KickoffAthleteStats, Session, SessionMode } from "@/types";
import { emptyKickoffStats, recomputeKickoffStats, genId, sessionLabel } from "@/lib/stats";
import { getTeamId } from "@/lib/teamData";
import { insertSession, loadSessions, updateSession as updateSessionRow, softDeleteSession, useSessionSync, stampSessionWrite } from "@/lib/sessionStore";
import { loadAthletes, insertAthlete, removeAthlete as removeAthleteRow, useAthleteSync, stampAthleteWrite, type StoredAthlete } from "@/lib/athleteStore";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settingsSync";

interface KickoffContextValue {
  athletes: StoredAthlete[];
  stats: Record<string, KickoffAthleteStats>;
  history: Session[];
  addAthletes: (names: string[]) => void;
  removeAthlete: (athleteId: string) => void;
  commitPractice: (entries: KickoffEntry[], label?: string, weather?: string, mode?: SessionMode, opponent?: string, gameTime?: string) => Session;
  resetStatsKeepAthletes: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  updateSessionOpponent: (sessionId: string, opponent: string) => void;
  updateSessionEntries: (sessionId: string, entries: KickoffEntry[]) => void;
  deleteSession: (sessionId: string) => void;
  restoreSession: (session: Session) => void;
}

const KickoffContext = createContext<KickoffContextValue | null>(null);

export function KickoffProvider({ children, sportKey = "KICKOFF" }: { children: React.ReactNode; sportKey?: string }) {
  const [athletes, setAthletes] = useState<StoredAthlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const { user } = useAuth();

  const koSettings = useSettings<{ kickoffTypes?: Record<string, unknown>[] }>("kickoffSettings");
  const koTypeConfigs = useMemo(() => {
    const types = koSettings?.kickoffTypes;
    if (types && types.length > 0) {
      return types.map((t) => ({
        id: t.id as string,
        metric: ((t.metric as string) ?? "distance") as "yardline" | "distance" | "none",
        hangTime: typeof t.hangTime === "boolean" ? t.hangTime : true,
      }));
    }
    return undefined;
  }, [koSettings]);

  const stats = useMemo(() => {
    const names = athletes.map((a) => a.name);
    return recomputeKickoffStats(
      names,
      sessions
        .filter((s) => s.mode !== "game")
        .map((s) => ({ entries: (s.entries as KickoffEntry[]) ?? [] })),
      koTypeConfigs
    );
  }, [athletes, sessions, koTypeConfigs]);

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
        setAthletes((prev) => [...prev, ...results.filter(Boolean) as StoredAthlete[]]);
      });
    } else {
      setAthletes((prev) => [...prev, ...toAdd.map((n) => ({ id: genId(), name: n.trim() }))]);
    }
  }, [athletes]);

  const removeAthleteAction = useCallback((athleteId: string) => {
    const tid = getTeamId();
    setAthletes((prev) => prev.filter((a) => a.id !== athleteId));
    if (tid && tid !== "local-dev") { stampAthleteWrite(tid); removeAthleteRow(tid, athleteId); }
  }, []);

  const commitPractice = useCallback((entries: KickoffEntry[], label?: string, weather?: string, mode: SessionMode = "practice", opponent?: string, gameTime?: string): Session => {
    const tid = getTeamId();
    const session: Session = {
      id: genId(), teamId: tid ?? "local", sport: sportKey as Session["sport"],
      label: label ?? sessionLabel(), date: new Date().toISOString(),
      weather: weather || undefined, mode,
      opponent: opponent || undefined, gameTime: gameTime || undefined, entries,
    };
    setSessions((prev) => [...prev, session]);
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); insertSession(tid, session); }
    return session;
  }, []);

  const updateSessionDate = useCallback((sessionId: string, date: string, label: string) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, date, label } : s));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); updateSessionRow(tid, sessionId, { date, label }); }
  }, []);

  const updateSessionWeather = useCallback((sessionId: string, weather: string) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, weather: weather || undefined } : s));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); updateSessionRow(tid, sessionId, { weather: weather || undefined }); }
  }, []);

  const updateSessionOpponent = useCallback((sessionId: string, opponent: string) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, opponent: opponent || undefined } : s));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); updateSessionRow(tid, sessionId, { opponent: opponent || undefined }); }
  }, []);

  const updateSessionEntries = useCallback((sessionId: string, entries: KickoffEntry[]) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, entries } : s));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); updateSessionRow(tid, sessionId, { entries }); }
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); softDeleteSession(tid, sessionId); }
  }, []);

  const restoreSessionAction = useCallback((session: Session) => {
    setSessions((prev) => {
      if (prev.some((s) => s.id === session.id)) return prev;
      return [...prev, session].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); insertSession(tid, { ...session, sport: sportKey as Session["sport"], teamId: tid }); }
  }, []);

  const resetStatsKeepAthletes = useCallback(() => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); sessions.forEach((s) => softDeleteSession(tid, s.id)); }
    setSessions([]);
  }, [sessions]);

  return (
    <KickoffContext.Provider value={{
      athletes, stats, history, addAthletes, removeAthlete: removeAthleteAction,
      commitPractice, resetStatsKeepAthletes, updateSessionDate, updateSessionWeather, updateSessionOpponent,
      updateSessionEntries, deleteSession, restoreSession: restoreSessionAction,
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
