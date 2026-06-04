"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSession, loadScoutProfiles, saveScoutProfiles, insertScoutSession, loadScoutAthletes, saveScoutAthletes, loadScoutNumbers, saveScoutNumbers, scoutDisplayName, type ScoutSession, type ScoutProfile } from "@/lib/scoutStore";
import { createClient } from "@/lib/supabase";
import { exportFGScoutExcel, exportFGScoutPDF } from "@/lib/scoutExport";
import { ExportButton } from "@/components/ui/ExportButton";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

const LIVE_HASH_OPTIONS = [
  { value: "L", label: "Left Hash" },
  { value: "M", label: "Middle" },
  { value: "R", label: "Right Hash" },
];
const RESULT_LABEL: Record<string, string> = { YL: "GOOD", YC: "GOOD", YR: "GOOD", XL: "MISS LEFT", XR: "MISS RIGHT", XS: "MISS SHORT", X: "MISS" };

interface FGEntry { athlete: string; kickNum: number; distance: number; hash: string; pointValue: number; result: "make" | "miss"; score: number }

export default function ScoutFGPage() {
  return <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}><ScoutFGInner /></Suspense>;
}

function ScoutFGInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "rankings" ? "rankings" : "chart";
  const [tab, setTab] = useState<"chart" | "rankings">(initialTab);
  const [liveMode, setLiveMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [infoModal, setInfoModal] = useState<{ name: string; notes?: string; weather?: string; date?: string } | null>(null);
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);

  // Live input state
  const [liveAthletes, setLiveAthletes] = useState<string[]>([]);
  const [liveDist, setLiveDist] = useState("");
  const [liveHash, setLiveHash] = useState("M");
  const [liveAthlete, setLiveAthlete] = useState("");
  const [liveKicks, setLiveKicks] = useState<{ athlete: string; distance: number; hash: string; result: string; score: number }[]>([]);
  const [newLiveAthlete, setNewLiveAthlete] = useState("");
  const [scoutNumbers, setScoutNumbers] = useState<Record<string, string>>({});
  const [newAthleteNum, setNewAthleteNum] = useState("");

  useEffect(() => {
    async function loadAthletes() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const [names, nums] = await Promise.all([loadScoutAthletes(tid, "fg"), loadScoutNumbers(tid, "fg")]);
      setLiveAthletes(names);
      setScoutNumbers(nums);
      if (names.length > 0 && !liveAthlete) setLiveAthlete(names[0]);
    }
    loadAthletes();
  }, []);

  const addLiveAthlete = async () => {
    const trimmed = newLiveAthlete.trim();
    if (!trimmed || liveAthletes.includes(trimmed)) return;
    const updated = [...liveAthletes, trimmed];
    setLiveAthletes(updated);
    setNewLiveAthlete("");
    if (!liveAthlete) setLiveAthlete(trimmed);
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "fg", updated);
    if (newAthleteNum.trim()) {
      const updatedNums = { ...scoutNumbers, [trimmed]: newAthleteNum.trim() };
      setScoutNumbers(updatedNums);
      if (tid) await saveScoutNumbers(tid, "fg", updatedNums);
    }
    setNewAthleteNum("");
  };

  const handleLiveResult = async (result: string) => {
    const dist = parseInt(liveDist);
    if (!dist || !liveAthlete) return;
    const kick = { athlete: liveAthlete, distance: dist, hash: liveHash, pointValue: 1, result: result === "make" ? "make" : "miss", score: result === "make" ? 1 : 0 };
    const newKicks = [...liveKicks, kick];
    setLiveKicks(newKicks);
    setLiveDist("");
  };

  const handleLiveSave = async () => {
    if (liveKicks.length === 0) return;
    const tid = getTeamId();
    if (!tid) return;
    const athletes = [...new Set(liveKicks.map((k) => k.athlete))];
    const label = `FG Scout — ${athletes.map((a) => { const ak = liveKicks.filter((k) => k.athlete === a); return `${a}: ${ak.filter((k) => k.result === "make").length}/${ak.length}`; }).join(", ")}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_FG",
      label,
      date: new Date().toISOString(),
      entries: liveKicks.map((k, i) => ({ ...k, kickNum: i + 1, ...(i === 0 ? { chartMode: "live" } : {}) })) as unknown as Record<string, unknown>[],
    });
    setLiveKicks([]);
    await loadData();
  };

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
    if (!tid) return;
    const [sess, prof, nums] = await Promise.all([loadScoutSessions(tid, "SCOUT_FG"), loadScoutProfiles(tid), loadScoutNumbers(tid, "fg")]);
    setSessions(sess);
    setProfiles(prof);
    setScoutNumbers(nums);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Build per-session-per-athlete rows
  const athleteData: { name: string; sessionId: string; date: string; entries: FGEntry[]; total: number; makes: number; att: number; isPreset: boolean; notes?: string; weather?: string }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as (FGEntry & { chartMode?: string; notes?: string })[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    // Use chartMode tag if present, otherwise fallback: preset requires 2+ athletes with identical kick sequences
    const mode = entries[0]?.chartMode;
    let isPreset: boolean;
    if (mode) {
      isPreset = mode === "preset";
    } else {
      const firstAthlete = athletes[0];
      const firstKicks = entries.filter((e) => e.athlete === firstAthlete).map((e) => `${e.distance}-${e.hash}`);
      isPreset = athletes.length >= 2 && athletes.every((a) => {
        const kicks = entries.filter((e) => e.athlete === a).map((e) => `${e.distance}-${e.hash}`);
        return kicks.length === firstKicks.length && kicks.every((k, i) => k === firstKicks[i]);
      });
    }
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const total = ae.reduce((sum, e) => sum + e.score, 0);
      const makes = ae.filter((e) => e.result === "make").length;
      const noteEntry = ae.find((e) => (e as { notes?: string }).notes);
      const notes = noteEntry ? (noteEntry as { notes?: string }).notes : undefined;
      athleteData.push({ name, sessionId: s.id, date: s.date, entries: ae, total, makes, att: ae.length, isPreset, notes, weather: s.weather });
    }
  }
  athleteData.sort((a, b) => b.total - a.total);
  const presetData = athleteData.filter((a) => a.isPreset);
  const liveData = athleteData.filter((a) => !a.isPreset);
  const presetMaxKicks = presetData.length > 0 ? Math.max(...presetData.map((a) => a.entries.length)) : 0;
  const liveMaxKicks = liveData.length > 0 ? Math.max(...liveData.map((a) => a.entries.length)) : 0;
  // Get preset kick headers (distance + hash from first athlete's entries)
  const presetKickHeaders: { dist: number; hash: string }[] = presetData.length > 0 ? presetData[0].entries.map((e) => ({ dist: e.distance, hash: e.hash })) : [];

  const toggleRowSelection = (key: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!window.confirm(`Delete ${selectedRows.size} selected chart${selectedRows.size !== 1 ? "s" : ""}?`)) return;
    const tid = getTeamId();
    if (!tid) return;
    for (const key of selectedRows) {
      const [sessionId, name] = key.split("|||");
      await deleteAthleteFromSession(tid, sessionId, name);
    }
    setSelectedRows(new Set());
    setSelectMode(false);
    await loadData();
  };

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
    if (originalName && originalName !== profile.name) {
      delete updated[originalName];
      // Rename in all session entries
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
      <Header title="FG Scouting" />
      <Link href="/scout" className="text-xs text-muted hover:text-white transition-colors px-4 pt-3 block">&larr; Back to Scout Home</Link>
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && !liveMode && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new FG evaluation chart.</p>
            <div className="grid grid-cols-3 gap-3 max-w-lg">
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
              <button onClick={() => setLiveMode(true)} className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">⚡</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Live Input</h3>
                <p className="text-[10px] text-muted mt-1">One kick at a time</p>
              </button>
            </div>
          </div>
        )}

        {tab === "chart" && liveMode && (
          <div className="space-y-4">
            <button onClick={() => setLiveMode(false)} className="text-xs text-muted hover:text-white transition-colors">&larr; Back to Chart Options</button>
            <div className="card space-y-3">
              <p className="text-sm font-bold text-slate-100">Live Input</p>
              <p className="text-[10px] text-muted">Enter distance, hash, athlete, result — submit one kick at a time.</p>

              {/* Athlete selector */}
              <div className="flex flex-wrap gap-1.5">
                {liveAthletes.map((a) => (
                  <button key={a} onClick={() => setLiveAthlete(a)} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-medium transition-all", liveAthlete === a ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{scoutDisplayName(a, scoutNumbers)}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" value={newAthleteNum} onChange={(e) => setNewAthleteNum(e.target.value.replace(/\D/g, ""))} placeholder="#" className="input w-14 text-center text-sm font-bold py-1.5" />
                <input type="text" value={newLiveAthlete} onChange={(e) => setNewLiveAthlete(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLiveAthlete(); }} placeholder="Type name to add..." className="input flex-1 text-sm py-1.5" />
                <button onClick={addLiveAthlete} disabled={!newLiveAthlete.trim()} className="btn-primary px-4 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                  <input type="text" inputMode="numeric" value={liveDist} onChange={(e) => setLiveDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                </div>
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Hash</p>
                  <select value={liveHash} onChange={(e) => setLiveHash(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5">
                    {LIVE_HASH_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Make / Miss */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleLiveResult("make")} disabled={!liveDist || !liveAthlete} className="py-3 rounded-input text-sm font-black bg-make/20 text-make border-2 border-make/40 hover:bg-make/30 transition-all active:scale-95 disabled:opacity-40">GOOD</button>
                <button onClick={() => handleLiveResult("miss")} disabled={!liveDist || !liveAthlete} className="py-3 rounded-input text-sm font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all active:scale-95 disabled:opacity-40">MISS</button>
              </div>

              {/* Running log */}
              {liveKicks.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border/50">
                  {[...liveKicks].reverse().map((k, i) => (
                    <div key={liveKicks.length - 1 - i} className="flex items-center text-xs gap-2">
                      <span className="text-muted w-5">#{liveKicks.length - i}</span>
                      <span className="text-slate-400 w-16 truncate">{scoutDisplayName(k.athlete, scoutNumbers)}</span>
                      <span className="text-slate-300">{k.distance}yd {k.hash}</span>
                      <span className={clsx("font-bold ml-auto", k.result === "make" ? "text-make" : "text-miss")}>{k.result === "make" ? "GOOD" : "MISS"}</span>
                    </div>
                  ))}
                  <button onClick={handleLiveSave} className="btn-primary w-full py-2 text-xs font-bold mt-2">Save {liveKicks.length} Kick{liveKicks.length !== 1 ? "s" : ""} to Rankings</button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-6">
            {!loading && athleteData.length > 0 && (
              <div className="flex items-center gap-2">
                <ExportButton onExcel={() => exportFGScoutExcel(sessions)} onPDF={() => exportFGScoutPDF(sessions)} />
                <button onClick={() => { setSelectMode(!selectMode); setSelectedRows(new Set()); }} className={clsx("px-3 py-1.5 text-xs font-semibold rounded-input border transition-all", selectMode ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-white hover:border-slate-500")}>{selectMode ? "Cancel" : "Select"}</button>
                {selectMode && selectedRows.size > 0 && (
                  <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs font-semibold rounded-input border border-miss/40 text-miss hover:bg-miss/10 transition-all">Delete ({selectedRows.size})</button>
                )}
              </div>
            )}
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : athleteData.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No scout sessions yet. Start a chart to begin.</p>
            ) : (
              <>
                {/* Preset Chart Rankings */}
                {presetData.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Preset Chart</p>
                    <div className="card space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              {selectMode && <th className="w-6 py-1 px-1"></th>}
                              <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                              {presetKickHeaders.map((k, i) => (
                                <th key={i} className="text-[10px] text-muted text-center py-1 px-1 whitespace-nowrap">{k.dist}yd<br/><span className="text-[8px]">{k.hash}</span></th>
                              ))}
                              <th className="text-[10px] text-muted text-right py-1 px-2">Total</th>
                              <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {presetData.map((r, i) => {
                              const rowKey = `${r.sessionId}|||${r.name}`;
                              return (
                              <tr key={rowKey} className={clsx("border-t border-border/30", selectedRows.has(rowKey) && "bg-accent/10")}>
                                {selectMode && <td className="py-1 px-1"><input type="checkbox" checked={selectedRows.has(rowKey)} onChange={() => toggleRowSelection(rowKey)} className="accent-accent" /></td>}
                                <td className="py-1 px-2 font-semibold text-slate-200">
                                  <span className="text-muted mr-1">{i + 1}.</span>
                                  <button onClick={() => setProfileOpen(r.name)} className="hover:text-amber-400 transition-colors underline decoration-dotted">{scoutDisplayName(r.name, scoutNumbers)}</button>
                                </td>
                                {r.entries.map((e, j) => (
                                  <td key={j} className="text-center py-1 px-1">
                                    <button onClick={() => handleToggleKick(r.sessionId, r.name, j)} className={clsx("font-bold hover:opacity-70 transition-opacity", e.result === "make" ? "text-make" : "text-miss")}>
                                      {e.score}
                                    </button>
                                  </td>
                                ))}
                                {Array.from({ length: presetMaxKicks - r.entries.length }, (_, j) => (
                                  <td key={`e-${j}`} className="text-center py-1 px-1 text-muted">—</td>
                                ))}
                                <td className="text-right py-1 px-2 font-black text-amber-400">{r.total}</td>
                                <td className="text-center py-1 px-1">
                                  <div className="flex items-center gap-1">
                                    {(r.notes || r.weather) && <button onClick={() => setInfoModal({ name: r.name, notes: r.notes, weather: r.weather, date: r.date })} className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1 py-0.5 rounded hover:bg-amber-500/20 transition-colors">Info</button>}
                                    {!selectMode && <button onClick={() => handleDeleteRow(r.name, r.sessionId)} className="text-[10px] text-muted hover:text-miss transition-colors">&times;</button>}
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live/Manual Chart Rankings */}
                {liveData.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Manual Chart</p>
                    <div className="card space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              {selectMode && <th className="w-6 py-1 px-1"></th>}
                              <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                              {Array.from({ length: liveMaxKicks }, (_, i) => (
                                <th key={i} className="text-[10px] text-muted text-center py-1 px-1">K{i + 1}</th>
                              ))}
                              <th className="text-[10px] text-muted text-right py-1 px-2">%</th>
                              <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {liveData.map((r, i) => {
                              const pct = r.att > 0 ? Math.round((r.makes / r.att) * 100) : 0;
                              const rowKey = `${r.sessionId}|||${r.name}`;
                              return (
                                <tr key={rowKey} className={clsx("border-t border-border/30", selectedRows.has(rowKey) && "bg-accent/10")}>
                                  {selectMode && <td className="py-1 px-1"><input type="checkbox" checked={selectedRows.has(rowKey)} onChange={() => toggleRowSelection(rowKey)} className="accent-accent" /></td>}
                                  <td className="py-1 px-2 font-semibold text-slate-200">
                                    <span className="text-muted mr-1">{i + 1}.</span>
                                    <button onClick={() => setProfileOpen(r.name)} className="hover:text-amber-400 transition-colors underline decoration-dotted">{scoutDisplayName(r.name, scoutNumbers)}</button>
                                  </td>
                                  {r.entries.map((e, j) => (
                                    <td key={j} className="text-center py-1 px-1">
                                      <button onClick={() => handleToggleKick(r.sessionId, r.name, j)} className={clsx("font-bold hover:opacity-70 transition-opacity text-[10px] whitespace-nowrap", e.result === "make" ? "text-make" : "text-miss")}>
                                        {e.distance}{e.hash}
                                      </button>
                                    </td>
                                  ))}
                                  {Array.from({ length: liveMaxKicks - r.entries.length }, (_, j) => (
                                    <td key={`e-${j}`} className="text-center py-1 px-1 text-muted">—</td>
                                  ))}
                                  <td className="text-right py-1 px-2 font-black text-amber-400">{r.makes}/{r.att} <span className="text-[10px]">({pct}%)</span></td>
                                  <td className="text-center py-1 px-1">
                                    <div className="flex items-center gap-1">
                                      {(r.notes || r.weather) && <button onClick={() => setInfoModal({ name: r.name, notes: r.notes, weather: r.weather, date: r.date })} className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1 py-0.5 rounded hover:bg-amber-500/20 transition-colors">Info</button>}
                                      {!selectMode && <button onClick={() => handleDeleteRow(r.name, r.sessionId)} className="text-[10px] text-muted hover:text-miss transition-colors">&times;</button>}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
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
      {infoModal && (
        <InfoModal
          name={infoModal.name}
          notes={infoModal.notes}
          weather={infoModal.weather}
          date={infoModal.date}
          onClose={() => setInfoModal(null)}
        />
      )}
    </>
  );
}
