"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLongSnap } from "@/lib/longSnapContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { loadAthletes } from "@/lib/athleteStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { AthleteSnapPopup, type SnapLogEntry } from "@/components/ui/AthleteSnapPopup";
import Link from "next/link";
import clsx from "clsx";
import type { LongSnapEntry } from "@/types";

function SnapAthleteChartInner() {
  const searchParams = useSearchParams();
  const assignedId = searchParams.get("assigned");
  const { user } = useAuth();
  const { athletes, commitPractice } = useLongSnap();

  const [chartNowData] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("coach_snap_chart_now");
      if (raw) { localStorage.removeItem("coach_snap_chart_now"); const data = JSON.parse(raw); if (data.players?.length > 0) return data; }
    } catch {}
    return null;
  });

  const [phase, setPhase] = useState<"setup" | "preview" | "live" | "results">(assignedId ? "preview" : chartNowData ? "live" : "setup");
  const [reps, setReps] = useState(chartNowData ? String(chartNowData.reps ?? 10) : "10");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(chartNowData?.players ?? []);
  const [saved, setSaved] = useState(false);
  const [assignedChart, setAssignedChart] = useState<AssignedChart | null>(null);

  const [snapResults, setSnapResults] = useState<SnapLogEntry[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";
  const [showSnap, setShowSnap] = useState(false);
  const [snapAthletes, setSnapAthletes] = useState<string[]>([]);
  const [holderAthletes, setHolderAthletes] = useState<string[]>([]);

  const athleteNames = athletes.map((a) => a.name);
  const getPlayerResults = (name: string) => snapResults.filter((r) => r.dbEntry.athlete === name);
  const totalReps = parseInt(reps) || 0;

  useUnsavedWarning(snapResults.length > 0 && !saved);

  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const ls = await loadAthletes(tid, "ATHLETE_LONGSNAP");
      const teamLs = ls.length > 0 ? ls : await loadAthletes(tid, "LONGSNAP");
      setSnapAthletes(teamLs.map((a) => a.name));
      const h = await loadAthletes(tid, "HOLDING");
      setHolderAthletes(h.map((a) => a.name));
    })();
  }, []);

  useEffect(() => {
    if (chartNowData?.snapRows) {
      const totalR = chartNowData.snapRows.reduce((s: number, r: any) => s + (r.count ?? 0), 0);
      setAssignedChart({
        id: "chart-now", sport: "ATHLETE_LONGSNAP", createdBy: "Coach",
        createdAt: new Date().toISOString(), dueDate: "", athletes: chartNowData.players,
        kicks: [], reps: totalR,
        puntTypes: chartNowData.snapRows.map((r: any) => ({ type: r.snapType, typeId: r.snapType, typeLabel: r.snapType === "FG" ? "FG / Short Snap" : "Punt / Long Snap", count: r.count, hash: "" })),
        completedBy: {},
      } as AssignedChart);
      setReps(String(totalR));
    }
  }, []);

  useEffect(() => {
    if (!assignedId) return;
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
      if (!tid) return;
      const charts = await loadAssignedCharts(tid);
      const chart = charts.find((c) => c.id === assignedId);
      if (chart) { setAssignedChart(chart); setReps(String(chart.reps ?? 10)); }
    })();
  }, [assignedId]);

  const togglePlayer = (name: string) => setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  // Build snap schedule from assigned chart
  const snapSchedule: { snapType: "FG" | "PUNT"; label: string }[] = [];
  if (assignedChart?.puntTypes) {
    for (const pt of assignedChart.puntTypes as any[]) {
      const st = (pt.typeId ?? pt.type) as "FG" | "PUNT";
      for (let i = 0; i < (pt.count ?? 0); i++) {
        snapSchedule.push({ snapType: st, label: st === "FG" ? "Short" : "Long" });
      }
    }
  }

  const playerSnaps = getPlayerResults(currentPlayer);
  const currentSnapIdx = playerSnaps.length;
  const currentScheduleItem = snapSchedule[currentSnapIdx];
  const currentSnapType = assignedChart ? (currentScheduleItem?.snapType ?? "FG") : "FG";

  const allDbEntries: LongSnapEntry[] = snapResults.map((r) => r.dbEntry);

  const handleSave = async () => {
    if (allDbEntries.length === 0) return;
    const label = `Snap Chart — ${selectedPlayers.map((p) => `${p}: ${getPlayerResults(p).length}`).join(", ")}${assignedChart ? " (Assigned)" : ""}`;
    commitPractice(allDbEntries, label);
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

  const handleUndo = () => {
    if (snapResults.length === 0) return;
    const last = snapResults[snapResults.length - 1];
    setSnapResults((prev) => prev.slice(0, -1));
    const playerIdx = selectedPlayers.indexOf(last.dbEntry.athlete);
    if (playerIdx >= 0) setCurrentPlayerIdx(playerIdx);
    if (phase === "results") setPhase("live");
  };

  // Setup
  if (phase === "setup") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/longsnap" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Athlete Chart</h2>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Snapper(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">Snaps per player</p>
          <input type="text" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} className="input w-20 text-center text-sm font-bold py-1.5" />
        </div>
        <button onClick={() => { setPhase("live"); setCurrentPlayerIdx(0); setSnapResults([]); }} disabled={selectedPlayers.length === 0 || !totalReps} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>
      </main>
    );
  }

  // Preview
  if (phase === "preview") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/longsnap" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Assigned Snap Chart</h2>
        {assignedChart && <p className="text-xs text-muted">From {assignedChart.createdBy} — Due {new Date(assignedChart.dueDate).toLocaleDateString()}</p>}
        {snapSchedule.length > 0 && (
          <div className="card-2 space-y-1">
            {(assignedChart?.puntTypes as any[] ?? []).map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-xs text-slate-300">
                <span className="text-muted w-4">{i + 1}.</span>
                <span className="font-semibold text-slate-200">{r.typeLabel || r.type}</span>
                <span>x{r.count}</span>
              </div>
            ))}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Snapper(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
        </div>
        <button onClick={() => { setPhase("live"); setCurrentPlayerIdx(0); setSnapResults([]); }} disabled={selectedPlayers.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>
      </main>
    );
  }

  // Results
  if (phase === "results") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-6 text-center">
        <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
        <div className="flex flex-wrap gap-3 justify-center">
          {selectedPlayers.map((p) => {
            const pr = getPlayerResults(p);
            const strikes = pr.filter((r) => r.accuracy === "Strike").length;
            const totalScore = pr.reduce((s, r) => s + (r.dbEntry.score ?? 0), 0);
            const maxScore = pr.length * 3;
            return (
              <div key={p} className="card-2 px-4 py-3 text-center">
                <p className="text-sm font-bold text-slate-200">{p}</p>
                <p className="text-xl font-black text-sky-400">{pr.length} snaps</p>
                <p className="text-[10px] text-muted">{strikes}/{pr.length} strikes</p>
                {pr.some((r) => r.dbEntry.snapType === "FG") && <p className="text-[10px] text-sky-400 font-semibold">{totalScore}/{maxScore} ({maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%)</p>}
              </div>
            );
          })}
        </div>
        {/* Per-snapper breakdown */}
        {selectedPlayers.map((p) => {
          const pr = getPlayerResults(p);
          return (
            <div key={p} className="card-2 text-left text-xs">
              <p className="text-xs font-bold text-slate-200 mb-2">{p}</p>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Type</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Result</th>
                    {pr.some((r) => r.laces) && <th className="text-[10px] text-muted text-center py-1 px-2">Laces</th>}
                    <th className="text-[10px] text-muted text-center py-1 px-2">Spiral</th>
                    <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.map((r, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-2">{i + 1}</td>
                      <td className="text-center py-1 px-2 text-slate-300">{r.dbEntry.snapType === "FG" ? "Short" : "Long"}</td>
                      <td className={clsx("text-center py-1 px-2 font-bold", r.accuracy === "Strike" ? "text-make" : "text-miss")}>{r.accuracy}</td>
                      {pr.some((r) => r.laces) && <td className={clsx("text-center py-1 px-2", r.laces === "Good" ? "text-make" : r.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{r.laces === "Good" ? "Perfect" : r.laces || "—"}</td>}
                      <td className={clsx("text-center py-1 px-2", r.spiral === "Tight" ? "text-make" : "text-miss")}>{r.spiral}</td>
                      <td className="text-right py-1 px-2 font-bold text-sky-400">{r.dbEntry.score}/{r.dbEntry.snapType === "FG" ? 3 : 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <div className="flex gap-3 max-w-sm mx-auto">
          {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to History</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
          <Link href="/athlete/longsnap" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
        </div>
      </main>
    );
  }

  // Live
  return (
    <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <Link href="/athlete/longsnap" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>

      {/* Per-athlete snap circles */}
      {selectedPlayers.map((player) => {
        const pr = getPlayerResults(player);
        const isActive = player === currentPlayer;
        return (
          <div key={player} className={clsx("space-y-1", !isActive && selectedPlayers.length > 1 && "opacity-50")}>
            <button onClick={() => setCurrentPlayerIdx(selectedPlayers.indexOf(player))} className="text-xs font-bold text-slate-200 hover:text-accent transition-colors">{player}</button>
            <div className="flex flex-wrap gap-1.5">
              {pr.map((r, i) => (
                <div key={i} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold border", r.accuracy === "Strike" ? "bg-make/20 border-make/40 text-make" : "bg-miss/20 border-miss/40 text-miss")} title={`${r.dbEntry.snapType} | ${r.accuracy} | ${r.spiral}`}>
                  {r.dbEntry.snapType === "FG" ? "S" : "L"}
                </div>
              ))}
              {snapSchedule.length > 0 && Array.from({ length: Math.max(0, snapSchedule.length - pr.length) }).map((_, i) => {
                const schedIdx = pr.length + i;
                const isNext = schedIdx === currentSnapIdx && isActive;
                return (
                  <div key={`e-${i}`} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-semibold border", isNext ? "border-accent/60 text-accent bg-accent/10" : "border-border/40 text-muted/40")}>
                    {snapSchedule[schedIdx]?.snapType === "FG" ? "S" : "L"}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Current snap info */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-100">{currentPlayer}</p>
          <p className="text-xs text-muted">Snap {playerSnaps.length + 1}{snapSchedule.length > 0 ? ` / ${snapSchedule.length}` : ""}</p>
        </div>
        {assignedChart && currentScheduleItem && (
          <p className="text-xs text-muted">Type: <span className="text-slate-200 font-semibold">{currentScheduleItem.label}</span></p>
        )}
        <button onClick={() => setShowSnap(true)} className="btn-primary w-full py-3 text-sm font-bold">Log Snap</button>
      </div>

      {/* Undo + Finish */}
      <div className="flex gap-2">
        {snapResults.length > 0 && <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
        {snapResults.length > 0 && <button onClick={() => setPhase("results")} className="btn-ghost flex-1 py-2 text-xs font-bold border border-sky-500/40 text-sky-400">Finish ({snapResults.length}{snapSchedule.length > 0 ? `/${snapSchedule.length * selectedPlayers.length}` : ""})</button>}
      </div>

      {/* Running log */}
      {snapResults.length > 0 && (
        <div className="card-2 text-xs">
          <table className="w-full">
            <thead><tr>
              <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
              <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
              <th className="text-[10px] text-muted text-center py-1 px-2">Type</th>
              <th className="text-[10px] text-muted text-center py-1 px-2">Result</th>
              <th className="text-[10px] text-muted text-right py-1 px-2">Spiral</th>
            </tr></thead>
            <tbody>
              {[...snapResults].reverse().map((r, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="text-muted py-1 px-2">{snapResults.length - i}</td>
                  <td className="py-1 px-2 text-slate-200">{r.dbEntry.athlete}</td>
                  <td className="text-center py-1 px-2 text-slate-300">{r.dbEntry.snapType === "FG" ? "Short" : "Long"}</td>
                  <td className={clsx("text-center py-1 px-2 font-bold", r.accuracy === "Strike" ? "text-make" : "text-miss")}>{r.accuracy}</td>
                  <td className={clsx("text-right py-1 px-2", r.spiral === "Tight" ? "text-make" : "text-miss")}>{r.spiral}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showSnap && (
        <AthleteSnapPopup
          snapType={currentSnapType}
          athletes={snapAthletes}
          holders={holderAthletes}
          onClose={() => setShowSnap(false)}
          onSaved={(entry) => {
            setSnapResults((prev) => [...prev, entry]);
            setShowSnap(false);
            // Auto-advance
            if (selectedPlayers.length > 1) {
              setCurrentPlayerIdx((currentPlayerIdx + 1) % selectedPlayers.length);
            }
            // Check if done
            if (snapSchedule.length > 0) {
              const newTotal = snapResults.length + 1;
              if (newTotal >= snapSchedule.length * selectedPlayers.length) setPhase("results");
            }
          }}
        />
      )}
    </main>
  );
}

export default function SnapAthleteChartPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}>
      <SnapAthleteChartInner />
    </Suspense>
  );
}
