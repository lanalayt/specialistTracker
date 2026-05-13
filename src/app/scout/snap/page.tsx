"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSession, loadScoutProfiles, saveScoutProfiles, type ScoutSession, type ScoutProfile } from "@/lib/scoutStore";
import { exportSnapScoutExcel, exportSnapScoutPDF } from "@/lib/scoutExport";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { HolderStrikeZone } from "@/components/ui/HolderStrikeZone";
import { PunterStrikeZone } from "@/components/ui/PunterStrikeZone";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface SnapEntry {
  athlete: string;
  points?: number;
  score?: number;
  accuracy?: string;
  laces?: string;
  spiral?: string;
  time?: string;
  markerX?: number;
  markerY?: number;
  markerInZone?: boolean;
}

interface RankedRow {
  name: string;
  sessionId: string;
  sessionLabel: string;
  date: string;
  count: number;
  total: number;
  entries: SnapEntry[];
  is30Point: boolean;
}

export default function ScoutSnapPage() {
  const [tab, setTab] = useState<"chart" | "rankings">("chart");
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<RankedRow | null>(null);

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

  const ranked: RankedRow[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as SnapEntry[];
    const is30Point = s.label.startsWith("30 Point");
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const total = ae.reduce((sum, e) => sum + (e.points ?? e.score ?? 0), 0);
      ranked.push({ name, sessionId: s.id, sessionLabel: s.label, date: s.date, count: ae.length, total, entries: ae, is30Point });
    }
  }
  ranked.sort((a, b) => b.total - a.total);

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
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Short Snaps</h3>
                <p className="text-[10px] text-muted mt-1">Strike + Laces + Spiral</p>
              </Link>
              <Link href="/scout/snap/balls-strikes" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">⚾</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Long Snaps</h3>
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
                        <tr key={`${r.sessionId}-${r.name}`} className="border-t border-border/30">
                          <td className="py-1 px-2 font-semibold text-slate-200">
                            <span className="text-muted mr-1">{i + 1}.</span>
                            <button onClick={() => setProfileOpen(r.name)} className="hover:text-amber-400 transition-colors underline decoration-dotted">{r.name}</button>
                          </td>
                          <td className="text-center py-1 px-2 text-slate-300">{r.count}</td>
                          <td className="text-right py-1 px-2">
                            <button onClick={() => setDetailOpen(r)} className="font-black text-amber-400 hover:underline">{r.total}</button>
                          </td>
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

      {/* Detail modal — strike zone + snap summary */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailOpen(null)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100">{detailOpen.name}</h3>
                <p className="text-[10px] text-muted">{detailOpen.is30Point ? "Short Snaps" : "Long Snaps"} — {new Date(detailOpen.date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setDetailOpen(null)} className="text-muted hover:text-white text-xs transition-colors">Close</button>
            </div>

            {/* Score */}
            <div className="text-center">
              <p className="text-3xl font-black text-amber-400">{detailOpen.total}</p>
              <p className="text-xs text-muted">{detailOpen.is30Point ? `/ ${detailOpen.count * 3}` : `${detailOpen.total} / ${detailOpen.count} strikes`}</p>
            </div>

            {/* Strike zone diagram */}
            <div className="max-w-[250px] mx-auto">
              {detailOpen.is30Point ? (
                <HolderStrikeZone
                  markers={detailOpen.entries
                    .filter((e) => e.markerX != null && e.markerY != null)
                    .map((e, i) => ({ x: e.markerX!, y: e.markerY!, inZone: e.markerInZone ?? false, num: i + 1 }))}
                />
              ) : (
                <PunterStrikeZone
                  markers={detailOpen.entries
                    .filter((e) => e.markerX != null && e.markerY != null)
                    .map((e, i) => ({ x: e.markerX!, y: e.markerY!, inZone: e.accuracy === "Strike", num: i + 1 }))}
                />
              )}
            </div>

            {/* Snap-by-snap table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                    <th className="text-[10px] text-muted text-center py-1 px-1">{detailOpen.is30Point ? "Loc" : "Call"}</th>
                    {detailOpen.is30Point && <th className="text-[10px] text-muted text-center py-1 px-1">Laces</th>}
                    {!detailOpen.is30Point && <th className="text-[10px] text-muted text-center py-1 px-1">Time</th>}
                    <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                    <th className="text-[10px] text-muted text-right py-1 px-1">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {detailOpen.entries.map((e, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-1">{i + 1}</td>
                      <td className={clsx("text-center py-1 px-1 font-semibold", e.accuracy === "Strike" ? "text-make" : "text-miss")}>{e.accuracy}</td>
                      {detailOpen.is30Point && (
                        <td className={clsx("text-center py-1 px-1", e.laces === "Good" ? "text-make" : e.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>
                          {e.laces === "Good" ? "Perfect" : e.laces}
                        </td>
                      )}
                      {!detailOpen.is30Point && (
                        <td className="text-center py-1 px-1 text-slate-300">{e.time || "—"}</td>
                      )}
                      <td className={clsx("text-center py-1 px-1", e.spiral === "Good" ? "text-make" : "text-miss")}>
                        {e.spiral === "Good" ? "Tight" : "Open"}
                      </td>
                      <td className="text-right py-1 px-1 font-bold text-amber-400">{e.points ?? e.score ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
