"use client";

import React, {
  createContext, useContext, useState, useCallback, useEffect, useMemo,
} from "react";
import type { LongSnapEntry, LongSnapAthleteStats, Session } from "@/types";
import { emptyLongSnapStats, recomputeLongSnapStats, genId, sessionLabel } from "@/lib/stats";
import { localGet, setCloudUserId, getCloudKey } from "@/lib/amplify";
import { cloudGet } from "@/lib/supabaseData";
import { teamGet, getTeamId } from "@/lib/teamData";
import { insertSession, loadSessions, updateSession as updateSessionRow, softDeleteSession, useSessionSync, stampSessionWrite } from "@/lib/sessionStore";
import { loadAthletes, insertAthlete, removeAthlete as removeAthleteRow, useAthleteSync, stampAthleteWrite, type StoredAthlete } from "@/lib/athleteStore";
import { useAuth } from "@/lib/auth";

interface LongSnapStateData {
  athletes: string[];
  stats: Record<string, LongSnapAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

interface LongSnapContextValue {
  athletes: StoredAthlete[];
  stats: Record<string, LongSnapAthleteStats>;
  history: Session[];
  commitPractice: (entries: LongSnapEntry[], label?: string, weather?: string) => Session;
  updateSessionWeather: (sessionId: string, weather: string) => void;
  deleteSession: (sessionId: string) => void;
}

const LongSnapContext = createContext<LongSnapContextValue | null>(null);

export function LongSnapProvider({ children }: { children: React.ReactNode }) {
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
    const userId = user?.id;
    if (userId) setCloudUserId(userId);

    async function loadData() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }

      if (tid && tid !== "local-dev") {
        const dbAthletes = await loadAthletes(tid, "LONGSNAP");
        if (dbAthletes.length > 0) setAthletes(dbAthletes);
      }

      if (tid && tid !== "local-dev") {
        const dbSessions = await loadSessions(tid, "LONGSNAP");
        if (dbSessions.length > 0) { setSessions(dbSessions); return; }
      }

      // Migration
      let blob: LongSnapStateData | null = null;
      if (tid && tid !== "local-dev") blob = await teamGet<LongSnapStateData>(tid, "longsnap_data");
      if (!blob && userId && userId !== "local-dev") blob = await cloudGet<LongSnapStateData>(userId, getCloudKey("LONGSNAP"));
      if (!blob) blob = localGet<LongSnapStateData>("LONGSNAP");
      const localBlob = localGet<LongSnapStateData>("LONGSNAP");

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
          const existing = await loadAthletes(tid, "LONGSNAP");
          const existingNames = new Set(existing.map((a) => a.name));
          const inserted: StoredAthlete[] = [...existing];
          for (const name of athleteNames.filter((n) => !existingNames.has(n))) {
            const result = await insertAthlete(tid, "LONGSNAP", name);
            if (result) inserted.push(result);
          }
          setAthletes(inserted);
        }

        if (tid && tid !== "local-dev" && allSessions.length > 0) {
          for (const s of allSessions) await insertSession(tid, { ...s, sport: "LONGSNAP", teamId: tid });
          setSessions(await loadSessions(tid, "LONGSNAP"));
        } else {
          setSessions(allSessions);
        }
      }
    }

    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tid = getTeamId();
  useSessionSync(tid, "LONGSNAP", {
    onInsert: (s) => setSessions((prev) => prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())),
    onUpdate: (s) => setSessions((prev) => prev.map((x) => x.id === s.id ? s : x)),
    onDelete: (id) => setSessions((prev) => prev.filter((x) => x.id !== id)),
    onRestore: (s) => setSessions((prev) => prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())),
  });

  useAthleteSync(tid, "LONGSNAP", (dbAthletes) => setAthletes(dbAthletes));

  const commitPractice = useCallback((entries: LongSnapEntry[], label?: string, weather?: string): Session => {
    const tid = getTeamId();
    const session: Session = {
      id: genId(), teamId: tid ?? "local", sport: "LONGSNAP",
      label: label ?? sessionLabel(), date: new Date().toISOString(),
      weather: weather || undefined, entries,
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

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    const tid = getTeamId();
    if (tid && tid !== "local-dev") { stampSessionWrite(tid); softDeleteSession(tid, sessionId); }
  }, []);

  return (
    <LongSnapContext.Provider value={{
      athletes, stats, history, commitPractice, updateSessionWeather, deleteSession,
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
