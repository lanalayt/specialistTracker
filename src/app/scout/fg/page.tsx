"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSession, loadScoutProfiles, saveScoutProfiles, type ScoutSession, type ScoutProfile } from "@/lib/scoutStore";
import { createClient } from "@/lib/supabase";
import { exportFGScoutExcel, exportFGScoutPDF } from "@/lib/scoutExport";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface FGEntry { athlete: string; kickNum: number; distance: number; hash: string; pointValue: number; result: "make" | "miss"; score: number }

export default function ScoutFGPage() {
  const [tab, setTab] = useState<"chart" | "rankings">("chart");
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
    if (!tid) return;
    const [sess, prof] = await Promise.all([loadScoutSessions(tid, "SCOUT_FG"), loadScoutProfiles(tid)]);
    setSessions(sess);
    setProfiles(prof);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Build per-session-per-athlete rows
  const athleteData: { name: string; sessionId: string; date: string; entries: FGEntry[]; total: number; makes: number; att: number }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as FGEntry[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const total = ae.reduce((sum, e) => sum + e.score, 0);
      const makes = ae.filter((e) => e.result === "make").length;
      athleteData.push({ name, sessionId: s.id, date: s.date, entries: ae, total, makes, att: ae.length });
    }
  }
  athleteData.sort((a, b) => b.total - a.total);
  const maxKicks = athleteData.length > 0 ? Math.max(...athleteData.map((a) => a.entries.length)) : 0;

  const handleToggleKick = async (sessionId: string, athleteName: string, kickIdx: number) => {
    const tid = getTeamId();
    if (!tid) return;
    const sess = sessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const allEntries = [...sess.entries] as unknown as FGEntry[];
    const athleteEntries = allEntries.filter((e) => e.athlete === athleteName);
    const entry = athleteEntries[kickIdx];
    if (!entry) return;
    entry.result = entry.result === "make" ? "miss" : "make";
    entry.score = entry.result === "make" ? entry.pointValue : 0;
    try {
      const supabase = createClient();
      await supabase.from("sessions").update({ entries: allEntries, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", sessionId);
    } catch {}
    await loadData();
  };

  const handleDeleteRow = async (name: string, sessionId: string) => {
    if (!window.confirm(`Are you sure you want to delete this chart for ${name}? This cannot be undone.`)) return;
    const tid = getTeamId();
    if (!tid) return;
    await deleteAthleteFromSession(tid, sessionId, name);
    await loadData();
  };

  const handleSaveProfile = async (profile: ScoutProfile, originalName?: string) => {
    const tid = getTeamId();
    if (!tid) return;
    const updated = { ...profiles };
    if (originalName && originalName !== profile.name) delete updated[originalName];
    updated[profile.name] = profile;
    setProfiles(updated);
    await saveScoutProfiles(tid, updated);
    setProfileOpen(null);
  };

  return (
    <>
      <Header title="FG Scouting" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new FG evaluation chart.</p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Link href="/scout/fg/chart?mode=preset" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">📋</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Preset Chart</h3>
                <p className="text-[10px] text-muted mt-1">Use saved kick chart</p>
              </Link>
              <Link href="/scout/fg/chart?mode=manual" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">✏️</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Manual Chart</h3>
                <p className="text-[10px] text-muted mt-1">Enter kicks on the fly</p>
              </Link>
            </div>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            {!loading && athleteData.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => exportFGScoutExcel(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export Excel</button>
                <button onClick={() => exportFGScoutPDF(sessions)} className="text-xs px-3 py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Export PDF</button>
              </div>
            )}
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : athleteData.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No scout sessions yet. Start a chart to begin.</p>
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
                        <th className="text-[10px] text-muted text-right py-1 px-2">Total</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {athleteData.map((r, i) => (
                        <tr key={`${r.sessionId}-${r.name}`} className="border-t border-border/30">
                          <td className="py-1 px-2 font-semibold text-slate-200">
                            <span className="text-muted mr-1">{i + 1}.</span>
                            <button onClick={() => setProfileOpen(r.name)} className="hover:text-amber-400 transition-colors underline decoration-dotted">{r.name}</button>
                          </td>
                          {r.entries.map((e, j) => (
                            <td key={j} className="text-center py-1 px-2">
                              <button onClick={() => handleToggleKick(r.sessionId, r.name, j)} className={clsx("font-bold hover:opacity-70 transition-opacity", e.result === "make" ? "text-make" : "text-miss")}>
                                {e.score}
                              </button>
                            </td>
                          ))}
                          {Array.from({ length: maxKicks - r.entries.length }, (_, j) => (
                            <td key={`e-${j}`} className="text-center py-1 px-2 text-muted">—</td>
                          ))}
                          <td className="text-right py-1 px-2 font-black text-amber-400">{r.total}</td>
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
