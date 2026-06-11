"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTeamId } from "@/lib/teamData";
import { loadScoutSessions, deleteAthleteFromSession, loadScoutProfiles, saveScoutProfiles, deleteScoutProfile, applyScoutDisciplines, insertScoutSession, setSessionRankings, loadSessionRankings, loadScoutRankings, removeEntryFromRanking, deleteScoutRanking, loadScoutAthletes, saveScoutAthletes, loadScoutNumbers, saveScoutNumbers, scoutDisplayName, type ScoutSession, type ScoutProfile, type ScoutRanking } from "@/lib/scoutStore";
import { AssignRankingsModal } from "@/components/ui/AssignRankingsModal";
import { RankingTabs } from "@/components/ui/RankingTabs";
import { EditChartModal } from "@/components/ui/EditChartModal";
import { EditChartChooser, type ChooserItem } from "@/components/ui/EditChartChooser";
import { ChartActionModal } from "@/components/ui/ChartActionModal";
import { createClient } from "@/lib/supabase";
import { exportKOScoutExcel, exportKOScoutPDF } from "@/lib/scoutExport";
import { ExportButton } from "@/components/ui/ExportButton";
import { InfoModal } from "@/components/ui/InfoModal";
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

const parseHangRaw = (raw: string): number => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
};

export default function ScoutKOPage() {
  return <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}><ScoutKOInner /></Suspense>;
}

function ScoutKOInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "rankings" ? "rankings" : "chart";
  const [tab, setTab] = useState<"chart" | "rankings">(initialTab);
  const [liveMode, setLiveMode] = useState(false);
  const [sessions, setSessions] = useState<ScoutSession[]>([]);
  const [rankings, setRankings] = useState<ScoutRanking[]>([{ id: "overall", name: "Overall" }]);
  const [sessionRankings, setSessionRankingsMap] = useState<Record<string, string[]>>({});
  const [activeRanking, setActiveRanking] = useState("overall");
  const [showLiveRankings, setShowLiveRankings] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);
  const [dropWorst, setDropWorst] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<{ sessionId: string; name: string } | null>(null);
  const [showEditChooser, setShowEditChooser] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ sessionId: string; name: string } | null>(null);
  const [infoModal, setInfoModal] = useState<{ name: string; notes?: string; weather?: string; date?: string; sessionId?: string } | null>(null);

  // Live input state
  const [liveAthletes, setLiveAthletes] = useState<string[]>([]);
  const [liveAthlete, setLiveAthlete] = useState("");
  const [newLiveAthlete, setNewLiveAthlete] = useState("");
  const [scoutNumbers, setScoutNumbers] = useState<Record<string, string>>({});
  const [newAthleteNum, setNewAthleteNum] = useState("");
  const [liveDistInput, setLiveDistInput] = useState("");
  const [liveHangInput, setLiveHangInput] = useState("");
  const [liveDirGood, setLiveDirGood] = useState(true);
  const [liveKicks, setLiveKicks] = useState<{ athlete: string; distance: number; hangTime: number; directionGood: boolean; score: number }[]>([]);
  const [liveStep, setLiveStep] = useState<"select" | "input">("select");
  const [selectedLive, setSelectedLive] = useState<string[]>([]);
  const toggleLiveSelect = (name: string) => setSelectedLive((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
    if (!tid) return;
    const [sess, prof, nums, rks, srk] = await Promise.all([loadScoutSessions(tid, "SCOUT_KO"), loadScoutProfiles(tid), loadScoutNumbers(tid, "kickoff"), loadScoutRankings(tid, "kickoff"), loadSessionRankings(tid)]);
    setSessions(sess);
    setProfiles(prof);
    setScoutNumbers(nums);
    setRankings(rks);
    setSessionRankingsMap(srk);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    async function loadLiveAthletes() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const [names, nums] = await Promise.all([loadScoutAthletes(tid, "kickoff"), loadScoutNumbers(tid, "kickoff")]);
      setLiveAthletes(names);
      setScoutNumbers(nums);
      if (names.length > 0 && !liveAthlete) setLiveAthlete(names[0]);
    }
    loadLiveAthletes();
  }, []);

  const addLiveAthlete = async () => {
    const trimmed = newLiveAthlete.trim();
    if (!trimmed || liveAthletes.includes(trimmed)) return;
    const updated = [...liveAthletes, trimmed];
    setLiveAthletes(updated);
    setSelectedLive((prev) => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    setNewLiveAthlete("");
    if (!liveAthlete) setLiveAthlete(trimmed);
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "kickoff", updated);
    if (newAthleteNum.trim()) {
      const updatedNums = { ...scoutNumbers, [trimmed]: newAthleteNum.trim() };
      setScoutNumbers(updatedNums);
      if (tid) await saveScoutNumbers(tid, "kickoff", updatedNums);
    }
    setNewAthleteNum("");
  };

  const handleLiveLog = () => {
    const dist = parseInt(liveDistInput);
    const hang = parseHangRaw(liveHangInput);
    if (isNaN(dist) || dist <= 0 || !hang || !liveAthlete) return;
    const score = parseFloat((dist + hang * 10 + (liveDirGood ? 0 : -10)).toFixed(2));
    setLiveKicks((prev) => [...prev, { athlete: liveAthlete, distance: dist, hangTime: hang, directionGood: liveDirGood, score }]);
    setLiveDistInput("");
    setLiveHangInput("");
    setLiveDirGood(true);
  };

  const handleLiveSave = async (rankingIds: string[]) => {
    if (liveKicks.length === 0) return;
    const tid = getTeamId();
    if (!tid) return;
    const athletes = [...new Set(liveKicks.map((k) => k.athlete))];
    const label = `KO Scout — ${athletes.map((a) => { const ak = liveKicks.filter((k) => k.athlete === a); return `${a}: ${calcAvg(ak.map((k) => k.score), true).toFixed(2)}`; }).join(", ")}`;
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await insertScoutSession(tid, {
      id: sessionId,
      sport: "SCOUT_KO",
      label,
      date: new Date().toISOString(),
      entries: liveKicks.map((k, i) => ({ ...k, kickNum: i + 1, dropWorst: true })) as unknown as Record<string, unknown>[],
    });
    await setSessionRankings(tid, sessionId, rankingIds);
    setLiveKicks([]);
    setShowLiveRankings(false);
    setLiveMode(false);
    await loadData();
  };

  // Per-athlete ranking membership (a per-athlete override beats the session default).
  const entryRanks = (sessionId: string, name: string) => sessionRankings[`${sessionId}|||${name}`] ?? sessionRankings[sessionId] ?? ["overall"];
  // Build per-session-per-athlete rows, keeping only the athletes in the active ranking.
  const rankedSessions = sessions
    .map((s) => ({ ...s, entries: (s.entries as Record<string, unknown>[]).filter((e) => entryRanks(s.id, (e as { athlete?: string }).athlete ?? "").includes(activeRanking)) }))
    .filter((s) => s.entries.length > 0);
  const ranked: { name: string; sessionId: string; date: string; entries: KOEntry[]; avg: number; worst: number | null; notes?: string; weather?: string }[] = [];
  for (const s of rankedSessions) {
    const entries = s.entries as unknown as KOEntry[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const scores = ae.map((e) => e.score);
      const worst = dropWorst && scores.length > 1 ? Math.min(...scores) : null;
      const noteEntry = ae.find((e) => (e as { notes?: string }).notes);
      const notes = noteEntry ? (noteEntry as { notes?: string }).notes : undefined;
      ranked.push({ name, sessionId: s.id, date: s.date, entries: ae, avg: calcAvg(scores, dropWorst), worst, notes, weather: s.weather });
    }
  }
  ranked.sort((a, b) => b.avg - a.avg);
  const maxKicks = ranked.length > 0 ? Math.max(...ranked.map((r) => r.entries.length)) : 0;

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
    await deleteScoutRanking(tid, "kickoff", id);
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
    if (originalName && originalName !== profile.name) await deleteScoutProfile(tid, originalName);
    await applyScoutDisciplines(tid, profile.name, profile.disciplines ?? [], false);
    setProfileOpen(null);
    if (originalName && originalName !== profile.name) await loadData();
  };

  return (
    <>
      <Header title="KO Scouting" />
      <Link href="/scout" className="text-xs text-muted hover:text-white transition-colors px-4 pt-3 block">&larr; Back to Scout Home</Link>
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setTab("chart")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors", tab === "chart" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Chart</button>
          <button onClick={() => setTab("rankings")} className={clsx("px-5 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "rankings" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Rankings</button>
        </div>

        {tab === "chart" && !liveMode && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Start a new kickoff evaluation.</p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <Link href="/scout/kickoff/chart" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">📋</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Preset Chart</h3>
                <p className="text-[10px] text-muted mt-1">Set kicks per player</p>
              </Link>
              <button onClick={() => { setLiveMode(true); setLiveStep("select"); setSelectedLive([]); }} className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6">
                <p className="text-2xl mb-2">⚡</p>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Live Input</h3>
                <p className="text-[10px] text-muted mt-1">One kick at a time</p>
              </button>
            </div>
          </div>
        )}

        {tab === "chart" && liveMode && liveStep === "select" && (
          <div className="space-y-4">
            <button onClick={() => setLiveMode(false)} className="text-xs text-muted hover:text-white transition-colors">&larr; Back to Chart Options</button>
            <div className="card space-y-3">
              <p className="text-sm font-bold text-slate-100">Select Athletes</p>
              <p className="text-[10px] text-muted">Tap who&apos;s kicking. Add a name with an optional jersey number, then start.</p>
              <div className="flex flex-wrap gap-1.5">
                {liveAthletes.map((a) => (
                  <button key={a} onClick={() => toggleLiveSelect(a)} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-medium transition-all", selectedLive.includes(a) ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{scoutDisplayName(a, scoutNumbers)}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" value={newAthleteNum} onChange={(e) => setNewAthleteNum(e.target.value.replace(/\D/g, ""))} placeholder="#" className="input w-14 text-center text-sm font-bold py-1.5" />
                <input type="text" value={newLiveAthlete} onChange={(e) => setNewLiveAthlete(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLiveAthlete(); }} placeholder="Type name to add..." className="input flex-1 text-sm py-1.5" />
                <button onClick={addLiveAthlete} disabled={!newLiveAthlete.trim()} className="btn-primary px-4 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
              </div>
              <button onClick={() => { setLiveAthlete(selectedLive.includes(liveAthlete) ? liveAthlete : (selectedLive[0] ?? "")); setLiveStep("input"); }} disabled={selectedLive.length === 0} className="btn-primary w-full py-2.5 text-sm font-bold disabled:opacity-40">Start Live Input</button>
            </div>
          </div>
        )}

        {tab === "chart" && liveMode && liveStep === "input" && (
          <div className="space-y-4">
            <button onClick={() => setLiveStep("select")} className="text-xs text-muted hover:text-white transition-colors">&larr; Back to Athletes</button>
            <div className="card space-y-3">
              <p className="text-sm font-bold text-slate-100">Live Input</p>
              <p className="text-[10px] text-muted">Enter distance, hang time, direction — one kick at a time.</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedLive.map((a) => (
                  <button key={a} onClick={() => setLiveAthlete(a)} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-medium transition-all", liveAthlete === a ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{scoutDisplayName(a, scoutNumbers)}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                  <input type="text" inputMode="numeric" value={liveDistInput} onChange={(e) => setLiveDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                </div>
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Hang Time</p>
                  <input type="text" inputMode="numeric" value={liveHangInput ? parseHangRaw(liveHangInput).toFixed(2) : ""} onChange={(e) => setLiveHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                </div>
              </div>
              <div className="flex rounded-input border border-border overflow-hidden">
                <button onClick={() => setLiveDirGood(true)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors", liveDirGood ? "bg-make text-slate-900" : "text-muted hover:text-white")}>Good Dir</button>
                <button onClick={() => setLiveDirGood(false)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors border-l border-border", !liveDirGood ? "bg-miss text-white" : "text-muted hover:text-white")}>Bad Dir (-10)</button>
              </div>
              <button onClick={handleLiveLog} disabled={!liveDistInput || !liveHangInput || !liveAthlete} className="btn-primary w-full py-2 text-sm font-bold disabled:opacity-40">Log Kick</button>
              {liveKicks.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border/50">
                  {[...liveKicks].reverse().map((k, i) => (
                    <div key={liveKicks.length - 1 - i} className="flex items-center text-xs gap-2">
                      <span className="text-muted w-5">#{liveKicks.length - i}</span>
                      <span className="text-slate-400 w-16 truncate">{scoutDisplayName(k.athlete, scoutNumbers)}</span>
                      <span className={clsx(k.directionGood ? "text-make" : "text-miss")}>{k.distance}yd {k.hangTime.toFixed(2)}s</span>
                      <span className="text-amber-400 font-bold ml-auto">{k.score.toFixed(2)}</span>
                    </div>
                  ))}
                  <button onClick={() => setShowLiveRankings(true)} className="btn-primary w-full py-2 text-xs font-bold mt-2">Save {liveKicks.length} Kick{liveKicks.length !== 1 ? "s" : ""} to Rankings</button>
                </div>
              )}
            </div>
          </div>
        )}

        {showLiveRankings && (
          <AssignRankingsModal teamId={getTeamId() ?? ""} sport="kickoff" onConfirm={(ids) => handleLiveSave(ids)} onClose={() => setShowLiveRankings(false)} />
        )}

        {tab === "rankings" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between card-2 px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-200">Drop Worst Kick</p>
                <p className="text-[10px] text-muted">Exclude lowest score from average</p>
              </div>
              <button onClick={() => setDropWorst(!dropWorst)} className={clsx("w-10 h-5 rounded-full transition-colors relative", dropWorst ? "bg-amber-500" : "bg-surface-2 border border-border")}>
                <div className={clsx("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all", dropWorst ? "left-5" : "left-0.5")} />
              </button>
            </div>
            {!loading && ranked.length > 0 && (
              <div className="flex gap-2">
                <ExportButton onExcel={() => exportKOScoutExcel(rankedSessions)} onPDF={() => exportKOScoutPDF(rankedSessions)} />
                <button onClick={() => { setSelectMode(!selectMode); setSelectedRows(new Set()); }} className={clsx("px-3 py-1.5 text-xs font-semibold rounded-input border transition-all", selectMode ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-white hover:border-slate-500")}>{selectMode ? "Cancel" : "Select"}</button>
                {selectMode && selectedRows.size > 0 && (
                  <button onClick={handleBulkDelete} className="px-3 py-1.5 text-xs font-semibold rounded-input border border-miss/40 text-miss hover:bg-miss/10 transition-all">Delete ({selectedRows.size})</button>
                )}
              </div>
            )}
            <RankingTabs teamId={getTeamId() ?? ""} sport="kickoff" rankings={rankings} onRankingsChange={setRankings} active={activeRanking} onActiveChange={setActiveRanking} onDeleteRanking={handleDeleteRanking} />
            {loading ? (
              <p className="text-sm text-muted py-8 text-center">Loading...</p>
            ) : ranked.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">No scout data yet.</p>
            ) : (
              <div className="card space-y-3">
                <p className="text-[10px] text-muted text-center">Select charts to edit or delete them</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {selectMode && <th className="w-6 py-1 px-1"></th>}
                        <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                        {Array.from({ length: maxKicks }, (_, i) => (
                          <th key={i} className="text-[10px] text-muted text-center py-1 px-2">K{i + 1}</th>
                        ))}
                        <th className="text-[10px] text-muted text-right py-1 px-2">Avg</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                        <th className="text-[10px] text-muted text-center py-1 px-1 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const rowKey = `${r.sessionId}|||${r.name}`;
                        return (
                        <tr key={`${r.sessionId}-${r.name}`} onClick={() => { if (!selectMode) setActionTarget({ sessionId: r.sessionId, name: r.name }); }} className={clsx("border-t border-border/30", !selectMode && "cursor-pointer hover:bg-surface-2/40", selectedRows.has(rowKey) && "bg-accent/10")}>
                          {selectMode && <td className="py-1 px-1"><input type="checkbox" checked={selectedRows.has(rowKey)} onChange={() => toggleRowSelection(rowKey)} className="accent-accent" /></td>}
                          <td className="py-1 px-2 font-semibold text-slate-200">
                            <span className="text-muted mr-1">{i + 1}.</span>
                            <button onClick={(e) => { e.stopPropagation(); setProfileOpen(r.name); }} className="hover:text-amber-400 transition-colors underline decoration-dotted">{scoutDisplayName(r.name, scoutNumbers)}</button>
                          </td>
                          {r.entries.map((e, j) => {
                            const isDropped = r.worst !== null && e.score === r.worst && j === r.entries.findIndex((x) => x.score === r.worst);
                            return (
                              <td key={j} className={clsx("text-center py-1 px-2", isDropped ? "opacity-40 line-through" : "")}>
                                <span className={clsx(e.directionGood ? "text-make" : "text-miss")}>
                                  <span className="font-bold">{e.distance}</span>
                                  <span className="text-[9px] block">{e.hangTime.toFixed(2)}s</span>
                                </span>
                              </td>
                            );
                          })}
                          {Array.from({ length: maxKicks - r.entries.length }, (_, j) => (
                            <td key={`e-${j}`} className="text-center py-1 px-2 text-muted">—</td>
                          ))}
                          <td className="text-right py-1 px-2 font-black text-amber-400">{r.avg.toFixed(2)}</td>
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

      {infoModal && (
        <InfoModal name={infoModal.name} notes={infoModal.notes} weather={infoModal.weather} date={infoModal.date} onSave={handleInfoSave} onClose={() => setInfoModal(null)} />
      )}

      {actionTarget && sessions.find((s) => s.id === actionTarget.sessionId) && (
        <ChartActionModal
          session={sessions.find((s) => s.id === actionTarget.sessionId)!}
          athlete={actionTarget.name}
          numbers={scoutNumbers}
          onEdit={() => { setEditTarget(actionTarget); setActionTarget(null); }}
          onClose={() => setActionTarget(null)}
        />
      )}

      {showEditChooser && (
        <EditChartChooser
          items={editChooserItems}
          numbers={scoutNumbers}
          onPick={(it) => { setShowEditChooser(false); setEditTarget({ sessionId: it.sessionId, name: it.name }); }}
          onClose={() => setShowEditChooser(false)}
        />
      )}

      {editTarget && editSession && (
        <EditChartModal
          teamId={getTeamId() ?? ""}
          session={editSession}
          athlete={editTarget.name}
          numbers={scoutNumbers}
          onClose={() => setEditTarget(null)}
          onSaved={async () => { setEditTarget(null); setSelectMode(false); setSelectedRows(new Set()); await loadData(); }}
        />
      )}
    </>
  );
}
