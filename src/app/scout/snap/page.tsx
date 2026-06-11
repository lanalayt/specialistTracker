"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSession, loadScoutProfiles, saveScoutProfiles, deleteScoutProfile, applyScoutDisciplines, insertScoutSession, loadSessionRankings, loadScoutRankings, removeEntryFromRanking, deleteScoutRanking, type ScoutSession, type ScoutProfile, type ScoutRanking } from "@/lib/scoutStore";
import { RankingTabs } from "@/components/ui/RankingTabs";
import { EditChartModal } from "@/components/ui/EditChartModal";
import { EditChartChooser, type ChooserItem } from "@/components/ui/EditChartChooser";
import { ChartActionModal } from "@/components/ui/ChartActionModal";
import { createClient } from "@/lib/supabase";
import { exportSnapScoutExcel, exportSnapScoutPDF, exportIndividualSnapExcel, exportIndividualSnapPDF } from "@/lib/scoutExport";
import { ExportButton } from "@/components/ui/ExportButton";
import { InfoModal } from "@/components/ui/InfoModal";
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
  maxScore: number;
  pct: number;
  avgTime?: number;
  entries: SnapEntry[];
  is30Point: boolean;
  notes?: string;
  weather?: string;
}

export default function ScoutSnapPage() {
  return <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}><ScoutSnapInner /></Suspense>;
}

function ScoutSnapInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "rankings" ? "rankings" : "chart";
  const [tab, setTab] = useState<"chart" | "rankings">(initialTab);
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [rankings, setRankings] = useState<ScoutRanking[]>([{ id: "overall", name: "Overall" }]);
  const [sessionRankings, setSessionRankingsMap] = useState<Record<string, string[]>>({});
  const [activeRanking, setActiveRanking] = useState("overall");
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState<RankedRow | null>(null);
  const [rankingTab, setRankingTab] = useState<"short" | "long">("short");
  const [editSnapIdx, setEditSnapIdx] = useState<number | null>(null);
  const [exportRow, setExportRow] = useState<RankedRow | null>(null);
  const [mergePrompt, setMergePrompt] = useState<{ profile: ScoutProfile; originalName: string } | null>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<{ sessionId: string; name: string } | null>(null);
  const [showEditChooser, setShowEditChooser] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ sessionId: string; name: string } | null>(null);
  const [infoModal, setInfoModal] = useState<{ name: string; notes?: string; weather?: string; date?: string; sessionId?: string } | null>(null);
  const [editAccuracy, setEditAccuracy] = useState<"Strike" | "Ball" | "">("");
  const [editLaces, setEditLaces] = useState("");
  const [editSpiral, setEditSpiral] = useState("");
  const [editTime, setEditTime] = useState("");

  const startSnapEdit = (idx: number) => {
    if (!detailOpen) return;
    const e = detailOpen.entries[idx];
    setEditSnapIdx(idx);
    setEditAccuracy((e.accuracy as "Strike" | "Ball") ?? "");
    setEditLaces(e.laces ?? "");
    setEditSpiral(e.spiral ?? "");
    setEditTime(e.time ?? "");
  };

  const saveSnapEdit = async () => {
    if (editSnapIdx === null || !detailOpen || !editAccuracy || !editSpiral) return;
    const updated = [...detailOpen.entries];
    const is30 = detailOpen.is30Point;
    let pts = 0;
    if (is30) {
      if (editAccuracy === "Strike") pts += 1;
      if (editLaces === "Good") pts += 1;
      else if (editLaces === "1/4 Turn") pts += 0.5;
      if (editSpiral === "Good") pts += 1;
    } else {
      pts = editAccuracy === "Strike" ? 1 : 0;
    }
    updated[editSnapIdx] = { ...updated[editSnapIdx], accuracy: editAccuracy, laces: editLaces || undefined, spiral: editSpiral, points: is30 ? pts : undefined, score: is30 ? undefined : pts, time: editTime || undefined };

    // Save to database
    const tid = getTeamId();
    if (tid) {
      // Find the session and update all entries for this athlete
      const sess = sessions.find((s) => s.id === detailOpen.sessionId);
      if (sess) {
        const allEntries = sess.entries as unknown as SnapEntry[];
        const athleteEntries = allEntries.filter((e) => e.athlete === detailOpen.name);
        const otherEntries = allEntries.filter((e) => e.athlete !== detailOpen.name);
        // Replace athlete entries with updated ones
        const newAllEntries = [...otherEntries, ...updated];
        try {
          const supabase = createClient();
          await supabase.from("sessions").update({ entries: newAllEntries, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", detailOpen.sessionId);
        } catch {}
      }
    }

    // Update local state
    const newTotal = updated.reduce((s, e) => s + (e.points ?? e.score ?? 0), 0);
    const newMaxScore = is30 ? updated.length * 3 : updated.length;
    const newPct = newMaxScore > 0 ? Math.round((newTotal / newMaxScore) * 100) : 0;
    setDetailOpen({ ...detailOpen, entries: updated, total: newTotal, maxScore: newMaxScore, pct: newPct });
    setEditSnapIdx(null);
    loadData();
  };

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
    if (!tid) return;
    const [sess, prof, rks, srk] = await Promise.all([loadScoutSessions(tid, "SCOUT_SNAP"), loadScoutProfiles(tid), loadScoutRankings(tid, "snap"), loadSessionRankings(tid)]);
    setSessions(sess);
    setProfiles(prof);
    setRankings(rks);
    setSessionRankingsMap(srk);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Per-athlete ranking membership (a per-athlete override beats the session default).
  const entryRanks = (sessionId: string, name: string) => sessionRankings[`${sessionId}|||${name}`] ?? sessionRankings[sessionId] ?? ["overall"];
  const rankedSessions = sessions
    .map((s) => ({ ...s, entries: (s.entries as Record<string, unknown>[]).filter((e) => entryRanks(s.id, (e as { athlete?: string }).athlete ?? "").includes(activeRanking)) }))
    .filter((s) => s.entries.length > 0);
  const ranked: RankedRow[] = [];
  for (const s of rankedSessions) {
    const entries = s.entries as unknown as SnapEntry[];
    const is30Point = s.label.startsWith("30 Point") || s.label.startsWith("Short Snap");
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const total = ae.reduce((sum, e) => sum + (e.points ?? e.score ?? 0), 0);
      const maxScore = is30Point ? ae.length * 3 : ae.length;
      const pct = maxScore > 0 ? Math.round((total / maxScore) * 100) : 0;
      const noteEntry = ae.find((e) => (e as { notes?: string }).notes);
      const notes = noteEntry ? (noteEntry as { notes?: string }).notes : undefined;
      const timedEntries = ae.filter((e) => e.time && parseFloat(e.time) > 0);
      const avgTime = timedEntries.length > 0 ? timedEntries.reduce((sum, e) => sum + parseFloat(e.time!), 0) / timedEntries.length : undefined;
      ranked.push({ name, sessionId: s.id, sessionLabel: s.label, date: s.date, count: ae.length, total, entries: ae, is30Point, maxScore, pct, avgTime, notes, weather: s.weather });
    }
  }
  ranked.sort((a, b) => b.pct - a.pct);
  const shortRanked = ranked.filter((r) => r.is30Point);
  const longRanked = ranked.filter((r) => !r.is30Point);
  const activeRanked = rankingTab === "short" ? shortRanked : longRanked;

  const handleInfoSave = async (weather: string, notes: string) => {
    if (!infoModal?.sessionId) return;
    const tid = getTeamId();
    if (!tid) return;
    const supabase = createClient();
    const sess = sessions.find((s) => s.id === infoModal.sessionId);
    if (!sess) return;
    await supabase.from("sessions").update({ weather: weather || null, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", infoModal.sessionId);
    const allEntries = [...sess.entries] as Record<string, unknown>[];
    const athleteFirstIdx = allEntries.findIndex((e) => (e as { athlete?: string }).athlete === infoModal.name);
    if (athleteFirstIdx >= 0) {
      allEntries[athleteFirstIdx] = { ...allEntries[athleteFirstIdx], notes: notes || undefined };
      await supabase.from("sessions").update({ entries: allEntries, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", infoModal.sessionId);
    }
    await loadData();
  };

  const rankingName = (id: string) => rankings.find((r) => r.id === id)?.name ?? "this ranking";

  const handleDeleteRow = async (name: string, sessionId: string) => {
    const tid = getTeamId();
    if (!tid) return;
    if (activeRanking === "overall") {
      if (!window.confirm(`Delete this chart for ${name}? This permanently removes it from everywhere.`)) return;
      await deleteAthleteFromSession(tid, sessionId, name);
      await loadData();
    } else {
      if (!window.confirm(`Remove ${name}'s chart from "${rankingName(activeRanking)}"? It stays in your other rankings.`)) return;
      await removeEntryFromRanking(tid, sessionId, name, activeRanking);
      const pk = `${sessionId}|||${name}`;
      setSessionRankingsMap((prev) => ({ ...prev, [pk]: (prev[pk] ?? prev[sessionId] ?? ["overall"]).filter((r) => r !== activeRanking) }));
    }
  };

  const toggleRowSelection = (key: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    const tid = getTeamId();
    if (!tid) return;
    if (activeRanking === "overall") {
      if (!window.confirm(`Permanently delete ${selectedRows.size} selected chart${selectedRows.size !== 1 ? "s" : ""}?`)) return;
      for (const key of selectedRows) {
        const [sessionId, name] = key.split("|||");
        await deleteAthleteFromSession(tid, sessionId, name);
      }
      await loadData();
    } else {
      if (!window.confirm(`Remove ${selectedRows.size} chart${selectedRows.size !== 1 ? "s" : ""} from "${rankingName(activeRanking)}"? They stay in your other rankings.`)) return;
      for (const key of selectedRows) {
        const [sessionId, name] = key.split("|||");
        await removeEntryFromRanking(tid, sessionId, name, activeRanking);
      }
      setSessionRankingsMap((prev) => {
        const next = { ...prev };
        for (const key of selectedRows) {
          const [sessionId, name] = key.split("|||");
          const pk = `${sessionId}|||${name}`;
          next[pk] = (next[pk] ?? next[sessionId] ?? ["overall"]).filter((r) => r !== activeRanking);
        }
        return next;
      });
    }
    setSelectedRows(new Set());
    setSelectMode(false);
  };

  const handleDeleteRanking = async (id: string) => {
    const tid = getTeamId();
    if (!tid) return;
    await deleteScoutRanking(tid, "snap", id);
    if (activeRanking === id) setActiveRanking("overall");
    await loadData();
  };

  const handleEditSelected = () => {
    if (selectedRows.size === 0) return;
    if (selectedRows.size === 1) {
      const [sessionId, name] = [...selectedRows][0].split("|||");
      setEditTarget({ sessionId, name });
    } else {
      setShowEditChooser(true);
    }
  };
  const editChooserItems: ChooserItem[] = [...selectedRows].map((k) => {
    const [sessionId, name] = k.split("|||");
    return { sessionId, name, date: sessions.find((s) => s.id === sessionId)?.date ?? "" };
  });
  const editSession = editTarget ? sessions.find((s) => s.id === editTarget.sessionId) : null;

  const handleSaveProfile = async (profile: ScoutProfile, originalName?: string) => {
    const tid = getTeamId();
    if (!tid) return;
    if (originalName && originalName !== profile.name) {
      // Check if new name already exists in any session that also has the old name
      const hasConflict = sessions.some((s) => {
        const entries = s.entries as unknown as { athlete?: string }[];
        return entries.some((e) => e.athlete === originalName) && entries.some((e) => e.athlete === profile.name);
      });
      if (hasConflict) {
        setMergePrompt({ profile, originalName });
        setProfileOpen(null);
        return;
      }
    }
    await executeRename(profile, originalName, "rename");
  };

  const executeRename = async (profile: ScoutProfile, originalName: string | undefined, mode: "merge" | "rename" | "new") => {
    const tid = getTeamId();
    if (!tid) return;
    const updated = { ...profiles };
    if (originalName && originalName !== profile.name) {
      delete updated[originalName];
      const supabase = createClient();
      for (const s of sessions) {
        const entries = s.entries as unknown as { athlete?: string }[];
        if (!entries.some((e) => e.athlete === originalName)) continue;
        if (mode === "merge") {
          // Merge: rename old entries to new name (combines charts)
          const renamed = entries.map((e) => e.athlete === originalName ? { ...e, athlete: profile.name } : e);
          await supabase.from("sessions").update({ entries: renamed, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", s.id);
        } else if (mode === "new") {
          // Keep separate: move old entries to a new session
          const oldEntries = entries.filter((e) => e.athlete === originalName).map((e) => ({ ...e, athlete: profile.name }));
          const remainingEntries = entries.filter((e) => e.athlete !== originalName);
          // Update original session without the old athlete
          await supabase.from("sessions").update({ entries: remainingEntries, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", s.id);
          // Create new session for the renamed entries
          const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await supabase.from("sessions").insert({ id: newId, team_id: tid, sport: s.sport, label: s.label, date: s.date, mode: "practice", entries: oldEntries, updated_at: new Date().toISOString() });
        } else {
          // No conflict — just rename
          const renamed = entries.map((e) => e.athlete === originalName ? { ...e, athlete: profile.name } : e);
          await supabase.from("sessions").update({ entries: renamed, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", s.id);
        }
      }
    }
    updated[profile.name] = profile;
    setProfiles(updated);
    await saveScoutProfiles(tid, updated);
    if (originalName && originalName !== profile.name) await deleteScoutProfile(tid, originalName);
    await applyScoutDisciplines(tid, profile.name, profile.disciplines ?? [], false);
    setProfileOpen(null);
    setMergePrompt(null);
    if (originalName && originalName !== profile.name) await loadData();
  };

  return (
    <>
      <Header title="Snap Scouting" />
      <Link href="/scout" className="text-xs text-muted hover:text-white transition-colors px-4 pt-3 block">&larr; Back to Scout Home</Link>
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new snapping evaluation.</p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Link href="/scout/snap/30-point" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Short Snaps</h3>
                <p className="text-[10px] text-muted mt-1">Strike + Laces + Spiral</p>
              </Link>
              <Link href="/scout/snap/balls-strikes" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Long Snaps</h3>
                <p className="text-[10px] text-muted mt-1">Accuracy + Time + Spiral</p>
              </Link>
            </div>
          </div>
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            {/* Short / Long sub-tabs */}
            <div className="flex rounded-input border border-border overflow-hidden w-fit">
              <button onClick={() => setRankingTab("short")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", rankingTab === "short" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Short Snaps</button>
              <button onClick={() => setRankingTab("long")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", rankingTab === "long" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Long Snaps</button>
            </div>
            {!loading && activeRanked.length > 0 && (
              <div className="flex gap-2">
                <ExportButton onExcel={() => exportSnapScoutExcel(rankedSessions)} onPDF={() => exportSnapScoutPDF(rankedSessions)} />
                <button onClick={() => { setSelectMode(!selectMode); setSelectedRows(new Set()); }} className={clsx("px-3 py-1.5 text-xs font-semibold rounded-input border transition-all", selectMode ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-white hover:border-slate-500")}>{selectMode ? "Cancel" : "Select"}</button>
                {selectMode && selectedRows.size > 0 && (
                  <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs font-semibold rounded-input border border-miss/40 text-miss hover:bg-miss/10 transition-all">Delete ({selectedRows.size})</button>
                )}
              </div>
            )}
            <RankingTabs teamId={getTeamId() ?? ""} sport="snap" rankings={rankings} onRankingsChange={setRankings} active={activeRanking} onActiveChange={setActiveRanking} onDeleteRanking={handleDeleteRanking} />
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : activeRanked.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No {rankingTab === "short" ? "short snap" : "long snap"} data yet.</p>
            ) : (
              <div className="card space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {selectMode && <th className="w-6 py-1 px-1"></th>}
                        <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                        <th className="text-[10px] text-muted text-center py-1 px-2">Snaps</th>
                        <th className="text-[10px] text-muted text-center py-1 px-2"></th>
                        {rankingTab === "long" && <th className="text-[10px] text-muted text-center py-1 px-2">Avg Time</th>}
                        <th className="text-[10px] text-muted text-center py-1 px-2">Score</th>
                        <th className="text-[10px] text-muted text-right py-1 px-2">%</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                        <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRanked.map((r, i) => {
                        const rowKey = `${r.sessionId}|||${r.name}`;
                        return (
                        <tr key={`${r.sessionId}-${r.name}`} onClick={() => { if (!selectMode) setActionTarget({ sessionId: r.sessionId, name: r.name }); }} className={clsx("border-t border-border/30", !selectMode && "cursor-pointer hover:bg-surface-2/40", selectedRows.has(rowKey) && "bg-accent/10")}>
                          {selectMode && <td className="py-1 px-1"><input type="checkbox" checked={selectedRows.has(rowKey)} onChange={() => toggleRowSelection(rowKey)} className="accent-accent" /></td>}
                          <td className="py-1 px-2 font-semibold text-slate-200">
                            <span className="text-muted mr-1">{i + 1}.</span>
                            <button onClick={(e) => { e.stopPropagation(); setProfileOpen(r.name); }} className="hover:text-amber-400 transition-colors underline decoration-dotted">{r.name}</button>
                          </td>
                          <td className="text-center py-1 px-2 text-slate-300">{r.count}</td>
                          <td className="text-center py-1 px-2">
                            <button onClick={(e) => { e.stopPropagation(); setDetailOpen(r); }} className="text-[10px] px-2 py-0.5 rounded-input border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors font-semibold">See Chart</button>
                          </td>
                          {rankingTab === "long" && <td className="text-center py-1 px-2 font-bold text-slate-300">{r.avgTime ? `${r.avgTime.toFixed(2)}s` : "—"}</td>}
                          <td className="text-center py-1 px-2 font-bold text-slate-200">{r.total}/{r.maxScore}</td>
                          <td className="text-right py-1 px-2 font-black text-amber-400">{r.pct}%</td>
                          <td className="text-center py-1 px-1">
                            <button onClick={(e) => { e.stopPropagation(); setInfoModal({ name: r.name, notes: r.notes, weather: r.weather, date: r.date, sessionId: r.sessionId }); }} className={clsx("text-[10px] px-1 py-0.5 rounded transition-colors", r.notes || r.weather ? "text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20" : "text-muted hover:text-amber-400 border border-border")}>Info</button>
                          </td>
                          <td className="text-center py-1 px-1">
                            {!selectMode && <button onClick={(e) => { e.stopPropagation(); handleDeleteRow(r.name, r.sessionId); }} className="text-[10px] text-muted hover:text-miss transition-colors">&times;</button>}
                          </td>
                        </tr>
                        );
                      })}
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
              <div className="flex items-center gap-2">
                <button onClick={() => setExportRow(detailOpen)} className="text-[10px] px-2.5 py-1 rounded-input border border-accent/40 text-accent hover:bg-accent/10 transition-colors font-semibold">Export</button>
                <button onClick={() => setDetailOpen(null)} className="text-muted hover:text-white text-xs transition-colors">Close</button>
              </div>
            </div>

            {/* Score */}
            <div className="text-center">
              <p className="text-3xl font-black text-amber-400">{detailOpen.total}</p>
              <p className="text-xs text-muted">{detailOpen.is30Point ? `/ ${detailOpen.count * 3}` : `${detailOpen.total} / ${detailOpen.count} strikes`}</p>
            </div>

            {/* Strike zone diagram */}
            <div className="max-w-[250px] mx-auto" ref={diagramRef}>
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
            <p className="text-[10px] text-muted text-center">Tap a snap to edit</p>
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
                    <th className="text-[10px] text-muted text-center py-1 px-1 w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {detailOpen.entries.map((e, i) => {
                    const isEditing = editSnapIdx === i;
                    return (
                      <tr key={i} className={clsx("border-t border-border/30", isEditing && "bg-surface-2/30")}>
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
                        <td className="text-center py-1 px-1">
                          <button onClick={() => isEditing ? setEditSnapIdx(null) : startSnapEdit(i)} className={clsx("text-[10px] transition-colors", isEditing ? "text-accent font-bold" : "text-muted hover:text-amber-400")}>
                            {isEditing ? "Close" : "Edit"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Edit panel */}
            {editSnapIdx !== null && (
              <div className="card space-y-2" onClick={(ev) => ev.stopPropagation()}>
                <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Edit Snap #{editSnapIdx + 1}</p>
                <div className={clsx("grid gap-2", detailOpen.is30Point ? "grid-cols-3" : "grid-cols-3")}>
                  <div>
                    <p className="text-[8px] text-muted text-center mb-1">Location</p>
                    <button onClick={(ev) => { ev.stopPropagation(); setEditAccuracy("Strike"); }} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all", editAccuracy === "Strike" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Strike</button>
                    <button onClick={(ev) => { ev.stopPropagation(); setEditAccuracy("Ball"); }} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editAccuracy === "Ball" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Ball</button>
                  </div>
                  {detailOpen.is30Point && (
                    <div>
                      <p className="text-[8px] text-muted text-center mb-1">Laces</p>
                      <button onClick={(ev) => { ev.stopPropagation(); setEditLaces("Good"); }} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all", editLaces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
                      <button onClick={(ev) => { ev.stopPropagation(); setEditLaces("1/4 Turn"); }} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editLaces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4</button>
                      <button onClick={(ev) => { ev.stopPropagation(); setEditLaces("Back"); }} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editLaces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
                    </div>
                  )}
                  <div>
                    <p className="text-[8px] text-muted text-center mb-1">Spiral</p>
                    <button onClick={(ev) => { ev.stopPropagation(); setEditSpiral("Good"); }} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all", editSpiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                    <button onClick={(ev) => { ev.stopPropagation(); setEditSpiral("Bad"); }} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editSpiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
                  </div>
                  {!detailOpen.is30Point && (
                    <div>
                      <p className="text-[8px] text-muted text-center mb-1">Time</p>
                      <input type="text" inputMode="decimal" value={editTime} onClick={(ev) => ev.stopPropagation()} onChange={(e) => setEditTime(e.target.value)} className="input w-full text-center text-[10px] font-bold py-1.5" placeholder="0.65" />
                    </div>
                  )}
                </div>
                <button onClick={(ev) => { ev.stopPropagation(); saveSnapEdit(); }} className="btn-primary w-full py-2 text-xs font-bold">Save</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export format popup */}
      {exportRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setExportRow(null)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">Export — {exportRow.name}</h3>
              <button onClick={() => setExportRow(null)} className="text-muted hover:text-white text-xs">Close</button>
            </div>
            <p className="text-xs text-muted">{exportRow.count} snaps · {exportRow.total}/{exportRow.maxScore} ({exportRow.pct}%)</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  exportIndividualSnapExcel({ name: exportRow.name, date: exportRow.date, label: exportRow.sessionLabel, is30Point: exportRow.is30Point, count: exportRow.count, total: exportRow.total, maxScore: exportRow.maxScore, pct: exportRow.pct, entries: exportRow.entries });
                  setExportRow(null);
                }}
                className="btn-primary flex-1 py-3 text-sm font-bold"
              >
                Excel
              </button>
              <button
                onClick={async () => {
                  let diagramImage: string | undefined;
                  if (diagramRef.current) {
                    try {
                      const html2canvas = (await import("html2canvas")).default;
                      const canvas = await html2canvas(diagramRef.current, { backgroundColor: "#ffffff", scale: 2 });
                      diagramImage = canvas.toDataURL("image/png");
                    } catch {}
                  }
                  await exportIndividualSnapPDF({ name: exportRow.name, date: exportRow.date, label: exportRow.sessionLabel, is30Point: exportRow.is30Point, count: exportRow.count, total: exportRow.total, maxScore: exportRow.maxScore, pct: exportRow.pct, entries: exportRow.entries }, diagramImage);
                  setExportRow(null);
                }}
                className="btn-ghost flex-1 py-3 text-sm font-bold border border-border"
              >
                PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge prompt */}
      {mergePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMergePrompt(null)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm mx-4 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Name Conflict</h3>
            <p className="text-xs text-muted">
              <span className="text-slate-200 font-semibold">{mergePrompt.profile.name}</span> already has a chart in the same session as <span className="text-slate-200 font-semibold">{mergePrompt.originalName}</span>.
            </p>
            <p className="text-xs text-muted">Do you want to merge into one chart or keep them as separate charts?</p>
            <div className="flex gap-3">
              <button
                onClick={() => executeRename(mergePrompt.profile, mergePrompt.originalName, "merge")}
                className="btn-primary flex-1 py-2.5 text-sm font-bold"
              >
                Merge Charts
              </button>
              <button
                onClick={() => executeRename(mergePrompt.profile, mergePrompt.originalName, "new")}
                className="btn-ghost flex-1 py-2.5 text-sm font-bold border border-border"
              >
                Keep Separate
              </button>
            </div>
            <button onClick={() => setMergePrompt(null)} className="w-full text-center text-xs text-muted hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {infoModal && (
        <InfoModal name={infoModal.name} notes={infoModal.notes} weather={infoModal.weather} date={infoModal.date} onSave={handleInfoSave} onClose={() => setInfoModal(null)} />
      )}

      {actionTarget && sessions.find((s) => s.id === actionTarget.sessionId) && (
        <ChartActionModal
          session={sessions.find((s) => s.id === actionTarget.sessionId)!}
          athlete={actionTarget.name}
          onEdit={() => { setEditTarget(actionTarget); setActionTarget(null); }}
          onClose={() => setActionTarget(null)}
        />
      )}

      {showEditChooser && (
        <EditChartChooser
          items={editChooserItems}
          onPick={(it) => { setShowEditChooser(false); setEditTarget({ sessionId: it.sessionId, name: it.name }); }}
          onClose={() => setShowEditChooser(false)}
        />
      )}

      {editTarget && editSession && (
        <EditChartModal
          teamId={getTeamId() ?? ""}
          session={editSession}
          athlete={editTarget.name}
          onClose={() => setEditTarget(null)}
          onSaved={async () => { setEditTarget(null); setSelectMode(false); setSelectedRows(new Set()); await loadData(); }}
        />
      )}
    </>
  );
}
