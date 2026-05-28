"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSession, loadScoutProfiles, saveScoutProfiles, insertScoutSession, loadScoutAthletes, saveScoutAthletes, type ScoutSession, type ScoutProfile } from "@/lib/scoutStore";
import { createClient } from "@/lib/supabase";
import { exportPuntScoutExcel, exportPuntScoutPDF } from "@/lib/scoutExport";
import { ExportButton } from "@/components/ui/ExportButton";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface PuntEntry { athlete: string; kickNum: number; distance: number; hangTime: number; opTime: number; directionGood: boolean; score: number; dropWorst?: boolean }

function calcAvg(scores: number[], dropWorst: boolean): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  if (!dropWorst) return parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
  const sorted = [...scores].sort((a, b) => a - b);
  const best = sorted.slice(1);
  return parseFloat((best.reduce((s, v) => s + v, 0) / best.length).toFixed(2));
}

const parseHangRaw = (raw: string): number => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
};

export default function ScoutPuntPage() {
  const [tab, setTab] = useState<"chart" | "rankings">("chart");
  const [liveMode, setLiveMode] = useState(false);
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);
  const [dropWorst, setDropWorst] = useState(true);
  const [editCell, setEditCell] = useState<{ sessionId: string; name: string; kickIdx: number } | null>(null);
  const [editDist, setEditDist] = useState("");
  const [editHang, setEditHang] = useState("");
  const [editDir, setEditDir] = useState(true);

  // Live input state
  const [liveAthletes, setLiveAthletes] = useState<string[]>([]);
  const [liveAthlete, setLiveAthlete] = useState("");
  const [newLiveAthlete, setNewLiveAthlete] = useState("");
  const [liveDistInput, setLiveDistInput] = useState("");
  const [liveHangInput, setLiveHangInput] = useState("");
  const [liveOpInput, setLiveOpInput] = useState("");
  const [liveDirGood, setLiveDirGood] = useState(true);
  const [livePunts, setLivePunts] = useState<{ athlete: string; distance: number; hangTime: number; opTime: number; directionGood: boolean; score: number }[]>([]);

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
    if (!tid) return;
    const [sess, prof] = await Promise.all([loadScoutSessions(tid, "SCOUT_PUNT"), loadScoutProfiles(tid)]);
    setSessions(sess);
    setProfiles(prof);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    async function loadLiveAthletes() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const names = await loadScoutAthletes(tid, "punt");
      setLiveAthletes(names);
      if (names.length > 0 && !liveAthlete) setLiveAthlete(names[0]);
    }
    loadLiveAthletes();
  }, []);

  const addLiveAthlete = async () => {
    const trimmed = newLiveAthlete.trim();
    if (!trimmed || liveAthletes.includes(trimmed)) return;
    const updated = [...liveAthletes, trimmed];
    setLiveAthletes(updated);
    setNewLiveAthlete("");
    if (!liveAthlete) setLiveAthlete(trimmed);
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "punt", updated);
  };

  const handleLiveLog = () => {
    const dist = parseInt(liveDistInput);
    const hang = parseHangRaw(liveHangInput);
    const op = parseHangRaw(liveOpInput);
    if (isNaN(dist) || dist <= 0 || !hang || !liveAthlete) return;
    const score = parseFloat((dist + hang * 15 + (liveDirGood ? 0 : -10)).toFixed(2));
    setLivePunts((prev) => [...prev, { athlete: liveAthlete, distance: dist, hangTime: hang, opTime: op, directionGood: liveDirGood, score }]);
    setLiveDistInput("");
    setLiveHangInput("");
    setLiveOpInput("");
    setLiveDirGood(true);
  };

  const handleLiveSave = async () => {
    if (livePunts.length === 0) return;
    const tid = getTeamId();
    if (!tid) return;
    const athletes = [...new Set(livePunts.map((p) => p.athlete))];
    const label = `Punt Scout — ${athletes.map((a) => { const ap = livePunts.filter((p) => p.athlete === a); return `${a}: ${calcAvg(ap.map((p) => p.score), true).toFixed(2)}`; }).join(", ")}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_PUNT",
      label,
      date: new Date().toISOString(),
      entries: livePunts.map((p, i) => ({ ...p, kickNum: i + 1, dropWorst: true })) as unknown as Record<string, unknown>[],
    });
    setLivePunts([]);
    await loadData();
  };

  // Build per-session-per-athlete rows
  const ranked: { name: string; sessionId: string; date: string; entries: PuntEntry[]; avg: number; worst: number | null }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as PuntEntry[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const scores = ae.map((e) => e.score);
      const worst = dropWorst && scores.length > 1 ? Math.min(...scores) : null;
      ranked.push({ name, sessionId: s.id, date: s.date, entries: ae, avg: calcAvg(scores, dropWorst), worst });
    }
  }
  ranked.sort((a, b) => b.avg - a.avg);
  const maxKicks = ranked.length > 0 ? Math.max(...ranked.map((r) => r.entries.length)) : 0;

  const startEditKick = (sessionId: string, name: string, kickIdx: number, entry: PuntEntry) => {
    setEditCell({ sessionId, name, kickIdx });
    setEditDist(String(entry.distance));
    setEditHang(String(entry.hangTime));
    setEditDir(entry.directionGood);
  };

  const saveEditKick = async () => {
    if (!editCell) return;
    const tid = getTeamId();
    if (!tid) return;
    const sess = sessions.find((s) => s.id === editCell.sessionId);
    if (!sess) return;
    const allEntries = [...sess.entries] as unknown as PuntEntry[];
    const athleteEntries = allEntries.filter((e) => e.athlete === editCell.name);
    const entry = athleteEntries[editCell.kickIdx];
    if (!entry) return;
    const dist = parseInt(editDist) || entry.distance;
    const hang = parseFloat(editHang) || entry.hangTime;
    entry.distance = dist;
    entry.hangTime = hang;
    entry.directionGood = editDir;
    entry.score = parseFloat((dist + hang * 15 + (editDir ? 0 : -10)).toFixed(2));
    try {
      const supabase = createClient();
      await supabase.from("sessions").update({ entries: allEntries, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", editCell.sessionId);
    } catch {}
    setEditCell(null);
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
    if (originalName && originalName !== profile.name) {
      delete updated[originalName];
      const supabase = createClient();
      for (const s of sessions) {
        const entries = s.entries as unknown as { athlete?: string }[];
        if (entries.some((e) => e.athlete === originalName)) {
          const renamed = entries.map((e) => e.athlete === originalName ? { ...e, athlete: profile.name } : e);
          await supabase.from("sessions").update({ entries: renamed, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", s.id);
        }
      }
    }
    updated[profile.name] = profile;
    setProfiles(updated);
    await saveScoutProfiles(tid, updated);
    setProfileOpen(null);
    if (originalName && originalName !== profile.name) await loadData();
  };

  return (
    <>
      <Header title="Punt Scouting" />
      <Link href="/scout" className="text-xs text-muted hover:text-white transition-colors px-4 pt-3 block">&larr; Back to Scout Home</Link>
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && !liveMode && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new punt evaluation.</p>
            <div className="grid grid-cols-3 gap-3 max-w-lg">
              <Link href="/scout/punt/chart" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">📋</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Preset Chart</h3>
                <p className="text-[10px] text-muted mt-1">Set punts per player</p>
              </Link>
              <Link href="/scout/punt/chart?mode=manual" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">✏️</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Manual Chart</h3>
                <p className="text-[10px] text-muted mt-1">Enter punts on the fly</p>
              </Link>
              <button onClick={() => setLiveMode(true)} className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">⚡</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Live Input</h3>
                <p className="text-[10px] text-muted mt-1">One punt at a time</p>
              </button>
            </div>
          </div>
        )}

        {tab === "chart" && liveMode && (
          <div className="space-y-4">
            <button onClick={() => setLiveMode(false)} className="text-xs text-muted hover:text-white transition-colors">&larr; Back to Chart Options</button>
            <div className="card space-y-3">
              <p className="text-sm font-bold text-slate-100">Live Input</p>
              <p className="text-[10px] text-muted">Enter distance, hang time, direction — one punt at a time.</p>
              <div className="flex flex-wrap gap-1.5">
                {liveAthletes.map((a) => (
                  <button key={a} onClick={() => setLiveAthlete(a)} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-medium transition-all", liveAthlete === a ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input type="text" value={newLiveAthlete} onChange={(e) => setNewLiveAthlete(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLiveAthlete(); }} placeholder="Add athlete..." className="input flex-1 text-xs py-1" />
                <button onClick={addLiveAthlete} disabled={!newLiveAthlete.trim()} className="text-[10px] text-amber-400 hover:underline disabled:opacity-40">Add</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                  <input type="text" inputMode="numeric" value={liveDistInput} onChange={(e) => setLiveDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                </div>
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Hang Time</p>
                  <input type="text" inputMode="numeric" value={liveHangInput ? parseHangRaw(liveHangInput).toFixed(2) : ""} onChange={(e) => setLiveHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                </div>
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Op Time</p>
                  <input type="text" inputMode="numeric" value={liveOpInput ? parseHangRaw(liveOpInput).toFixed(2) : ""} onChange={(e) => setLiveOpInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                </div>
              </div>
              <div className="flex rounded-input border border-border overflow-hidden">
                <button onClick={() => setLiveDirGood(true)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors", liveDirGood ? "bg-make text-slate-900" : "text-muted hover:text-white")}>Good Dir</button>
                <button onClick={() => setLiveDirGood(false)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors border-l border-border", !liveDirGood ? "bg-miss text-white" : "text-muted hover:text-white")}>Bad Dir (-10)</button>
              </div>
              <button onClick={handleLiveLog} disabled={!liveDistInput || !liveHangInput || !liveAthlete} className="btn-primary w-full py-2 text-sm font-bold disabled:opacity-40">Log Punt</button>
              {livePunts.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border/50">
                  {[...livePunts].reverse().map((p, i) => (
                    <div key={livePunts.length - 1 - i} className="flex items-center text-xs gap-2">
                      <span className="text-muted w-5">#{livePunts.length - i}</span>
                      <span className="text-slate-400 w-16 truncate">{p.athlete}</span>
                      <span className={clsx(p.directionGood ? "text-make" : "text-miss")}>{p.distance}yd {p.hangTime.toFixed(2)}s</span>
                      <span className="text-amber-400 font-bold ml-auto">{p.score.toFixed(2)}</span>
                    </div>
                  ))}
                  <button onClick={handleLiveSave} className="btn-primary w-full py-2 text-xs font-bold mt-2">Save {livePunts.length} Punt{livePunts.length !== 1 ? "s" : ""} to Rankings</button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between card-2 px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-200">Drop Worst Punt</p>
                <p className="text-[10px] text-muted">Exclude lowest score from average</p>
              </div>
              <button onClick={() => setDropWorst(!dropWorst)} className={clsx("w-10 h-5 rounded-full transition-colors relative", dropWorst ? "bg-amber-500" : "bg-surface-2 border border-border")}>
                <div className={clsx("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all", dropWorst ? "left-5" : "left-0.5")} />
              </button>
            </div>
            {!loading && ranked.length > 0 && (
              <div className="flex gap-2">
                <ExportButton onExcel={() => exportPuntScoutExcel(sessions)} onPDF={() => exportPuntScoutPDF(sessions)} />
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
                          <th key={i} className="text-[10px] text-muted text-center py-1 px-2">P{i + 1}</th>
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
                            const isEditing = editCell?.sessionId === r.sessionId && editCell?.name === r.name && editCell?.kickIdx === j;
                            return (
                              <td key={j} className={clsx("text-center py-1 px-2", isDropped ? "opacity-40 line-through" : "")}>
                                <button onClick={() => isEditing ? setEditCell(null) : startEditKick(r.sessionId, r.name, j, e)} className={clsx("hover:opacity-70 transition-opacity", e.directionGood ? "text-make" : "text-miss", isEditing && "ring-1 ring-amber-400 rounded px-1")}>
                                  <span className="font-bold">{e.distance}</span>
                                  <span className="text-[9px] block">{e.hangTime.toFixed(2)}s</span>
                                </button>
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
                {editCell && (
                  <div className="card space-y-2 mt-3">
                    <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Edit Kick</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[8px] text-muted text-center mb-1">Distance</p>
                        <input type="text" inputMode="numeric" value={editDist} onChange={(e) => setEditDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-xs font-bold py-1.5" />
                      </div>
                      <div>
                        <p className="text-[8px] text-muted text-center mb-1">Hang Time</p>
                        <input type="text" inputMode="decimal" value={editHang} onChange={(e) => setEditHang(e.target.value)} className="input w-full text-center text-xs font-bold py-1.5" />
                      </div>
                      <div>
                        <p className="text-[8px] text-muted text-center mb-1">Direction</p>
                        <button onClick={() => setEditDir(true)} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all", editDir ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Good</button>
                        <button onClick={() => setEditDir(false)} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", !editDir ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Bad</button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditCell(null)} className="btn-ghost flex-1 py-2 text-xs">Cancel</button>
                      <button onClick={saveEditKick} className="btn-primary flex-1 py-2 text-xs font-bold">Save</button>
                    </div>
                  </div>
                )}
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
