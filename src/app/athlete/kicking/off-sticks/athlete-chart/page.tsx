"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useFG } from "@/lib/fgContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import Link from "next/link";
import clsx from "clsx";

const HASH_OPTIONS = ["Left", "LM", "M", "RM", "Right"];

interface PresetKick { distance: number; hash: string; pointValue: number }
interface FGResult { athlete: string; kickNum: number; distance: number; hash: string; pointValue: number; result: "make" | "miss"; score: number }

function AthleteChartInner() {
  const searchParams = useSearchParams();
  const assignedId = searchParams.get("assigned");
  const { user } = useAuth();
  const { athletes, commitPractice } = useFG();

  const [phase, setPhase] = useState<"setup" | "live" | "results">(assignedId ? "live" : "setup");
  const [kicks, setKicks] = useState<PresetKick[]>([]);
  const [newDist, setNewDist] = useState("30");
  const [newHash, setNewHash] = useState("M");
  const [newPoints, setNewPoints] = useState("1");
  const [selectedPlayer, setSelectedPlayer] = useState(user?.name ?? "");
  const [saved, setSaved] = useState(false);

  // Grid-based results
  const [resultMap, setResultMap] = useState<Record<number, "make" | "miss">>({});
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Load assigned chart if provided
  const [assignedChart, setAssignedChart] = useState<AssignedChart | null>(null);

  useEffect(() => {
    if (!assignedId) return;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
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
  const getResultCount = () => Object.keys(resultMap).length;
  const getScore = () => Object.entries(resultMap).reduce((s, [idx, res]) => {
    if (res === "make") return s + (kicks[parseInt(idx)]?.pointValue ?? 0);
    return s;
  }, 0);

  useUnsavedWarning(getResultCount() > 0 && !saved);

  const addKick = () => {
    const d = parseInt(newDist) || 30;
    const p = parseInt(newPoints) || 1;
    setKicks((prev) => [...prev, { distance: d, hash: newHash, pointValue: p }]);
  };

  const handleResult = (result: "make" | "miss") => {
    if (activeIdx === null) return;
    setResultMap((prev) => ({ ...prev, [activeIdx]: result }));
    // Auto-advance
    for (let i = activeIdx + 1; i < kicks.length; i++) {
      if (!resultMap[i] && i !== activeIdx) { setActiveIdx(i); return; }
    }
    for (let i = 0; i < activeIdx; i++) {
      if (!resultMap[i]) { setActiveIdx(i); return; }
    }
    setActiveIdx(null);
  };

  const handleClear = () => {
    if (activeIdx === null) return;
    setResultMap((prev) => { const next = { ...prev }; delete next[activeIdx]; return next; });
  };

  const handleFinish = () => {
    if (getResultCount() > 0) setPhase("results");
  };

  const handleSave = async () => {
    const results: FGResult[] = [];
    for (let i = 0; i < kicks.length; i++) {
      const res = resultMap[i];
      if (!res) continue;
      const k = kicks[i];
      results.push({ athlete: selectedPlayer, kickNum: i + 1, distance: k.distance, hash: k.hash, pointValue: k.pointValue, result: res, score: res === "make" ? k.pointValue : 0 });
    }
    const label = `Off Sticks — ${selectedPlayer}: ${getScore()}${assignedChart ? " (Assigned)" : ""}`;
    commitPractice(results as never[], label);

    // Mark assigned chart as completed
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

  // ── Setup ──
  if (phase === "setup") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/kicking/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Athlete Chart</h2>
        <p className="text-xs text-muted">Build your own chart and kick it.</p>

        {/* Select yourself */}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Kicker</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => setSelectedPlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayer === a ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
        </div>

        {/* Build chart */}
        {kicks.length > 0 && (
          <div className="card-2 space-y-1">
            {kicks.map((k, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                <span className="text-muted w-6">{i + 1}.</span>
                <span className="text-slate-200 font-semibold">{k.distance}yd</span>
                <span className="text-slate-300">{k.hash}</span>
                <span className="text-sky-400 font-bold">{k.pointValue}pt</span>
                <button onClick={() => setKicks((prev) => prev.filter((_, j) => j !== i))} className="text-miss text-[10px] hover:underline">Remove</button>
              </div>
            ))}
          </div>
        )}

        <div className="card space-y-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Add Kick</p>
          <div className="grid grid-cols-3 gap-2">
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
            <div>
              <p className="text-[10px] text-muted text-center mb-1">Points</p>
              <input type="text" inputMode="numeric" value={newPoints} onChange={(e) => setNewPoints(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
            </div>
          </div>
          <button onClick={addKick} disabled={!newDist} className="btn-primary w-full py-2 text-xs font-bold disabled:opacity-40">Add Kick</button>
        </div>

        <button onClick={() => setPhase("live")} disabled={kicks.length === 0 || !selectedPlayer} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>
      </main>
    );
  }

  // ── Results ──
  if (phase === "results") {
    const kickInfo = kicks.map((k, i) => ({ num: i + 1, ...k }));
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-6 text-center">
        <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
        <p className="text-sm text-slate-300">{selectedPlayer}</p>
        <div className="card-2 py-4">
          <p className="text-4xl font-black text-sky-400">{getScore()}</p>
          <p className="text-xs text-muted">total score</p>
        </div>
        <div className="grid grid-cols-5 gap-1.5 max-w-xs mx-auto">
          {kickInfo.map((k, i) => {
            const res = resultMap[i];
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <p className="text-[8px] text-muted">{k.distance}{k.hash}</p>
                <div className={clsx("w-9 h-9 rounded-full border-2 flex items-center justify-center text-[10px] font-bold",
                  res === "make" ? "bg-make/30 border-make text-make" : res === "miss" ? "bg-miss/30 border-miss text-miss" : "border-border text-muted"
                )}>
                  {res === "make" ? k.pointValue : res === "miss" ? "0" : ""}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 max-w-sm mx-auto">
          {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to History</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
          <Link href="/athlete/kicking" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
        </div>
      </main>
    );
  }

  // ── Live ──
  const activeKick = activeIdx !== null ? kicks[activeIdx] : null;

  return (
    <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">{selectedPlayer}{assignedChart ? " — Assigned Chart" : ""}</p>
        <p className="text-2xl font-black text-sky-400">{getScore()}</p>
      </div>

      {/* Grid */}
      <div className="card-2 p-3 space-y-2">
        <div className="grid grid-cols-5 gap-1.5">
          {kicks.map((k, i) => {
            const res = resultMap[i];
            const isActive = activeIdx === i;
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <p className="text-[8px] text-muted leading-none">{k.distance}{k.hash}</p>
                <button
                  onClick={() => setActiveIdx(i)}
                  className={clsx(
                    "w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center text-[10px] font-bold",
                    isActive && "ring-2 ring-sky-400 ring-offset-1 ring-offset-bg",
                    res === "make" && "bg-make/30 border-make text-make",
                    res === "miss" && "bg-miss/30 border-miss text-miss",
                    !res && "border-border bg-surface-2 text-muted hover:border-slate-400"
                  )}
                >
                  {res === "make" ? k.pointValue : res === "miss" ? "0" : ""}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {activeKick && (
        <div className="card-2 py-2 px-4 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-100">{activeKick.distance}yd {activeKick.hash} — {activeKick.pointValue}pt</p>
        </div>
      )}

      {activeIdx !== null && (
        <div className="flex gap-3">
          <button onClick={() => handleResult("make")} className="flex-1 py-5 rounded-input text-lg font-black bg-make/20 text-make border-2 border-make/40 hover:bg-make/30 transition-all">MAKE</button>
          <button onClick={() => handleResult("miss")} className="flex-1 py-5 rounded-input text-lg font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all">MISS</button>
        </div>
      )}

      <div className="flex gap-2">
        {activeIdx !== null && resultMap[activeIdx] && (
          <button onClick={handleClear} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Clear</button>
        )}
        {getResultCount() > 0 && (
          <button onClick={handleFinish} className="btn-ghost flex-1 py-2 text-xs font-bold border border-sky-500/40 text-sky-400">Finish Chart</button>
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
