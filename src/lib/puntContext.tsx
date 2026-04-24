"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import type { PuntEntry, PuntAthleteStats, Session, SessionMode } from "@/types";
import {
  emptyPuntStats,
  recomputePuntStats,
  genId,
  sessionLabel,
} from "@/lib/stats";
import { localGet, localSet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { teamGet, getTeamId } from "@/lib/teamData";
import { insertSession, loadSessions, updateSession as updateSessionRow, softDeleteSession, useSessionSync, stampSessionWrite } from "@/lib/sessionStore";
import { loadAthletes, insertAthlete, removeAthlete as removeAthleteRow, useAthleteSync, stampAthleteWrite, type StoredAthlete } from "@/lib/athleteStore";
import { useAuth } from "@/lib/auth";

interface PuntStateData {
  athletes: string[];
  stats: Record<string, PuntAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface PuntContextValue {
  athletes: StoredAthlete[];
  stats: Record<string, PuntAthleteStats>;
  history: Session[];
  addAthletes: (names: string[]) => void;
  removeAthlete: (athleteId: string) => void;
  commitPractice: (entries: PuntEntry[], label?: string, weather?: string, mode?: SessionMode, opponent?: string, gameTime?: string) => Session;
  resetStatsKeepAthletes: () => void;
  updateSessionDate: (sessionId: string, date: string, label: string) => void;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  updateSessionEntries: (sessionId: string, entries: PuntEntry[]) => void;
  deleteSession: (sessionId: string) => void;
  restoreSession: (session: Session) => void;
}

const PuntContext = createContext<PuntContextValue | null>(null);

export function PuntProvider({ children }: { children: React.ReactNode }) {
  const [athletes, setAthletes] = useState<StoredAthlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const { user } = useAuth();

  // Load punt type configs for stats computation
  const typeConfigs = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const raw = localStorage.getItem("puntSettings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.puntTypes?.length > 0) {
          return parsed.puntTypes.map((t: Record<string, unknown>) => ({
            id: t.id as string,
            metric: (t.metric as string) ?? (String(t.id).toUpperCase().includes("POOCH") ? "yardline" : "distance"),
            hangTime: typeof t.hangTime === "boolean" ? t.hangTime : !String(t.id).toUpperCase().includes("POOCH"),
          }));
        }
      }
    } catch {}
    return undefined;
  }, []);

  const stats = useMemo(() => {
    const names = athletes.map((a) => a.name);
    return recomputePuntStats(
      names,
      sessions
        .filter((s) => s.mode !== "game")
        .map((s) => ({ punts: (s.entries as PuntEntry[]) ?? [] })),
      typeConfigs
    );
  }, [athletes, sessions, typeConfigs]);

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

      if (tid && tid !== "local-dev") {
        const dbAthletes = await loadAthletes(tid, "PUNTING");
        if (dbAthletes.length > 0) setAthletes(dbAthletes);
      }

      if (tid && tid !== "local-dev") {
        const dbSessions = await loadSessions(tid, "PUNTING");
        if (dbSessions.length > 0) {
          setSessions(dbSessions);
          return;
        }
      }

      // Migration
      let blob: PuntStateData | null = null;
      if (tid && tid !== "local-dev") blob = await teamGet<PuntStateData>(tid, "punt_data");
      if (!blob && userId && userId !== "local-dev") blob = await cloudGet<PuntStateData>(userId, getCloudKey("PUNT"));
      if (!blob) blob = localGet<PuntStateData>("PUNT");
      const localBlob = localGet<PuntStateData>("PUNT");

      if (blob || localBlob) {
        const source = blob ?? localBlob!;
        const sessionMap = new Map<string, Session>();
        for (const s of (localBlob?.history ?? [])) sessionMap.set(s.id, s);
        for (const s of (blob?.history ?? [])) {
          const ex = sessionMap.get(s.id);
          if (!ex || (Array.isArray(s.entries) ? s.entries.length : 0) >= (Array.isArray(ex.entries) ? ex.entries.length : 0))
            sessionMap.set(s.id, s);
        }
        const allSessions = Array.from(sessionMap.values()).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        const athleteNames = source.athletes ?? [];
        if (tid && tid !== "local-dev" && athleteNames.length > 0) {
          const existing = await loadAthletes(tid, "PUNTING");
          const existingNames = new Set(existing.map((a) => a.name));
          const inserted: StoredAthlete[] = [...existing];
          for (const name of athleteNames.filter((n) => !existingNames.has(n))) {
            const result = await insertAthlete(tid, "PUNTING", name);
            if (result) inserted.push(result);
          }
          setAthletes(inserted);
        }

        if (tid && tid !== "local-dev" && allSessions.length > 0) {
          for (const s of allSessions) await insertSession(tid, { ...s, sport: "PUNTING", teamId: tid });
          setSessions(await loadSessions(tid, "PUNTING"));
        } else {
          setSessions(allSessions);
        }
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tid = getTeamId();
  useSessionSync(tid, "PUNTING", {
    onInsert: (s) => setSessions((prev) => prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())),
    onUpdate: (s) => setSessions((prev) => prev.map((x) => x.id === s.id ? s : x)),
    onDelete: (id) => setSessions((prev) => prev.filter((x) => x.id !== id)),
    onRestore: (s) => setSessions((prev) => prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())),
  });

  useAthleteSync(tid, "PUNTING", (dbAthletes) => setAthletes(dbAthletes));

  const addAthletes = useCallback((names: string[]) => {
    const tid = getTeamId();
    const existing = new Set(athletes.map((a) => a.name));
    const toAdd = names.filter((n) => n.trim() && !existing.has(n.trim()));
    if (toAdd.length === 0) return;
    if (tid && tid !== "local-dev") {
      stampAthleteWrite(tid);
      Promise.all(toAdd.map((n) => insertAthlete(tid, "PUNTING", n))).then((results) => {
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

  const commitPractice = useCallback((entries: PuntEntry[], label?: string, weather?: string, mode: SessionMode = "practice", opponent?: string, gameTime?: string): Session => {
    const tid = getTeamId();
    const session: Session = {
      id: genId(), teamId: tid ?? "local", sport: "PUNTING",
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

  const updateSessionEntries = useCallback((sessionId: string, entries: PuntEntry[]) => {
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
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); insertSession(tid, { ...session, sport: "PUNTING", teamId: tid }); }
  }, []);

  const resetStatsKeepAthletes = useCallback(() => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); sessions.forEach((s) => softDeleteSession(tid, s.id)); }
    setSessions([]);
  }, [sessions]);

  return (
    <PuntContext.Provider value={{
      athletes, stats, history, addAthletes, removeAthlete: removeAthleteAction,
      commitPractice, resetStatsKeepAthletes, updateSessionDate, updateSessionWeather,
      updateSessionEntries, deleteSession, restoreSession: restoreSessionAction,
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
