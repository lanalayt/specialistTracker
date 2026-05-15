"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useFG } from "@/lib/fgContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { FGFieldView } from "@/components/ui/FGFieldView";
import Link from "next/link";
import clsx from "clsx";
import type { FGKick, FGPosition, FGResult } from "@/types";
import { POSITIONS, RESULTS } from "@/types";

const HASH_OPTIONS = ["Left", "LM", "M", "RM", "Right"];
const HASH_TO_POS: Record<string, FGPosition> = { "Left": "LH", "LM": "LM", "M": "M", "RM": "RM", "Right": "RH" };

interface PresetKick { distance: number; hash: string; pointValue: number }

function AthleteChartInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const assignedId = searchParams.get("assigned");
  const { user } = useAuth();
  const { athletes, commitPractice } = useFG();

  const [phase, setPhase] = useState<"setup" | "preview" | "live" | "results">(assignedId ? "preview" : "setup");
  const [kicks, setKicks] = useState<PresetKick[]>([]);
  const [newDist, setNewDist] = useState("30");
  const [newHash, setNewHash] = useState("M");
  const [newPoints, setNewPoints] = useState("1");
  const [selectedPlayer, setSelectedPlayer] = useState(user?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [assignedChart, setAssignedChart] = useState<AssignedChart | null>(null);

  // Live charting state — one kick at a time
  const [currentKickIdx, setCurrentKickIdx] = useState(0);
  const [results, setResults] = useState<FGKick[]>([]);

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
  const makes = results.filter((r) => r.result.startsWith("Y")).length;
  const total = results.length;

  useUnsavedWarning(results.length > 0 && !saved);

  const addKick = () => {
    const d = parseInt(newDist) || 30;
    const p = parseInt(newPoints) || 1;
    setKicks((prev) => [...prev, { distance: d, hash: newHash, pointValue: p }]);
  };

  const handleResult = (result: FGResult) => {
    if (currentKickIdx >= kicks.length) return;
    const kick = kicks[currentKickIdx];
    const pos = HASH_TO_POS[kick.hash] ?? "M";
    const entry: FGKick = {
      athleteId: selectedPlayer,
      athlete: selectedPlayer,
      dist: kick.distance,
      pos,
      result,
      score: result.startsWith("Y") ? 1 : 0,
      kickNum: currentKickIdx + 1,
    };
    setResults((prev) => [...prev, entry]);
    if (currentKickIdx + 1 < kicks.length) {
      setCurrentKickIdx(currentKickIdx + 1);
    } else {
      setPhase("results");
    }
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    setCurrentKickIdx(Math.max(0, results.length - 1));
    if (phase === "results") setPhase("live");
  };

  const handleSave = async () => {
    const label = `Off Sticks — ${selectedPlayer}: ${makes}/${total}${assignedChart ? " (Assigned)" : ""}`;
    commitPractice(results, label);

    if (assignedChart) {
      const tid = getTeamId();
      if (tid) {
        const charts = await loadAssignedCharts(tid);
        const updated = charts.map((c) =>
          c.id === assignedChart.id
            ? { ...c, completedBy: { ...c.completedBy, [selectedPlayer]: new Date().toISOString() } }
            : c
        );
        await saveAssignedCharts(tid, updated);
      }
    }
    setSaved(true);
  };

  const handleDeleteChart = async () => {
    if (!assignedChart) return;
    if (!window.confirm("Are you sure you want to delete this assigned chart? This cannot be undone.")) return;
    const tid = getTeamId();
    if (!tid) return;
    const charts = await loadAssignedCharts(tid);
    const updated = charts.filter((c) => c.id !== assignedChart.id);
    await saveAssignedCharts(tid, updated);
    router.push("/athlete");
  };

  // ── Setup (self-service) ──
  if (phase === "setup") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/kicking/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Athlete Chart</h2>
        <p className="text-xs text-muted">Build your own chart and kick it.</p>

        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Kicker</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => setSelectedPlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayer === a ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
        </div>

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

        <button onClick={() => setPhase("preview")} disabled={kicks.length === 0 || !selectedPlayer} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Preview Chart</button>
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

        {/* Select kicker if assigned */}
        {assignedChart && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Kicker</p>
            <div className="flex flex-wrap gap-1.5">
              {athleteNames.map((a) => (
                <button key={a} onClick={() => setSelectedPlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayer === a ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
              ))}
            </div>
          </div>
        )}

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

        <button onClick={() => { setPhase("live"); setCurrentKickIdx(0); setResults([]); }} disabled={!selectedPlayer} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>

        {assignedChart && (
          <button onClick={handleDeleteChart} className="w-full text-xs text-muted hover:text-miss transition-colors py-2">Delete Chart</button>
        )}
      </main>
    );
  }

  // ── Results ──
  if (phase === "results") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-6 text-center">
        <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
        <p className="text-sm text-slate-300">{selectedPlayer}</p>
        <div className="card-2 py-4">
          <p className="text-4xl font-black text-sky-400">{makes}/{total}</p>
          <p className="text-xs text-muted">field goals made</p>
        </div>
        <div className="card-2 text-left text-xs">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                <th className="text-[10px] text-muted text-center py-1 px-2">Hash</th>
                <th className="text-[10px] text-muted text-right py-1 px-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="text-muted py-1 px-2">{i + 1}</td>
                  <td className="text-center py-1 px-2 text-slate-200">{r.dist}yd</td>
                  <td className="text-center py-1 px-2 text-slate-300">{kicks[i]?.hash ?? r.pos}</td>
                  <td className={clsx("text-right py-1 px-2 font-bold", r.result.startsWith("Y") ? "text-make" : "text-miss")}>{r.result.startsWith("Y") ? "GOOD" : "MISS"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{selectedPlayer}</p>
            <p className="text-lg font-extrabold text-slate-100">Kick {currentKickIdx + 1} of {kicks.length}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-sky-400">{makes}/{total}</p>
            <p className="text-[10px] text-muted">FG Made</p>
          </div>
        </div>

        {/* Progress */}
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${(results.length / kicks.length) * 100}%` }} />
        </div>

        {/* Current kick info */}
        <div className="card-2 py-4 text-center">
          <p className="text-3xl font-black text-slate-100">{currentKick?.distance}yd</p>
          <p className="text-sm text-slate-300">{currentKick?.hash} Hash</p>
        </div>

        {/* Make / Miss buttons — styled like team mode */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleResult("YC")}
            className="py-8 rounded-card text-xl font-black bg-make/20 text-make border-2 border-make/40 hover:bg-make/30 transition-all active:scale-95"
          >
            GOOD
          </button>
          <button
            onClick={() => handleResult("X")}
            className="py-8 rounded-card text-xl font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all active:scale-95"
          >
            MISS
          </button>
        </div>

        {/* Undo */}
        {results.length > 0 && (
          <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo Last</button>
        )}

        {/* Running log */}
        {results.length > 0 && (
          <div className="card-2 text-xs">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                  <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                  <th className="text-[10px] text-muted text-center py-1 px-2">Hash</th>
                  <th className="text-[10px] text-muted text-right py-1 px-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {[...results].reverse().map((r, i) => {
                  const kickIdx = results.length - 1 - i;
                  return (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-2">{kickIdx + 1}</td>
                      <td className="text-center py-1 px-2 text-slate-200">{r.dist}yd</td>
                      <td className="text-center py-1 px-2 text-slate-300">{kicks[kickIdx]?.hash ?? r.pos}</td>
                      <td className={clsx("text-right py-1 px-2 font-bold", r.result.startsWith("Y") ? "text-make" : "text-miss")}>{r.result.startsWith("Y") ? "GOOD" : "MISS"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
