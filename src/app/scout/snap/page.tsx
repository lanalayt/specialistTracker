"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSessions, loadScoutProfiles, saveScoutProfiles, type ScoutSession, type ScoutProfile } from "@/lib/scoutStore";
import { exportSnapScoutExcel, exportSnapScoutPDF } from "@/lib/scoutExport";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

export default function ScoutSnapPage() {
  const [tab, setTab] = useState<"chart" | "rankings">("chart");
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
    if (!tid) return;
    const [sess, prof] = await Promise.all([loadScoutSessions(tid, "SCOUT_SNAP"), loadScoutProfiles(tid)]);
    setSessions(sess);
    setProfiles(prof);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const allEntries = sessions.flatMap((s) => s.entries as unknown as { athlete: string; points?: number; score?: number; accuracy?: string }[]);
  const athleteNames = [...new Set(allEntries.map((e) => e.athlete))];
  const ranked = athleteNames
    .map((name) => {
      const ae = allEntries.filter((e) => e.athlete === name);
      const total = ae.reduce((s, e) => s + (e.points ?? e.score ?? 0), 0);
      return { name, count: ae.length, total };
    })
    .sort((a, b) => b.total - a.total);

  const handleDeleteAthlete = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete all data for ${name}? This cannot be undone.`)) return;
    const tid = getTeamId();
    if (!tid) return;
    await deleteAthleteFromSessions(tid, "SCOUT_SNAP", name);
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
            {!loading && ranked.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => exportSnapScoutExcel(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export Excel</button>
                <button onClick={() => exportSnapScoutPDF(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export PDF</button>
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
                        <th className="text-[10px] text-muted text-center py-1 px-2">Snaps</th>
                        <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => (
                        <tr key={r.name} className="border-t border-border/30">
                          <td className="py-1 px-2 font-semibold text-slate-200">
                            <span className="text-muted mr-1">{i + 1}.</span>
                            <button onClick={() => setProfileOpen(r.name)} className="hover:text-amber-400 transition-colors underline decoration-dotted">{r.name}</button>
                          </td>
                          <td className="text-center py-1 px-2 text-slate-300">{r.count}</td>
                          <td className="text-right py-1 px-2 font-black text-amber-400">{r.total}</td>
                          <td className="text-center py-1 px-1">
                            <button onClick={() => handleDeleteAthlete(r.name)} className="text-[10px] text-muted hover:text-miss transition-colors">&times;</button>
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
