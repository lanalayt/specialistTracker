"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadSessions } from "@/lib/sessionStore";
import type { LongSnapEntry, Session } from "@/types";
import clsx from "clsx";

export default function AthleteSnapHubPage() {
  const [tab, setTab] = useState<"short" | "long">("short");
  const [shortSessions, setShortSessions] = useState<Session[]>([]);
  const [longSessions, setLongSessions] = useState<Session[]>([]);

  useEffect(() => {
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
      if (!tid) return;
      const [ss, ls] = await Promise.all([
        loadSessions(tid, "ATHLETE_SHORTSNAP"),
        loadSessions(tid, "ATHLETE_LONGSNAP"),
      ]);
      setShortSessions(ss);
      setLongSessions(ls);
    }
    load();
  }, []);

  const sessions = tab === "short" ? shortSessions : longSessions;

  return (
    <main className="p-4 lg:p-6 max-w-4xl space-y-4">
      <h1 className="text-xl font-extrabold text-slate-100">Snapping</h1>
      <p className="text-xs text-muted">Short snaps are recorded from FG sessions. Long snaps from punt sessions.</p>

      <div className="flex rounded-input border border-border overflow-hidden w-fit">
        <button onClick={() => setTab("short")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", tab === "short" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Short Snaps</button>
        <button onClick={() => setTab("long")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "long" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Long Snaps</button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">
          No {tab === "short" ? "short" : "long"} snap data yet. {tab === "short" ? "Use the snap button in FG charting to log short snaps." : "Use the snap button in punt charting to log long snaps."}
        </p>
      ) : (
        <div className="space-y-2">
          {[...sessions].reverse().map((s) => {
            const entries = (s.entries ?? []) as LongSnapEntry[];
            const athletes = [...new Set(entries.map((e) => e.athlete))];
            return (
              <div key={s.id} className="card-2 py-3 px-4">
                <p className="text-sm font-semibold text-slate-100">{s.label}</p>
                <p className="text-[10px] text-muted">{new Date(s.date).toLocaleDateString()} — {entries.length} snap{entries.length !== 1 ? "s" : ""}</p>
                {athletes.map((a) => {
                  const ae = entries.filter((e) => e.athlete === a);
                  const avgTime = ae.filter((e) => e.time > 0).length > 0
                    ? (ae.filter((e) => e.time > 0).reduce((sum, e) => sum + e.time, 0) / ae.filter((e) => e.time > 0).length).toFixed(2)
                    : "—";
                  return (
                    <div key={a} className="flex items-center gap-3 text-xs mt-1">
                      <span className="text-slate-200 font-semibold">{a}</span>
                      <span className="text-muted">{ae.length} snaps</span>
                      <span className="text-muted">Avg: {avgTime}s</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
