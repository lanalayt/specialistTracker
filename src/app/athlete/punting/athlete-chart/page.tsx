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

const PUNT_TYPE_TO_ID: Record<string, string> = {
  "Open Field": "DIR_STRAIGHT",
  "Pooch": "POOCH_MIDDLE",
  "Rugby": "RUGBY",
  "Banana": "BANANA_LEFT",
};

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
  const [livePuntType, setLivePuntType] = useState("DIR_STRAIGHT");

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

  // Check for "Chart Now" from coaches chart
  useEffect(() => {
    try {
      const raw = localStorage.getItem("coach_punt_chart_now");
      if (raw) {
        const data = JSON.parse(raw);
        if (data.players?.length > 0) {
          setSelectedPlayers(data.players);
          setReps(String(data.reps ?? 5));
          // Store puntRows for the schedule
          if (data.puntRows) setAssignedChart({ id: "chart-now", sport: "ATHLETE_PUNTING", createdBy: "Coach", createdAt: new Date().toISOString(), dueDate: "", athletes: data.players, kicks: [], reps: data.reps, puntTypes: data.puntRows.map((r: any) => ({ type: r.category, typeId: r.typeId, typeLabel: r.category, count: r.count, hash: r.hash })), completedBy: {} } as AssignedChart);
          setPhase("live");
        }
        localStorage.removeItem("coach_punt_chart_now");
      }
    } catch {}
  }, []);

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

  // Determine the punt type for the current rep based on assigned chart breakdown
  const getCurrentPuntType = (): string => {
    const types = assignedChart?.puntTypes;
    if (!types || types.length === 0) return "DIR_STRAIGHT";
    const playerKickNum = getPlayerResults(currentPlayer).length;
    let cumulative = 0;
    for (const t of types) {
      cumulative += t.count;
      if (playerKickNum < cumulative) return PUNT_TYPE_TO_ID[t.type] ?? t.type;
    }
    return PUNT_TYPE_TO_ID[types[types.length - 1].type] ?? types[types.length - 1].type;
  };

  // For live/preset display — show the label
  const getCurrentPuntTypeLabel = (): string => {
    const types = assignedChart?.puntTypes;
    if (!types || types.length === 0) return "";
    const playerKickNum = getPlayerResults(currentPlayer).length;
    let cumulative = 0;
    for (const t of types) {
      cumulative += t.count;
      if (playerKickNum < cumulative) return t.type;
    }
    return types[types.length - 1].type;
  };

  const handleLog = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    const op = parseHangRaw(opInput);
    if (isNaN(dist) || dist <= 0 || !hang) return;
    const kickNum = getPlayerResults(currentPlayer).length + 1;
    const puntType = assignedChart ? getCurrentPuntType() : livePuntType;
    const entry: PuntEntry = {
      athleteId: currentPlayer, athlete: currentPlayer, type: puntType as any, hash: "M" as any,
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

  // ── Live — Table-based like team mode ──
  // Build the punt schedule from assigned chart or reps
  const puntSchedule: { type: string; typeLabel: string; hash: string; idx: number }[] = [];
  if (assignedChart?.puntTypes) {
    let idx = 0;
    for (const pt of assignedChart.puntTypes as any[]) {
      for (let i = 0; i < (pt.count ?? 0); i++) {
        puntSchedule.push({ type: pt.typeId ?? pt.type, typeLabel: pt.type, hash: pt.hash ?? "M", idx });
        idx++;
      }
    }
  } else {
    for (let i = 0; i < totalReps; i++) {
      puntSchedule.push({ type: livePuntType, typeLabel: "", hash: "M", idx: i });
    }
  }

  // Track per-row data: rows[athlete][puntIdx] = { dist, hang, op, dir } or null
  const [rowData, setRowData] = useState<Record<string, Record<number, { dist: string; hang: string; op: string; dir: boolean }>>>({});
  const [activeRow, setActiveRow] = useState<{ player: string; puntIdx: number } | null>(null);

  const getRowValue = (player: string, puntIdx: number) => rowData[player]?.[puntIdx];
  const isRowFilled = (player: string, puntIdx: number) => {
    const v = getRowValue(player, puntIdx);
    return v && v.dist && v.hang;
  };
  const filledCount = selectedPlayers.reduce((s, p) => s + puntSchedule.filter((_, i) => isRowFilled(p, i)).length, 0);
  const totalCount = selectedPlayers.length * puntSchedule.length;

  const updateRowData = (player: string, puntIdx: number, field: string, value: string | boolean) => {
    setRowData((prev) => ({
      ...prev,
      [player]: { ...(prev[player] ?? {}), [puntIdx]: { ...(prev[player]?.[puntIdx] ?? { dist: "", hang: "", op: "", dir: true }), [field]: value } },
    }));
  };

  const handleSubmitAll = () => {
    const entries: PuntEntry[] = [];
    for (const player of selectedPlayers) {
      for (let i = 0; i < puntSchedule.length; i++) {
        const v = getRowValue(player, i);
        if (!v || !v.dist || !v.hang) continue;
        const dist = parseInt(v.dist) || 0;
        const hang = parseHangRaw(v.hang);
        const op = parseHangRaw(v.op);
        const pt = puntSchedule[i];
        entries.push({
          athleteId: player, athlete: player, type: pt.type as any, hash: "M" as any,
          yards: dist, hangTime: hang, opTime: op || 0,
          directionalAccuracy: v.dir ? 1 : 0, landingZones: [] as any, kickNum: i + 1,
        });
      }
    }
    setResults(entries);
    setPhase("results");
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-5xl">
      <div className="space-y-4">
        <Link href="/athlete/punting/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Punt Chart</p>
            <p className="text-lg font-extrabold text-slate-100">{selectedPlayers.join(", ")}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-sky-400">{filledCount}/{totalCount}</p>
            <p className="text-[10px] text-muted">logged</p>
          </div>
        </div>

        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${totalCount > 0 ? (filledCount / totalCount) * 100 : 0}%` }} />
        </div>

        {/* Athlete tabs */}
        {selectedPlayers.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {selectedPlayers.map((p) => {
              const filled = puntSchedule.filter((_, i) => isRowFilled(p, i)).length;
              return (
                <button key={p} onClick={() => setActiveRow(activeRow?.player === p ? null : { player: p, puntIdx: 0 })} className={clsx("card-2 px-3 py-1.5 text-center min-w-[70px]", activeRow?.player === p ? "ring-2 ring-sky-500" : "opacity-60 hover:opacity-100")}>
                  <p className="text-[10px] font-bold text-slate-200">{p}</p>
                  <p className="text-sm font-black text-sky-400">{filled}/{puntSchedule.length}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Table per athlete */}
        {selectedPlayers.map((player) => (
          <div key={player} className="card-2 space-y-2">
            <p className="text-xs font-bold text-slate-200">{player}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                    <th className="text-[10px] text-muted text-left py-1 px-1">Type</th>
                    <th className="text-[10px] text-muted text-center py-1 px-1">Hash</th>
                    <th className="text-[10px] text-muted text-center py-1 px-1">Dist</th>
                    <th className="text-[10px] text-muted text-center py-1 px-1">Hang</th>
                    <th className="text-[10px] text-muted text-center py-1 px-1">Op</th>
                    <th className="text-[10px] text-muted text-center py-1 px-1">Dir</th>
                  </tr>
                </thead>
                <tbody>
                  {puntSchedule.map((pt, i) => {
                    const v = getRowValue(player, i) ?? { dist: "", hang: "", op: "", dir: true };
                    const filled = v.dist && v.hang;
                    return (
                      <tr key={i} className={clsx("border-t border-border/30", filled ? "bg-make/5" : "")}>
                        <td className="text-muted py-1 px-1">{i + 1}</td>
                        <td className="py-1 px-1 text-slate-300 text-[10px]">{pt.typeLabel || pt.type}</td>
                        <td className="text-center py-1 px-1 text-slate-300 text-[10px]">{pt.hash}</td>
                        <td className="text-center py-1 px-1">
                          <input type="text" inputMode="numeric" value={v.dist} onChange={(e) => updateRowData(player, i, "dist", e.target.value.replace(/\D/g, ""))} className="w-10 bg-surface-2 border border-border rounded px-1 py-0.5 text-[10px] text-center text-slate-200" />
                        </td>
                        <td className="text-center py-1 px-1">
                          <input type="text" inputMode="numeric" value={v.hang ? parseHangRaw(v.hang).toFixed(2) : ""} onChange={(e) => updateRowData(player, i, "hang", e.target.value.replace(/\D/g, ""))} className="w-12 bg-surface-2 border border-border rounded px-1 py-0.5 text-[10px] text-center text-slate-200" />
                        </td>
                        <td className="text-center py-1 px-1">
                          <input type="text" inputMode="numeric" value={v.op ? parseHangRaw(v.op).toFixed(2) : ""} onChange={(e) => updateRowData(player, i, "op", e.target.value.replace(/\D/g, ""))} className="w-12 bg-surface-2 border border-border rounded px-1 py-0.5 text-[10px] text-center text-slate-200" />
                        </td>
                        <td className="text-center py-1 px-1">
                          <button onClick={() => updateRowData(player, i, "dir", !v.dir)} className={clsx("px-1.5 py-0.5 rounded text-[10px] font-bold", v.dir ? "text-make" : "text-miss")}>{v.dir ? "G" : "B"}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <button onClick={handleSubmitAll} disabled={filledCount === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">
          Submit Chart ({filledCount} punt{filledCount !== 1 ? "s" : ""})
        </button>
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
