"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, type ScoutSession } from "@/lib/scoutStore";
import { exportSnapScoutExcel, exportSnapScoutPDF } from "@/lib/scoutExport";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

export default function ScoutSnapPage() {
  const [tab, setTab] = useState<"chart" | "rankings">("chart");
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid || !active) return;
      const sess = await loadScoutSessions(tid, "SCOUT_SNAP");
      if (active) { setSessions(sess); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, []);

  return (
    <>
      <Header title="Snap Scouting" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex gap-1 rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new snapping evaluation.</p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Link href="/scout/snap/30-point" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">🎯</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">30 Point Game</h3>
                <p className="text-[10px] text-muted mt-1">Strike + Laces + Spiral</p>
              </Link>
              <Link href="/scout/snap/balls-strikes" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">⚾</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Balls & Strikes</h3>
                <p className="text-[10px] text-muted mt-1">Accuracy + Time + Spiral</p>
              </Link>
            </div>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            {!loading && sessions.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => exportSnapScoutExcel(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export Excel</button>
                <button onClick={() => exportSnapScoutPDF(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export PDF</button>
              </div>
            )}
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No scout sessions yet.</p>
            ) : (
              sessions.map((session) => {
                const entries = session.entries as unknown as { athlete: string; points?: number; score?: number; accuracy?: string }[];
                const athleteNames = [...new Set(entries.map((e) => e.athlete))];
                const ranked = athleteNames
                  .map((name) => {
                    const ae = entries.filter((e) => e.athlete === name);
                    const total = ae.reduce((s, e) => s + (e.points ?? e.score ?? 0), 0);
                    return { name, count: ae.length, total };
                  })
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
                            <th className="text-[10px] text-muted text-center py-1 px-2">Snaps</th>
                            <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.map((r, i) => (
                            <tr key={r.name} className="border-t border-border/30">
                              <td className="py-1 px-2 font-semibold text-slate-200"><span className="text-muted mr-1">{i + 1}.</span>{r.name}</td>
                              <td className="text-center py-1 px-2 text-slate-300">{r.count}</td>
                              <td className="text-right py-1 px-2 font-black text-amber-400">{r.total}</td>
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
