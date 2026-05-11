"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadAthletes, type StoredAthlete } from "@/lib/athleteStore";
import { loadScoutSessions, type ScoutSession } from "@/lib/scoutStore";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface PuntEntry {
  athlete: string;
  kickNum: number;
  distance: number;
  hangTime: number;
  opTime: number;
  directionGood: boolean;
  score: number;
}

export default function ScoutPuntPage() {
  const [tab, setTab] = useState<"chart" | "rankings">("chart");
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }
      if (!tid || !active) return;
      const sess = await loadScoutSessions(tid, "SCOUT_PUNT");
      if (active) { setSessions(sess); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  return (
    <>
      <Header title="Punt Scouting" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex gap-1 rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new punt evaluation.</p>
            <Link href="/scout/punt/chart" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex items-center gap-4 py-4 px-5 max-w-md">
              <span className="text-2xl">📋</span>
              <div>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Start Punt Chart</h3>
                <p className="text-[10px] text-muted">Select athletes, set number of punts</p>
              </div>
            </Link>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No scout sessions yet.</p>
            ) : (
              sessions.map((session) => {
                const entries = session.entries as unknown as PuntEntry[];
                const athleteNames = [...new Set(entries.map((e) => e.athlete))];
                const maxKicks = Math.max(...athleteNames.map((n) => entries.filter((e) => e.athlete === n).length));
                const ranked = athleteNames
                  .map((name) => ({ name, entries: entries.filter((e) => e.athlete === name), total: entries.filter((e) => e.athlete === name).reduce((s, e) => s + e.score, 0) }))
                  .sort((a, b) => b.total - a.total);

                return (
                  <div key={session.id} className="card space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-100">{session.label}</p>
                      <p className="text-[10px] text-muted">{new Date(session.date).toLocaleDateString()}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                            {Array.from({ length: maxKicks }, (_, i) => (
                              <th key={i} className="text-[10px] text-muted text-center py-1 px-2">P{i + 1}</th>
                            ))}
                            <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.map((r, i) => (
                            <tr key={r.name} className="border-t border-border/30">
                              <td className="py-1 px-2 font-semibold text-slate-200"><span className="text-muted mr-1">{i + 1}.</span>{r.name}</td>
                              {r.entries.map((e, j) => (
                                <td key={j} className={clsx("text-center py-1 px-2", e.directionGood ? "text-make" : "text-miss")}>
                                  <span className="font-bold">{e.distance}</span>
                                  <span className="text-[9px] block">{e.hangTime.toFixed(2)}s</span>
                                </td>
                              ))}
                              {Array.from({ length: maxKicks - r.entries.length }, (_, j) => (
                                <td key={`empty-${j}`} className="text-center py-1 px-2 text-muted">—</td>
                              ))}
                              <td className="text-right py-1 px-2 font-black text-amber-400">{r.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </>
  );
}
