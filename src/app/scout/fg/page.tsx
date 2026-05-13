"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, type ScoutSession } from "@/lib/scoutStore";
import { exportFGScoutExcel, exportFGScoutPDF } from "@/lib/scoutExport";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface FGEntry {
  athlete: string;
  kickNum: number;
  distance: number;
  hash: string;
  pointValue: number;
  result: "make" | "miss";
  score: number;
}

export default function ScoutFGPage() {
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
      const sess = await loadScoutSessions(tid, "SCOUT_FG");
      if (!active) return;
      setSessions(sess);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  return (
    <>
      <Header title="FG Scouting" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 rounded-input border border-border overflow-hidden w-fit">
          <button
            onClick={() => setTab("chart")}
            className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}
          >
            Chart
          </button>
          <button
            onClick={() => setTab("rankings")}
            className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}
          >
            Rankings
          </button>
        </div>

        {tab === "chart" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new FG evaluation chart.</p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Link
                href="/scout/fg/chart?mode=preset"
                className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6"
              >
                <p className="text-2xl mb-2">📋</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Preset Chart</h3>
                <p className="text-[10px] text-muted mt-1">Use saved kick chart</p>
              </Link>
              <Link
                href="/scout/fg/chart?mode=manual"
                className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6"
              >
                <p className="text-2xl mb-2">✏️</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Manual Chart</h3>
                <p className="text-[10px] text-muted mt-1">Enter kicks on the fly</p>
              </Link>
            </div>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            {!loading && sessions.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => exportFGScoutExcel(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export Excel</button>
                <button onClick={() => exportFGScoutPDF(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export PDF</button>
              </div>
            )}
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No scout sessions yet. Start a chart to begin.</p>
            ) : (
              sessions.map((session) => {
                const entries = session.entries as unknown as FGEntry[];
                const athleteNames = [...new Set(entries.map((e) => e.athlete))];
                const kicks = [...new Set(entries.map((e) => e.kickNum))].sort((a, b) => a - b);
                const kickInfo = kicks.map((k) => {
                  const e = entries.find((en) => en.kickNum === k);
                  return { num: k, distance: e?.distance ?? 0, hash: e?.hash ?? "", pointValue: e?.pointValue ?? 0 };
                });

                const ranked = athleteNames
                  .map((name) => {
                    const ae = entries.filter((e) => e.athlete === name);
                    return { name, entries: ae, total: ae.reduce((s, e) => s + e.score, 0) };
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
                            {kickInfo.map((k) => (
                              <th key={k.num} className="text-[10px] text-muted text-center py-1 px-2">
                                {k.distance}yd {k.hash}
                                {k.pointValue > 1 && <span className="block text-[8px]">({k.pointValue}pt)</span>}
                              </th>
                            ))}
                            <th className="text-[10px] text-muted text-right py-1 px-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.map((r, i) => (
                            <tr key={r.name} className="border-t border-border/30">
                              <td className="py-1 px-2 font-semibold text-slate-200">
                                <span className="text-muted mr-1">{i + 1}.</span>
                                {r.name}
                              </td>
                              {kicks.map((k) => {
                                const e = r.entries.find((en) => en.kickNum === k);
                                return (
                                  <td key={k} className={clsx("text-center py-1 px-2 font-bold", e?.result === "make" ? "text-make" : "text-miss")}>
                                    {e ? e.score : "—"}
                                  </td>
                                );
                              })}
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
