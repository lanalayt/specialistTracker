"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useFG } from "@/lib/fgContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { AthleteSnapPopup, type SnapLogEntry } from "@/components/ui/AthleteSnapPopup";
import { FGFieldView } from "@/components/ui/FGFieldView";
import { loadAthletes } from "@/lib/athleteStore";
import { insertSession, stampSessionWrite } from "@/lib/sessionStore";
import { genId } from "@/lib/stats";
import Link from "next/link";
import clsx from "clsx";
import type { FGKick, FGPosition, FGResult, LongSnapEntry } from "@/types";
import { POSITIONS, RESULTS } from "@/types";

const HASH_OPTIONS = ["Left Hash", "LM", "M", "RM", "Right Hash"];
const HASH_TO_POS: Record<string, FGPosition> = { "Left Hash": "LH", "LM": "LM", "M": "M", "RM": "RM", "Right Hash": "RH" };
const HASH_DISPLAY: Record<string, string> = { "Left Hash": "Left Hash", "LH": "Left Hash", "LM": "Left Middle", "M": "Middle", "RM": "Right Middle", "Right Hash": "Right Hash", "RH": "Right Hash" };
const RESULT_LABEL: Record<string, string> = { YL: "GOOD", YC: "GOOD", YR: "GOOD", XL: "MISS LEFT", XR: "MISS RIGHT", XS: "MISS SHORT", X: "MISS" };

interface PresetKick { distance: number; hash: string; pointValue: number }

function AthleteChartInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const assignedId = searchParams.get("assigned");
  const { user } = useAuth();
  const { athletes, commitPractice } = useFG();

  // Check for "Chart Now" data before initial state
  const [chartNowData] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("coach_fg_chart_now");
      if (raw) {
        localStorage.removeItem("coach_fg_chart_now");
        const data = JSON.parse(raw);
        if (data.kicks?.length > 0 && data.players?.length > 0) return data;
      }
    } catch {}
    return null;
  });

  const [phase, setPhase] = useState<"setup" | "preview" | "live" | "live-chart" | "results">(assignedId ? "preview" : chartNowData ? "live" : "setup");
  const [chartType, setChartType] = useState<"preset" | "live">("preset");
  const [kicks, setKicks] = useState<PresetKick[]>(chartNowData?.kicks ?? []);
  const [newDist, setNewDist] = useState("30");
  const [newHash, setNewHash] = useState("M");
  const [newPoints, setNewPoints] = useState("1");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(chartNowData?.players ?? []);
  const [saved, setSaved] = useState(false);
  const [assignedChart, setAssignedChart] = useState<AssignedChart | null>(null);
  const [kickMode, setKickMode] = useState<"sticks" | "live">("sticks");
  const [opTimeInput, setOpTimeInput] = useState("");

  // Live chart inputs
  const [liveDist, setLiveDist] = useState("30");
  const [liveHash, setLiveHash] = useState("M");
  const [showSnap, setShowSnap] = useState(false);
  const [pendingResult, setPendingResult] = useState<FGResult | null>(null);
  // Store snap logs per kick key (player-kickIdx)
  const [snapLogsMap, setSnapLogsMap] = useState<Record<string, SnapLogEntry[]>>({});
  const [snapAthletes, setSnapAthletes] = useState<string[]>([]);
  const [holderAthletes, setHolderAthletes] = useState<string[]>([]);
  const [holderEnabled, setHolderEnabled] = useState(true);

  // Load holderEnabled from FG settings
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fgSettings");
      if (raw) { const p = JSON.parse(raw); if (typeof p.holderEnabled === "boolean") setHolderEnabled(p.holderEnabled); }
    } catch {}
  }, []);

  useEffect(() => {
    async function loadSnapAndHold() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      // Load snappers
      const ls = await loadAthletes(tid, "ATHLETE_LONGSNAP");
      const teamLs = ls.length > 0 ? ls : await loadAthletes(tid, "LONGSNAP");
      setSnapAthletes(teamLs.map((a) => a.name));
      // Load holders
      const h = await loadAthletes(tid, "HOLDING");
      setHolderAthletes(h.map((a) => a.name));
    }
    loadSnapAndHold();
  }, []);

  // Live charting state — rotate through athletes per kick
  const [currentKickIdx, setCurrentKickIdx] = useState(0);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [results, setResults] = useState<FGKick[]>([]);
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";

  useEffect(() => {
    if (!assignedId) return;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
      if (!tid) return;
      const charts = await loadAssignedCharts(tid);
      const chart = charts.find((c) => c.id === assignedId);
      if (chart) {
        setAssignedChart(chart);
        setKicks(chart.kicks);
      }
    }
    load();
  }, [assignedId]);

  const athleteNames = athletes.map((a) => a.name);
  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerMakes = (name: string) => getPlayerResults(name).filter((r) => r.result.startsWith("Y")).length;
  const makes = results.filter((r) => r.result.startsWith("Y")).length;
  const total = results.length;

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };


  useUnsavedWarning(results.length > 0 && !saved);

  const addKick = () => {
    const d = parseInt(newDist) || 30;
    const p = parseInt(newPoints) || 1;
    setKicks((prev) => [...prev, { distance: d, hash: newHash, pointValue: p }]);
  };

  const formatOpTime = (raw: string): string => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 1) return digits;
    if (digits.length === 2) return digits[0] + "." + digits[1];
    return digits.slice(0, -2) + "." + digits.slice(-2);
  };

  const parseOpTime = (val: string): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  const handleResult = (result: FGResult) => {
    setPendingResult(result);
  };

  const handleSubmitKick = () => {
    if (!pendingResult || currentKickIdx >= kicks.length) return;
    const kick = kicks[currentKickIdx];
    const pos = HASH_TO_POS[kick.hash] ?? "M";
    const opTime = kickMode === "live" && opTimeInput ? parseOpTime(formatOpTime(opTimeInput)) : undefined;
    const entry: FGKick = {
      athleteId: currentPlayer,
      athlete: currentPlayer,
      dist: kick.distance,
      pos,
      result: pendingResult,
      score: 0,
      opTime: opTime || undefined,
      kickNum: currentKickIdx + 1,
    };
    setResults((prev) => [...prev, entry]);
    setOpTimeInput("");
    setPendingResult(null);

    // Rotate: next player on same kick, or next kick when all players done
    const nextPlayerIdx = currentPlayerIdx + 1;
    if (nextPlayerIdx < selectedPlayers.length) {
      setCurrentPlayerIdx(nextPlayerIdx);
    } else {
      setCurrentPlayerIdx(0);
      if (currentKickIdx + 1 < kicks.length) {
        setCurrentKickIdx(currentKickIdx + 1);
      } else {
        setPhase("results");
      }
    }
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    // Step back to previous player/kick
    if (currentPlayerIdx > 0) {
      setCurrentPlayerIdx(currentPlayerIdx - 1);
    } else {
      setCurrentPlayerIdx(selectedPlayers.length - 1);
      setCurrentKickIdx(Math.max(0, currentKickIdx - (phase === "results" ? 0 : 1)));
    }
    if (phase === "results") setPhase(chartType === "live" ? "live-chart" : "live");
  };

  const handleLiveResult = (result: FGResult) => {
    const dist = parseInt(liveDist) || 0;
    if (dist <= 0) return;
    const pos = HASH_TO_POS[liveHash] ?? "M";
    const opTime = kickMode === "live" && opTimeInput ? parseOpTime(formatOpTime(opTimeInput)) : undefined;
    const entry: FGKick = {
      athleteId: currentPlayer,
      athlete: currentPlayer,
      dist,
      pos,
      result,
      score: 0,
      opTime: opTime || undefined,
      kickNum: getPlayerResults(currentPlayer).length + 1,
    };
    setResults((prev) => [...prev, entry]);
    setOpTimeInput("");
    // Auto-rotate
    const nextIdx = (selectedPlayers.indexOf(currentPlayer) + 1) % selectedPlayers.length;
    setCurrentPlayerIdx(nextIdx);
  };

  const handleFinishLive = () => {
    if (results.length > 0) setPhase("results");
  };

  // Collect all snap entries from snapLogsMap
  const allSnapEntries: LongSnapEntry[] = Object.values(snapLogsMap).flat().map((s) => s.dbEntry);

  const handleSave = async () => {
    const names = selectedPlayers.join(", ");
    const label = `${new Date().toLocaleDateString()} — ${names}${assignedChart ? " (Assigned)" : ""}`;
    // Attach holder from snap logs to each kick
    const enrichedResults = results.map((r, i) => {
      const playerKickIdx = results.slice(0, i + 1).filter((k) => k.athlete === r.athlete).length - 1;
      const snapLog = snapLogsMap[`${r.athlete}-${playerKickIdx}`];
      const holder = snapLog?.[0]?.snapper ? (snapLog[0].holder || undefined) : undefined;
      return holder ? { ...r, holder } : r;
    });
    commitPractice(enrichedResults, label);

    // Batch save all snap entries as one session
    if (allSnapEntries.length > 0) {
      const tid = getTeamId();
      if (tid) {
        const snapperNames = [...new Set(allSnapEntries.map((e) => e.athlete))].join(", ");
        const snapSession = {
          id: genId(), teamId: tid, sport: "ATHLETE_LONGSNAP",
          label: `Short Snap — ${new Date().toLocaleDateString()} — ${snapperNames}`,
          date: new Date().toISOString(), mode: "practice" as const,
          entries: allSnapEntries,
        };
        stampSessionWrite(tid);
        await insertSession(tid, snapSession as any);
      }
    }

    if (assignedChart) {
      const tid = getTeamId();
      if (tid) {
        const charts = await loadAssignedCharts(tid);
        const completedMap: Record<string, string> = {};
        selectedPlayers.forEach((p) => { completedMap[p] = new Date().toISOString(); });
        const updated = charts.map((c) =>
          c.id === assignedChart.id
            ? { ...c, completedBy: { ...c.completedBy, ...completedMap } }
            : c
        );
        await saveAssignedCharts(tid, updated);
      }
    }
    setSaved(true);
  };

  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteSelection, setDeleteSelection] = useState<string[]>([]);

  const toggleDeleteSelection = (name: string) => {
    setDeleteSelection((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const handleDeleteSelected = async () => {
    if (!assignedChart || deleteSelection.length === 0) return;
    const remaining = assignedChart.athletes.filter((a) => !deleteSelection.includes(a));
    const msg = remaining.length === 0
      ? "This will delete the entire chart. Are you sure?"
      : `Remove ${deleteSelection.join(", ")} from this chart?`;
    if (!window.confirm(msg)) return;
    const tid = getTeamId();
    if (!tid) return;
    const charts = await loadAssignedCharts(tid);
    let updated: typeof charts;
    if (remaining.length === 0) {
      updated = charts.filter((c) => c.id !== assignedChart.id);
    } else {
      const newCompleted = { ...assignedChart.completedBy };
      deleteSelection.forEach((n) => delete newCompleted[n]);
      updated = charts.map((c) => c.id === assignedChart.id ? { ...c, athletes: remaining, completedBy: newCompleted } : c);
    }
    await saveAssignedCharts(tid, updated);
    // Stay on preview — reload chart data
    setAssignedChart(null);
    setPhase(assignedId ? "preview" : "setup");
    // Reload to check if chart still exists
    const reloaded = await loadAssignedCharts(tid);
    const still = reloaded.find((c) => c.id === assignedId);
    if (!still) {
      // Chart fully deleted, go back to session page
      router.push("/athlete/kicking/session");
    }
  };

  // ── Setup (self-service) ──
  if (phase === "setup") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/kicking/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Athlete Chart</h2>

        {/* Preset / Live tabs */}
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setChartType("preset")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", chartType === "preset" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Preset Chart</button>
          <button onClick={() => setChartType("live")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", chartType === "live" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Live Chart</button>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Kicker(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
          {selectedPlayers.length > 1 && <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>}
        </div>

        {chartType === "preset" && (
          <>
            {kicks.length > 0 && (
              <div className="card-2 space-y-1">
                {kicks.map((k, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                    <span className="text-muted w-6">{i + 1}.</span>
                    <span className="text-slate-200 font-semibold">{k.distance}yd</span>
                    <span className="text-slate-300">{k.hash}</span>
                    <button onClick={() => setKicks((prev) => prev.filter((_, j) => j !== i))} className="text-miss text-[10px] hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div className="card space-y-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Add Kick</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                  <input type="text" inputMode="numeric" value={newDist} onChange={(e) => setNewDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                </div>
                <div>
              <p className="text-[10px] text-muted text-center mb-1">Hash</p>
              <select value={newHash} onChange={(e) => setNewHash(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5">
                {HASH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addKick} disabled={!newDist} className="btn-primary w-full py-2 text-xs font-bold disabled:opacity-40">Add Kick</button>
        </div>

            <button onClick={() => setPhase("preview")} disabled={kicks.length === 0 || selectedPlayers.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Preview Chart</button>
          </>
        )}

        {chartType === "live" && (
          <button onClick={() => { setPhase("live-chart"); setCurrentPlayerIdx(0); setResults([]); }} disabled={selectedPlayers.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Live Chart</button>
        )}
      </main>
    );
  }

  // ── Preview ──
  if (phase === "preview") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/kicking/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">
          {assignedChart ? "Assigned Chart" : "Chart Preview"}
        </h2>
        {assignedChart && (
          <p className="text-xs text-muted">From {assignedChart.createdBy} — Due {new Date(assignedChart.dueDate).toLocaleDateString()}</p>
        )}

        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Kicker(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
          {selectedPlayers.length > 1 && <p className="text-xs text-muted mt-1">Order: {selectedPlayers.join(" → ")}</p>}
        </div>

        <div className="card-2 space-y-1">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">{kicks.length} Kick{kicks.length !== 1 ? "s" : ""}</p>
          {kicks.map((k, i) => (
            <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/30 last:border-0">
              <span className="text-muted w-6 text-xs">{i + 1}.</span>
              <span className="text-slate-100 font-bold">{k.distance}yd</span>
              <span className="text-slate-300">{k.hash}</span>
            </div>
          ))}
        </div>

        <button onClick={() => { setPhase("live"); setCurrentKickIdx(0); setCurrentPlayerIdx(0); setResults([]); }} disabled={selectedPlayers.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>

        {assignedChart && !deleteMode && (
          <button onClick={() => setDeleteMode(true)} className="w-full text-xs text-muted hover:text-miss transition-colors py-2">Delete Chart</button>
        )}
        {assignedChart && deleteMode && (
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-miss uppercase tracking-wider">Select athletes to remove</p>
            <div className="flex flex-wrap gap-1.5">
              {assignedChart.athletes.map((a) => (
                <button key={a} onClick={() => toggleDeleteSelection(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", deleteSelection.includes(a) ? "bg-miss/20 text-miss border border-miss/50 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setDeleteMode(false); setDeleteSelection([]); }} className="btn-ghost flex-1 py-2 text-xs">Cancel</button>
              <button onClick={handleDeleteSelected} disabled={deleteSelection.length === 0} className="btn-danger flex-1 py-2 text-xs font-bold disabled:opacity-40">
                {deleteSelection.length === assignedChart.athletes.length ? "Delete Entire Chart" : `Remove ${deleteSelection.length} Athlete${deleteSelection.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ── Live Chart (on the fly) ──
  if (phase === "live-chart") {
    return (
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-4xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Live Chart</p>
              <p className="text-lg font-extrabold text-slate-100">{currentPlayer}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-sky-400">{getPlayerMakes(currentPlayer)}/{getPlayerResults(currentPlayer).length}</p>
              <p className="text-[10px] text-muted">FG Made</p>
            </div>
          </div>

          {selectedPlayers.length > 1 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {selectedPlayers.map((p) => (
                <button key={p} onClick={() => setCurrentPlayerIdx(selectedPlayers.indexOf(p))} className={clsx("card-2 px-3 py-1.5 text-center min-w-[70px]", p === currentPlayer ? "ring-2 ring-sky-500" : "opacity-60 hover:opacity-100")}>
                  <p className="text-[10px] font-bold text-slate-200">{p}</p>
                  <p className="text-sm font-black text-sky-400">{getPlayerMakes(p)}/{getPlayerResults(p).length}</p>
                </button>
              ))}
            </div>
          )}

          {/* Sticks / Live toggle + Log Snap */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-input border border-border overflow-hidden w-fit">
              <button onClick={() => setKickMode("sticks")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", kickMode === "sticks" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Sticks</button>
              <button onClick={() => setKickMode("live")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", kickMode === "live" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Live Op</button>
            </div>
            {kickMode === "live" && (
              <button onClick={() => setShowSnap(true)} className={clsx("px-3 py-1.5 rounded-input border text-[10px] font-semibold transition-colors", (snapLogsMap[`${currentPlayer}-${currentKickIdx}`]?.length ?? 0) > 0 ? "bg-make/20 border-make/50 text-make hover:bg-make/30" : "border-sky-500/30 text-sky-400 hover:bg-sky-500/10")}>{(snapLogsMap[`${currentPlayer}-${currentKickIdx}`]?.length ?? 0) > 0 ? "Snap Logged ✓" : "Log Snap"}</button>
            )}
          </div>

          {/* Distance + Hash inputs */}
          <div className="card space-y-3">
            <div className={clsx("grid gap-2", kickMode === "live" ? "grid-cols-3" : "grid-cols-2")}>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                <input type="text" inputMode="numeric" value={liveDist} onChange={(e) => setLiveDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Hash</p>
                <select value={liveHash} onChange={(e) => setLiveHash(e.target.value)} className="input w-full text-center text-lg font-bold py-2">
                  {HASH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              {kickMode === "live" && (
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Op Time</p>
                  <input type="text" inputMode="numeric" value={opTimeInput ? formatOpTime(opTimeInput) : ""} onChange={(e) => setOpTimeInput(e.target.value.replace(/\D/g, ""))} placeholder="1.32" className="input w-full text-center text-lg font-bold py-2" />
                </div>
              )}
            </div>
          </div>

          {/* Result buttons */}
          <button onClick={() => handleLiveResult("YC")} disabled={!liveDist} className="w-full py-6 rounded-card text-xl font-black bg-make/20 text-make border-2 border-make/40 hover:bg-make/30 transition-all active:scale-95 disabled:opacity-40">GOOD</button>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => handleLiveResult("XL")} disabled={!liveDist} className="py-4 rounded-card text-sm font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all active:scale-95 disabled:opacity-40">MISS LEFT</button>
            <button onClick={() => handleLiveResult("XS")} disabled={!liveDist} className="py-4 rounded-card text-sm font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all active:scale-95 disabled:opacity-40">MISS SHORT</button>
            <button onClick={() => handleLiveResult("XR")} disabled={!liveDist} className="py-4 rounded-card text-sm font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all active:scale-95 disabled:opacity-40">MISS RIGHT</button>
          </div>

          <div className="flex gap-2">
            {results.length > 0 && <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
            {results.length > 0 && <button onClick={handleFinishLive} className="btn-ghost flex-1 py-2 text-xs font-bold border border-sky-500/40 text-sky-400">Finish</button>}
          </div>


          {/* Running log */}
          {results.length > 0 && (
            <div className="card-2 text-xs">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                    <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Hash</th>
                    {kickMode === "live" && <th className="text-[10px] text-muted text-center py-1 px-2">Op</th>}
                    <th className="text-[10px] text-muted text-right py-1 px-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[...results].reverse().map((r, i) => {
                    const idx = results.length - 1 - i;
                    const athleteKickNum = results.slice(0, idx + 1).filter((k) => k.athlete === r.athlete).length;
                    return (
                      <tr key={i} className="border-t border-border/30">
                        <td className="text-muted py-1 px-2">{athleteKickNum}</td>
                        <td className="text-left py-1 px-2 text-slate-200 truncate max-w-[60px]">{r.athlete}</td>
                        <td className="text-center py-1 px-2 text-slate-200">{r.dist}yd</td>
                        <td className="text-center py-1 px-2 text-slate-300">{r.pos}</td>
                        {kickMode === "live" && <td className="text-center py-1 px-2 text-slate-300">{r.opTime ? r.opTime.toFixed(2) : "—"}</td>}
                        <td className={clsx("text-right py-1 px-2 font-bold", r.result.startsWith("Y") ? "text-make" : "text-miss")}>{RESULT_LABEL[r.result] ?? r.result}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showSnap && (
          <AthleteSnapPopup
            snapType="FG"
            athletes={snapAthletes}
            holders={holderAthletes}
            holderEnabled={holderEnabled}
            onHolderToggle={(on) => { setHolderEnabled(on); try { const raw = localStorage.getItem("fgSettings"); const s = raw ? JSON.parse(raw) : {}; s.holderEnabled = on; localStorage.setItem("fgSettings", JSON.stringify(s)); } catch {} }}
            kickerName={currentPlayer}
            kickDistance={kicks[currentKickIdx]?.distance}
            kickHash={kicks[currentKickIdx]?.hash}
            previousSnaps={snapLogsMap[`${currentPlayer}-${currentKickIdx}`]}
            onClose={() => setShowSnap(false)}
            onSaved={(entry) => setSnapLogsMap((prev) => ({ ...prev, [`${currentPlayer}-${currentKickIdx}`]: [...(prev[`${currentPlayer}-${currentKickIdx}`] ?? []), entry] }))}
          />
        )}
      </main>
    );
  }

  // ── Results ──
  if (phase === "results") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-6 text-center">
        <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>

        {/* Per-athlete scores */}
        <div className="flex flex-wrap gap-3 justify-center">
          {selectedPlayers.map((p) => {
            const pr = getPlayerResults(p);
            const opTimes = pr.filter((r) => r.opTime && r.opTime > 0).map((r) => r.opTime!);
            const avgOp = opTimes.length > 0 ? (opTimes.reduce((s, v) => s + v, 0) / opTimes.length).toFixed(2) : null;
            return (
              <div key={p} className="card-2 px-4 py-3 text-center">
                <p className="text-sm font-bold text-slate-200">{p}</p>
                <p className="text-3xl font-black text-sky-400">{getPlayerMakes(p)}/{getPlayerResults(p).length}</p>
                <p className="text-[10px] text-muted">FG Made</p>
                {avgOp && <p className="text-[10px] text-sky-400 mt-1">Avg Op: {avgOp}s</p>}
              </div>
            );
          })}
        </div>

        {/* Per-athlete breakdown */}
        {selectedPlayers.map((p) => {
          const pr = getPlayerResults(p);
          const hasOpTime = pr.some((r) => r.opTime && r.opTime > 0);
          return (
            <div key={p} className="card-2 text-left text-xs">
              <p className="text-xs font-bold text-slate-200 mb-2">{p}</p>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Hash</th>
                    {hasOpTime && <th className="text-[10px] text-muted text-center py-1 px-2">Op</th>}
                    <th className="text-[10px] text-muted text-right py-1 px-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.map((r, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-2">{r.kickNum}</td>
                      <td className="text-center py-1 px-2 text-slate-200">{r.dist}yd</td>
                      <td className="text-center py-1 px-2 text-slate-300">{r.pos}</td>
                      {hasOpTime && <td className="text-center py-1 px-2 text-slate-300">{r.opTime ? r.opTime.toFixed(2) : "—"}</td>}
                      <td className={clsx("text-right py-1 px-2 font-bold", r.result.startsWith("Y") ? "text-make" : "text-miss")}>{RESULT_LABEL[r.result] ?? r.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {/* Snap Summary */}
        {allSnapEntries.length > 0 && (() => {
          const snapperNames = [...new Set(allSnapEntries.map((e) => e.athlete))];
          const snapsBySnapper: Record<string, LongSnapEntry[]> = {};
          allSnapEntries.forEach((e) => {
            if (!snapsBySnapper[e.athlete]) snapsBySnapper[e.athlete] = [];
            snapsBySnapper[e.athlete].push(e);
          });
          return (
            <div className="card-2 text-left space-y-3">
              <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Short Snap Summary</p>
              {snapperNames.map((name) => {
                const snaps = snapsBySnapper[name];
                const totalScore = snaps.reduce((s, e) => s + e.score, 0);
                const maxScore = snaps.length * 3;
                const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-slate-200">{name}</p>
                      <p className="text-xs"><span className="text-sky-400 font-bold">{totalScore}</span><span className="text-muted">/{maxScore}</span> <span className="text-slate-300 font-semibold">{pct}%</span></p>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                          <th className="text-[10px] text-muted text-center py-1 px-2">Result</th>
                          <th className="text-[10px] text-muted text-center py-1 px-2">Laces</th>
                          <th className="text-[10px] text-muted text-center py-1 px-2">Spiral</th>
                          <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snaps.map((s, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="text-muted py-1 px-2">{i + 1}</td>
                            <td className={clsx("text-center py-1 px-2 font-bold", s.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>{s.accuracy === "ON_TARGET" ? "Strike" : "Ball"}</td>
                            <td className={clsx("text-center py-1 px-2 font-semibold", s.laces === "Good" ? "text-make" : s.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{s.laces === "Good" ? "Perfect" : s.laces === "1/4 Turn" ? "1/4" : s.laces ?? "—"}</td>
                            <td className={clsx("text-center py-1 px-2 font-semibold", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : s.spiral === "Bad" ? "Open" : "—"}</td>
                            <td className="text-right py-1 px-2 font-bold text-sky-400">{s.score}/{3}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div className="flex gap-3 max-w-sm mx-auto">
          {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to History</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
          <Link href="/athlete/kicking" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
        </div>
      </main>
    );
  }

  // ── Live Charting ──
  const currentKick = kicks[currentKickIdx];
  const pos = currentKick ? (HASH_TO_POS[currentKick.hash] ?? "M") : "M";

  return (
    <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-4xl">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Kick {currentKickIdx + 1} of {kicks.length}</p>
            <p className="text-lg font-extrabold text-slate-100">{currentPlayer}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-sky-400">{getPlayerMakes(currentPlayer)}/{getPlayerResults(currentPlayer).length}</p>
            <p className="text-[10px] text-muted">FG Made</p>
          </div>
        </div>

        {/* Multi-athlete scoreboard */}
        {selectedPlayers.length > 1 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {selectedPlayers.map((p) => (
              <div key={p} className={clsx("card-2 px-3 py-1.5 text-center min-w-[70px]", p === currentPlayer && "ring-2 ring-sky-500")}>
                <p className="text-[10px] font-bold text-slate-200">{p}</p>
                <p className="text-sm font-black text-sky-400">{getPlayerMakes(p)}/{getPlayerResults(p).length}</p>
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${(results.length / kicks.length) * 100}%` }} />
        </div>

        {/* Sticks / Live toggle + Op Time + Log Snap */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-input border border-border overflow-hidden w-fit">
            <button onClick={() => setKickMode("sticks")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", kickMode === "sticks" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Sticks</button>
            <button onClick={() => setKickMode("live")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", kickMode === "live" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Live Op</button>
          </div>
          {kickMode === "live" && (
            <>
              <div className="flex items-center gap-1">
                <p className="text-[10px] text-muted">OT:</p>
                <input type="text" inputMode="numeric" value={opTimeInput ? formatOpTime(opTimeInput) : ""} onChange={(e) => setOpTimeInput(e.target.value.replace(/\D/g, ""))} placeholder="1.32" className="input w-14 text-center text-[10px] font-bold py-1" />
              </div>
              <button onClick={() => setShowSnap(true)} className={clsx("px-3 py-1.5 rounded-input border text-[10px] font-semibold transition-colors", (snapLogsMap[`${currentPlayer}-${currentKickIdx}`]?.length ?? 0) > 0 ? "bg-make/20 border-make/50 text-make hover:bg-make/30" : "border-sky-500/30 text-sky-400 hover:bg-sky-500/10")}>{(snapLogsMap[`${currentPlayer}-${currentKickIdx}`]?.length ?? 0) > 0 ? "Snap Logged ✓" : "Log Snap"}</button>
            </>
          )}
        </div>

        {/* Current kick info */}
        <div className="card-2 py-4 text-center">
          <p className="text-3xl font-black text-slate-100">{currentKick?.distance} Yard Kick</p>
          <p className="text-sm text-slate-300">{HASH_DISPLAY[currentKick?.hash ?? "M"] ?? currentKick?.hash}</p>
        </div>

        {/* Result buttons — select then submit */}
        <button
          onClick={() => handleResult("YC")}
          className={clsx("w-full py-6 rounded-card text-xl font-black border-2 transition-all active:scale-95", pendingResult === "YC" ? "bg-make text-slate-900 border-make" : "bg-make/20 text-make border-make/40 hover:bg-make/30")}
        >
          GOOD
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleResult("XL")}
            className={clsx("py-4 rounded-card text-sm font-black border-2 transition-all active:scale-95", pendingResult === "XL" ? "bg-miss text-white border-miss" : "bg-miss/20 text-miss border-miss/40 hover:bg-miss/30")}
          >
            MISS LEFT
          </button>
          <button
            onClick={() => handleResult("XS")}
            className={clsx("py-4 rounded-card text-sm font-black border-2 transition-all active:scale-95", pendingResult === "XS" ? "bg-miss text-white border-miss" : "bg-miss/20 text-miss border-miss/40 hover:bg-miss/30")}
          >
            MISS SHORT
          </button>
          <button
            onClick={() => handleResult("XR")}
            className={clsx("py-4 rounded-card text-sm font-black border-2 transition-all active:scale-95", pendingResult === "XR" ? "bg-miss text-white border-miss" : "bg-miss/20 text-miss border-miss/40 hover:bg-miss/30")}
          >
            MISS RIGHT
          </button>
        </div>

        {/* Submit + Undo */}
        <div className="flex gap-2">
          {results.length > 0 && (
            <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>
          )}
          <button onClick={handleSubmitKick} disabled={!pendingResult} className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40">
            Submit Kick
          </button>
        </div>

        {/* Running log */}
        {results.length > 0 && (
          <div className="card-2 text-xs">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                  <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                  <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                  <th className="text-[10px] text-muted text-center py-1 px-2">Hash</th>
                  {kickMode === "live" && <th className="text-[10px] text-muted text-center py-1 px-2">Op</th>}
                  <th className="text-[10px] text-muted text-right py-1 px-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {[...results].reverse().map((r, i) => {
                  const idx = results.length - 1 - i;
                  const athleteKickNum = results.slice(0, idx + 1).filter((k) => k.athlete === r.athlete).length;
                  return (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-2">{athleteKickNum}</td>
                      <td className="text-left py-1 px-2 text-slate-200 truncate max-w-[60px]">{r.athlete}</td>
                      <td className="text-center py-1 px-2 text-slate-200">{r.dist}yd</td>
                      <td className="text-center py-1 px-2 text-slate-300">{kicks[idx]?.hash ?? r.pos}</td>
                      {kickMode === "live" && <td className="text-center py-1 px-2 text-slate-300">{r.opTime ? r.opTime.toFixed(2) : "—"}</td>}
                      <td className={clsx("text-right py-1 px-2 font-bold", r.result.startsWith("Y") ? "text-make" : "text-miss")}>{RESULT_LABEL[r.result] ?? r.result}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {showSnap && (
        <AthleteSnapPopup
          snapType="FG"
          athletes={snapAthletes}
          holders={holderAthletes}
          holderEnabled={holderEnabled}
          onHolderToggle={(on) => { setHolderEnabled(on); try { const raw = localStorage.getItem("fgSettings"); const s = raw ? JSON.parse(raw) : {}; s.holderEnabled = on; localStorage.setItem("fgSettings", JSON.stringify(s)); } catch {} }}
          kickerName={currentPlayer}
          kickDistance={currentKick?.distance}
          kickHash={currentKick?.hash}
          previousSnaps={snapLogsMap[`${currentPlayer}-${currentKickIdx}`]}
          onClose={() => setShowSnap(false)}
          onSaved={(entry) => setSnapLogsMap((prev) => ({ ...prev, [`${currentPlayer}-${currentKickIdx}`]: [...(prev[`${currentPlayer}-${currentKickIdx}`] ?? []), entry] }))}
        />
      )}
    </main>
  );
}

export default function AthleteChartPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}>
      <AthleteChartInner />
    </Suspense>
  );
}
