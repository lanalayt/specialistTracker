"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSession, loadScoutProfiles, saveScoutProfiles, type ScoutSession, type ScoutProfile } from "@/lib/scoutStore";
import { exportKOScoutExcel, exportKOScoutPDF } from "@/lib/scoutExport";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface KOEntry { athlete: string; kickNum: number; distance: number; hangTime: number; directionGood: boolean; score: number; dropWorst?: boolean }

function calcAvg(scores: number[], dropWorst: boolean): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  if (!dropWorst) return parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
  const sorted = [...scores].sort((a, b) => a - b);
  const best = sorted.slice(1);
  return parseFloat((best.reduce((s, v) => s + v, 0) / best.length).toFixed(2));
}

export default function ScoutKOPage() {
  const [tab, setTab] = useState<"chart" | "rankings">("chart");
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
    if (!tid) return;
    const [sess, prof] = await Promise.all([loadScoutSessions(tid, "SCOUT_KO"), loadScoutProfiles(tid)]);
    setSessions(sess);
    setProfiles(prof);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Build per-session-per-athlete rows
  const ranked: { name: string; sessionId: string; date: string; entries: KOEntry[]; avg: number; worst: number | null }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as KOEntry[];
    const dw = entries[0]?.dropWorst ?? false;
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const scores = ae.map((e) => e.score);
      const worst = dw && scores.length > 1 ? Math.min(...scores) : null;
      ranked.push({ name, sessionId: s.id, date: s.date, entries: ae, avg: calcAvg(scores, dw), worst });
    }
  }
  ranked.sort((a, b) => b.avg - a.avg);
  const maxKicks = ranked.length > 0 ? Math.max(...ranked.map((r) => r.entries.length)) : 0;

  const handleDeleteRow = async (name: string, sessionId: string) => {
    if (!window.confirm(`Are you sure you want to delete this chart for ${name}? This cannot be undone.`)) return;
    const tid = getTeamId();
    if (!tid) return;
    await deleteAthleteFromSession(tid, sessionId, name);
    await loadData();
  };

  const handleSaveProfile = async (profile: ScoutProfile) => {
    const tid = getTeamId();
    if (!tid) return;
    const updated = { ...profiles, [profile.name]: profile };
    setProfiles(updated);
    await saveScoutProfiles(tid, updated);
    setProfileOpen(null);
  };

  return (
    <>
      <Header title="KO Scouting" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new kickoff evaluation.</p>
            <Link href="/scout/kickoff/chart" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex items-center gap-4 py-4 px-5 max-w-md">
              <span className="text-2xl">📋</span>
              <div>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Start KO Chart</h3>
                <p className="text-[10px] text-muted">Select athletes, set number of kicks</p>
              </div>
            </Link>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            {!loading && ranked.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => exportKOScoutExcel(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export Excel</button>
                <button onClick={() => exportKOScoutPDF(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export PDF</button>
              </div>
            )}
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : ranked.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No scout data yet.</p>
            ) : (
              <div className="card space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                        {Array.from({ length: maxKicks }, (_, i) => (
                          <th key={i} className="text-[10px] text-muted text-center py-1 px-2">K{i + 1}</th>
                        ))}
                        <th className="text-[10px] text-muted text-right py-1 px-2">Avg</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => (
                        <tr key={`${r.sessionId}-${r.name}`} className="border-t border-border/30">
                          <td className="py-1 px-2 font-semibold text-slate-200">
                            <span className="text-muted mr-1">{i + 1}.</span>
                            <button onClick={() => setProfileOpen(r.name)} className="hover:text-amber-400 transition-colors underline decoration-dotted">{r.name}</button>
                          </td>
                          {r.entries.map((e, j) => {
                            const isDropped = r.worst !== null && e.score === r.worst && j === r.entries.findIndex((x) => x.score === r.worst);
                            return (
                              <td key={j} className={clsx("text-center py-1 px-2", isDropped ? "opacity-40 line-through" : "", e.directionGood ? "text-make" : "text-miss")}>
                                <span className="font-bold">{e.distance}</span>
                                <span className="text-[9px] block">{e.hangTime.toFixed(2)}s</span>
                              </td>
                            );
                          })}
                          {Array.from({ length: maxKicks - r.entries.length }, (_, j) => (
                            <td key={`e-${j}`} className="text-center py-1 px-2 text-muted">—</td>
                          ))}
                          <td className="text-right py-1 px-2 font-black text-amber-400">{r.avg.toFixed(2)}</td>
                          <td className="text-center py-1 px-1">
                            <button onClick={() => handleDeleteRow(r.name, r.sessionId)} className="text-[10px] text-muted hover:text-miss transition-colors">&times;</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {profileOpen && (
        <ScoutProfileModal
          profile={profiles[profileOpen] ?? { name: profileOpen }}
          onSave={handleSaveProfile}
          onClose={() => setProfileOpen(null)}
        />
      )}
    </>
  );
}
