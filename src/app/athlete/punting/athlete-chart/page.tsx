"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { usePunt } from "@/lib/puntContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import Link from "next/link";
import clsx from "clsx";
import type { PuntEntry } from "@/types";

function PuntAthleteChartInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignedId = searchParams.get("assigned");
  const { user } = useAuth();
  const { athletes, commitPractice } = usePunt();

  const [phase, setPhase] = useState<"setup" | "preview" | "live" | "results">(assignedId ? "preview" : "setup");
  const [chartType, setChartType] = useState<"preset" | "live">("preset");
  const [reps, setReps] = useState("5");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [assignedChart, setAssignedChart] = useState<AssignedChart | null>(null);

  const [results, setResults] = useState<PuntEntry[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";

  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [opInput, setOpInput] = useState("");
  const [dirGood, setDirGood] = useState(true);

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const athleteNames = athletes.map((a) => a.name);
  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const totalReps = parseInt(reps) || 0;

  useUnsavedWarning(results.length > 0 && !saved);

  useEffect(() => {
    if (!assignedId) return;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
      if (!tid) return;
      const charts = await loadAssignedCharts(tid);
      const chart = charts.find((c) => c.id === assignedId);
      if (chart) { setAssignedChart(chart); setReps(String(chart.reps ?? 5)); }
    }
    load();
  }, [assignedId]);

  const togglePlayer = (name: string) => setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const handleLog = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    const op = parseHangRaw(opInput);
    if (isNaN(dist) || dist <= 0 || !hang) return;
    const kickNum = getPlayerResults(currentPlayer).length + 1;
    const entry: PuntEntry = {
      athleteId: currentPlayer, athlete: currentPlayer, type: "PUNT", hash: "M" as any,
      yards: dist, hangTime: hang, opTime: op || 0,
      directionalAccuracy: dirGood ? 1 : 0, landingZones: [] as any, kickNum,
    };
    setResults((prev) => [...prev, entry]);
    setDistInput(""); setHangInput(""); setOpInput(""); setDirGood(true);
    const nextIdx = (currentPlayerIdx + 1) % selectedPlayers.length;
    setCurrentPlayerIdx(nextIdx);
    if (chartType === "preset" && results.length + 1 >= totalReps * selectedPlayers.length) setPhase("results");
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    const last = results[results.length - 1];
    setResults((prev) => prev.slice(0, -1));
    setCurrentPlayerIdx(selectedPlayers.indexOf(last.athlete));
    if (phase === "results") setPhase("live");
  };

  const handleSave = async () => {
    const label = `Punt Chart — ${selectedPlayers.map((p) => `${p}: ${getPlayerResults(p).length} punts`).join(", ")}${assignedChart ? " (Assigned)" : ""}`;
    commitPractice(results, label);
    if (assignedChart) {
      const tid = getTeamId();
      if (tid) {
        const charts = await loadAssignedCharts(tid);
        const completedMap: Record<string, string> = {};
        selectedPlayers.forEach((p) => { completedMap[p] = new Date().toISOString(); });
        const updated = charts.map((c) => c.id === assignedChart.id ? { ...c, completedBy: { ...c.completedBy, ...completedMap } } : c);
        await saveAssignedCharts(tid, updated);
      }
    }
    setSaved(true);
  };

  // ── Setup ──
  if (phase === "setup") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/punting/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Athlete Chart</h2>
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setChartType("preset")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", chartType === "preset" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Preset Chart</button>
          <button onClick={() => setChartType("live")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", chartType === "live" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Live Chart</button>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Punter(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
          {selectedPlayers.length > 1 && <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>}
        </div>
        {chartType === "preset" && (
          <div>
            <p className="text-xs text-muted mb-1">Punts per player</p>
            <input type="text" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} className="input w-20 text-center text-sm font-bold py-1.5" />
          </div>
        )}
        <button onClick={() => { setPhase(assignedId ? "preview" : "live"); setCurrentPlayerIdx(0); setResults([]); }} disabled={selectedPlayers.length === 0 || (chartType === "preset" && !totalReps)} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">{chartType === "preset" ? "Start Preset Chart" : "Start Live Chart"}</button>
      </main>
    );
  }

  // ── Preview (assigned) ──
  if (phase === "preview") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/punting/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Assigned Punt Chart</h2>
        {assignedChart && <p className="text-xs text-muted">From {assignedChart.createdBy} — Due {new Date(assignedChart.dueDate).toLocaleDateString()}</p>}
        <p className="text-sm text-slate-200">{reps} punts per athlete</p>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Punter(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
        </div>
        <button onClick={() => { setPhase("live"); setCurrentPlayerIdx(0); setResults([]); }} disabled={selectedPlayers.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>
      </main>
    );
  }

  // ── Results ──
  if (phase === "results") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-6 text-center">
        <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
        <div className="flex flex-wrap gap-3 justify-center">
          {selectedPlayers.map((p) => {
            const pr = getPlayerResults(p);
            const avgDist = pr.length > 0 ? (pr.reduce((s, r) => s + r.yards, 0) / pr.length).toFixed(1) : "—";
            const avgHang = pr.length > 0 ? (pr.reduce((s, r) => s + r.hangTime, 0) / pr.length).toFixed(2) : "—";
            return (
              <div key={p} className="card-2 px-4 py-3 text-center">
                <p className="text-sm font-bold text-slate-200">{p}</p>
                <p className="text-xl font-black text-sky-400">{pr.length} punts</p>
                <p className="text-[10px] text-muted">Avg: {avgDist}yd / {avgHang}s</p>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 max-w-sm mx-auto">
          {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to History</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
          <Link href="/athlete/punting" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
        </div>
      </main>
    );
  }

  // ── Live ──
  const playerCount = getPlayerResults(currentPlayer).length;

  return (
    <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-4xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{chartType === "preset" ? `Punt ${playerCount + 1} of ${totalReps}` : "Live Chart"}</p>
            <p className="text-lg font-extrabold text-slate-100">{currentPlayer}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-sky-400">{getPlayerResults(currentPlayer).length}</p>
            <p className="text-[10px] text-muted">punts</p>
          </div>
        </div>

        {selectedPlayers.length > 1 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {selectedPlayers.map((p) => (
              <button key={p} onClick={() => setCurrentPlayerIdx(selectedPlayers.indexOf(p))} className={clsx("card-2 px-3 py-1.5 text-center min-w-[70px]", p === currentPlayer ? "ring-2 ring-sky-500" : "opacity-60 hover:opacity-100")}>
                <p className="text-[10px] font-bold text-slate-200">{p}</p>
                <p className="text-sm font-black text-sky-400">{getPlayerResults(p).length}</p>
              </button>
            ))}
          </div>
        )}

        {chartType === "preset" && (
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${(results.length / (totalReps * selectedPlayers.length)) * 100}%` }} />
          </div>
        )}

        <div className="card space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Distance</p>
              <input type="text" inputMode="numeric" value={distInput} onChange={(e) => setDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
            </div>
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Hang Time</p>
              <input type="text" inputMode="numeric" value={hangInput ? parseHangRaw(hangInput).toFixed(2) : ""} onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
            </div>
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Op Time</p>
              <input type="text" inputMode="numeric" value={opInput ? parseHangRaw(opInput).toFixed(2) : ""} onChange={(e) => setOpInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Direction</p>
            <div className="flex rounded-input border border-border overflow-hidden">
              <button onClick={() => setDirGood(true)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors", dirGood ? "bg-make text-slate-900" : "text-muted hover:text-white")}>Good</button>
              <button onClick={() => setDirGood(false)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors border-l border-border", !dirGood ? "bg-miss text-white" : "text-muted hover:text-white")}>Bad</button>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {results.length > 0 && <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
          <button onClick={handleLog} disabled={!distInput || !hangInput} className="btn-primary flex-1 py-2 text-sm font-bold disabled:opacity-40">Log Punt</button>
        </div>
        {chartType === "live" && results.length > 0 && (
          <button onClick={() => setPhase("results")} className="btn-ghost w-full py-2 text-xs font-bold border border-sky-500/40 text-sky-400">Finish</button>
        )}

        {results.length > 0 && (
          <div className="card-2 text-xs">
            <table className="w-full">
              <thead><tr>
                <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                <th className="text-[10px] text-muted text-center py-1 px-2">Athlete</th>
                <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                <th className="text-[10px] text-muted text-center py-1 px-2">Hang</th>
                <th className="text-[10px] text-muted text-right py-1 px-2">Dir</th>
              </tr></thead>
              <tbody>
                {[...results].reverse().map((r, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="text-muted py-1 px-2">{results.length - i}</td>
                    <td className="text-center py-1 px-2 text-slate-300">{r.athlete}</td>
                    <td className="text-center py-1 px-2 text-slate-200">{r.yards}yd</td>
                    <td className="text-center py-1 px-2 text-slate-200">{r.hangTime.toFixed(2)}s</td>
                    <td className={clsx("text-right py-1 px-2 font-bold", r.directionalAccuracy === 1 ? "text-make" : "text-miss")}>{r.directionalAccuracy === 1 ? "Good" : "Bad"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PuntAthleteChartPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}>
      <PuntAthleteChartInner />
    </Suspense>
  );
}
