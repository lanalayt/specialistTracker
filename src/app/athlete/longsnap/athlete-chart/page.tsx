"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useLongSnap } from "@/lib/longSnapContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import Link from "next/link";
import clsx from "clsx";
import type { LongSnapEntry, SnapType, SnapAccuracy } from "@/types";

function SnapAthleteChartInner() {
  const searchParams = useSearchParams();
  const assignedId = searchParams.get("assigned");
  const snapType = (searchParams.get("type") ?? "short") as "short" | "long";
  const isFG = snapType === "short";
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

  const [entries, setEntries] = useState<LongSnapEntry[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";

  // Inline chart state (no popup)
  const [marker, setMarker] = useState<ShortSnapMarker | null>(null);
  const [puntMarker, setPuntMarker] = useState<SnapMarker | null>(null);
  const [laces, setLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [spiral, setSpiral] = useState<"Good" | "Bad" | "">("");
  const [snapTime, setSnapTime] = useState("");
  const [selectedSnapIdx, setSelectedSnapIdx] = useState<number | null>(null);

  const athleteNames = athletes.map((a) => a.name);
  const getPlayerEntries = (name: string) => entries.filter((e) => e.athlete === name);
  const totalReps = parseInt(reps) || 0;

  const parseTimeRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  useUnsavedWarning(entries.length > 0 && !saved);

  useEffect(() => {
    if (chartNowData?.snapRows) {
      const totalR = chartNowData.snapRows.reduce((s: number, r: any) => s + (r.count ?? 0), 0);
      setAssignedChart({
        id: "chart-now", sport: "ATHLETE_LONGSNAP", createdBy: "Coach",
        createdAt: new Date().toISOString(), dueDate: "", athletes: chartNowData.players,
        kicks: [], reps: totalR, completedBy: {},
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

  const selectSnap = (playerIdx: number, snapIdx: number) => {
    setCurrentPlayerIdx(playerIdx);
    const pe = getPlayerEntries(selectedPlayers[playerIdx]);
    if (snapIdx < pe.length) {
      // Completed snap — load data
      const e = pe[snapIdx];
      setSelectedSnapIdx(snapIdx);
      if (isFG && e.markerX != null && e.markerY != null) {
        setMarker({ x: e.markerX, y: e.markerY, num: snapIdx + 1, inZone: e.markerInZone ?? false });
      } else if (!isFG && e.markerX != null && e.markerY != null) {
        setPuntMarker({ x: e.markerX, y: e.markerY, num: snapIdx + 1, inZone: e.markerInZone ?? false });
      }
      setLaces((e.laces as "Good" | "1/4 Turn" | "Back" | "") || "");
      setSpiral(e.spiral === "Good" ? "Good" : e.spiral === "Bad" ? "Bad" : "");
      setSnapTime(e.time > 0 ? String(Math.round(e.time * 100)) : "");
    } else {
      // Empty snap — clear inputs
      setSelectedSnapIdx(null);
      setMarker(null); setPuntMarker(null); setLaces(""); setSpiral(""); setSnapTime("");
    }
  };

  const canLog = isFG ? !!marker && !!laces && !!spiral : !!puntMarker && !!spiral;

  const handleLog = () => {
    if (!canLog) return;
    const acc: SnapAccuracy = isFG ? (marker?.inZone ? "ON_TARGET" : "HIGH") : (puntMarker?.inZone ? "ON_TARGET" : "HIGH");
    let score = 0;
    if (isFG) {
      if (acc === "ON_TARGET") score += 1;
      if (laces === "Good") score += 1;
      else if (laces === "1/4 Turn") score += 0.5;
      if (spiral === "Good") score += 1;
    } else {
      score = acc === "ON_TARGET" ? 1 : 0;
    }
    const entry: LongSnapEntry = {
      athleteId: currentPlayer, athlete: currentPlayer,
      snapType: (isFG ? "FG" : "PUNT") as SnapType,
      time: snapTime ? parseTimeRaw(snapTime) : 0,
      accuracy: acc, laces: isFG ? laces || undefined : undefined,
      spiral: spiral || undefined, score,
      markerX: isFG ? marker?.x : puntMarker?.x,
      markerY: isFG ? marker?.y : puntMarker?.y,
      markerInZone: isFG ? marker?.inZone : puntMarker?.inZone,
    };
    setEntries((prev) => [...prev, entry]);
    // Reset
    setMarker(null); setPuntMarker(null); setLaces(""); setSpiral(""); setSnapTime(""); setSelectedSnapIdx(null);
    // Advance
    if (selectedPlayers.length > 1) setCurrentPlayerIdx((currentPlayerIdx + 1) % selectedPlayers.length);
    // Check done
    if (entries.length + 1 >= totalReps * selectedPlayers.length) setPhase("results");
  };

  const handleUndo = () => {
    if (entries.length === 0) return;
    const last = entries[entries.length - 1];
    setEntries((prev) => prev.slice(0, -1));
    const idx = selectedPlayers.indexOf(last.athlete);
    if (idx >= 0) setCurrentPlayerIdx(idx);
    if (phase === "results") setPhase("live");
  };

  const handleSave = async () => {
    if (entries.length === 0) return;
    const label = `Snap Chart — ${selectedPlayers.map((p) => `${p}: ${getPlayerEntries(p).length}`).join(", ")}${assignedChart ? " (Assigned)" : ""}`;
    commitPractice(entries, label);
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

  const backPath = isFG ? "/athlete/longsnap/session-short" : "/athlete/longsnap/session-long";

  // Setup
  if (phase === "setup") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href={backPath} className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">{isFG ? "Short" : "Long"} Snap Chart</h2>
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
        <button onClick={() => { setPhase("live"); setCurrentPlayerIdx(0); setEntries([]); }} disabled={selectedPlayers.length === 0 || !totalReps} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>
      </main>
    );
  }

  // Preview
  if (phase === "preview") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href={backPath} className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Assigned {isFG ? "Short" : "Long"} Snap Chart</h2>
        {assignedChart && <p className="text-xs text-muted">From {assignedChart.createdBy} — Due {new Date(assignedChart.dueDate).toLocaleDateString()}</p>}
        <p className="text-sm text-slate-200">{reps} snaps per player</p>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Snapper(s)</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
        </div>
        <button onClick={() => { setPhase("live"); setCurrentPlayerIdx(0); setEntries([]); }} disabled={selectedPlayers.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start Chart</button>
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
            const pe = getPlayerEntries(p);
            const strikes = pe.filter((e) => e.accuracy === "ON_TARGET").length;
            const totalScore = pe.reduce((s, e) => s + (e.score ?? 0), 0);
            const maxScore = isFG ? pe.length * 3 : pe.length;
            return (
              <div key={p} className="card-2 px-4 py-3 text-center">
                <p className="text-sm font-bold text-slate-200">{p}</p>
                <p className="text-xl font-black text-sky-400">{pe.length} snaps</p>
                <p className="text-[10px] text-muted">{strikes}/{pe.length} strikes</p>
                <p className="text-[10px] text-sky-400 font-semibold">{totalScore}/{maxScore} ({maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0}%)</p>
              </div>
            );
          })}
        </div>
        {selectedPlayers.map((p) => {
          const pe = getPlayerEntries(p);
          return (
            <div key={p} className="card-2 text-left text-xs">
              <p className="text-xs font-bold text-slate-200 mb-2">{p}</p>
              <table className="w-full">
                <thead><tr>
                  <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                  <th className="text-[10px] text-muted text-center py-1 px-2">Result</th>
                  {isFG && <th className="text-[10px] text-muted text-center py-1 px-2">Laces</th>}
                  <th className="text-[10px] text-muted text-center py-1 px-2">Spiral</th>
                  {!isFG && <th className="text-[10px] text-muted text-center py-1 px-2">Time</th>}
                  <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                </tr></thead>
                <tbody>
                  {pe.map((e, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-2">{i + 1}</td>
                      <td className={clsx("text-center py-1 px-2 font-bold", e.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>{e.accuracy === "ON_TARGET" ? "Strike" : "Ball"}</td>
                      {isFG && <td className={clsx("text-center py-1 px-2", e.laces === "Good" ? "text-make" : e.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{e.laces === "Good" ? "Perfect" : e.laces || "—"}</td>}
                      <td className={clsx("text-center py-1 px-2", e.spiral === "Good" ? "text-make" : "text-miss")}>{e.spiral === "Good" ? "Tight" : e.spiral === "Bad" ? "Open" : "—"}</td>
                      {!isFG && <td className="text-center py-1 px-2 text-slate-300">{e.time > 0 ? `${e.time.toFixed(2)}s` : "—"}</td>}
                      <td className="text-right py-1 px-2 font-bold text-sky-400">{e.score}/{isFG ? 3 : 1}</td>
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

  // Live — diagram always visible, no popup
  const playerEntries = getPlayerEntries(currentPlayer);
  return (
    <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <Link href={backPath} className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>

      {/* Per-athlete circles */}
      {selectedPlayers.map((player) => {
        const pe = getPlayerEntries(player);
        const isActive = player === currentPlayer;
        return (
          <div key={player} className={clsx("space-y-1", !isActive && selectedPlayers.length > 1 && "opacity-50")}>
            <button onClick={() => setCurrentPlayerIdx(selectedPlayers.indexOf(player))} className="text-xs font-bold text-slate-200 hover:text-accent transition-colors">{player}</button>
            <div className="flex flex-wrap gap-1.5">
              {pe.map((e, i) => {
                const isSelected = isActive && selectedSnapIdx === i;
                return (
                  <button key={i} onClick={() => selectSnap(selectedPlayers.indexOf(player), i)} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold cursor-pointer transition-all", "bg-white text-bg border-2 border-white", isSelected && "ring-2 ring-accent shadow-md")} title={`${e.accuracy === "ON_TARGET" ? "Strike" : "Ball"}${e.laces ? " | " + e.laces : ""}${e.spiral ? " | " + (e.spiral === "Good" ? "Tight" : "Open") : ""}`}>{i + 1}</button>
                );
              })}
              {Array.from({ length: Math.max(0, totalReps - pe.length) }).map((_, i) => {
                const snapIdx = pe.length + i;
                const isNext = i === 0 && isActive && selectedSnapIdx === null;
                return (
                  <button key={`e-${i}`} onClick={() => selectSnap(selectedPlayers.indexOf(player), snapIdx)} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-semibold border cursor-pointer transition-all", isNext ? "border-accent text-accent bg-accent/15 ring-2 ring-accent" : "border-border/40 text-muted/40 hover:border-accent/40")}>{snapIdx + 1}</button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Current snap */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-100">{currentPlayer}</p>
          <div className="text-right">
            <p className="text-xs text-muted">Snap {selectedSnapIdx != null ? selectedSnapIdx + 1 : playerEntries.length + 1} / {totalReps}{selectedSnapIdx != null ? " (viewing)" : ""}</p>
            {isFG && playerEntries.length > 0 && (
              <p className="text-xs font-bold text-sky-400">{playerEntries.reduce((s, e) => s + (e.score ?? 0), 0)}/{playerEntries.length * 3}</p>
            )}
          </div>
        </div>

        {/* Diagram + controls inline */}
        {isFG ? (
          <div className="flex items-center gap-1">
            <div className="flex flex-col gap-1 shrink-0">
              <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Laces</p>
              <button onClick={() => setLaces("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
              <button onClick={() => setLaces("1/4 Turn")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4</button>
              <button onClick={() => setLaces("Back")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
            </div>
            <div className="flex-1 min-w-0">
              <HolderStrikeZone markers={marker ? [{ ...marker, num: selectedSnapIdx != null ? selectedSnapIdx + 1 : playerEntries.length + 1 }] : []} onSnap={(m) => setMarker(m)} nextNum={selectedSnapIdx != null ? selectedSnapIdx + 1 : playerEntries.length + 1} chartMode="simple" missMode="simple" editable />
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Spiral</p>
              <button onClick={() => setSpiral("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
              <button onClick={() => setSpiral("Bad")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <PunterStrikeZone markers={puntMarker ? [{ ...puntMarker, num: selectedSnapIdx != null ? selectedSnapIdx + 1 : playerEntries.length + 1 }] : []} onSnap={(m) => setPuntMarker(m)} nextNum={selectedSnapIdx != null ? selectedSnapIdx + 1 : playerEntries.length + 1} chartMode="simple" missMode="simple" editable />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Spiral</p>
                <button onClick={() => setSpiral("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                <button onClick={() => setSpiral("Bad")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted mb-1">Snap Time <span className="text-muted/50">(optional)</span></p>
              <input type="text" inputMode="numeric" value={snapTime ? parseTimeRaw(snapTime).toFixed(2) : ""} onChange={(e) => setSnapTime(e.target.value.replace(/\D/g, ""))} placeholder="0.75" className="input w-24 text-center text-sm font-bold py-1.5" />
            </div>
          </>
        )}

        <button onClick={handleLog} disabled={!canLog} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Log Snap</button>
      </div>

      {/* Undo + Finish */}
      <div className="flex gap-2">
        {entries.length > 0 && <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
        {entries.length > 0 && <button onClick={() => setPhase("results")} className="btn-ghost flex-1 py-2 text-xs font-bold border border-sky-500/40 text-sky-400">Finish ({entries.length}/{totalReps * selectedPlayers.length})</button>}
      </div>

      {/* Running log */}
      {entries.length > 0 && (
        <div className="card-2 text-xs">
          <table className="w-full">
            <thead><tr>
              <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
              <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
              <th className="text-[10px] text-muted text-center py-1 px-2">Result</th>
              {isFG && <th className="text-[10px] text-muted text-center py-1 px-2">Laces</th>}
              <th className="text-[10px] text-muted text-center py-1 px-2">Spiral</th>
              <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
            </tr></thead>
            <tbody>
              {[...entries].reverse().map((e, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="text-muted py-1 px-2">{entries.length - i}</td>
                  <td className="py-1 px-2 text-slate-200">{e.athlete}</td>
                  <td className={clsx("text-center py-1 px-2 font-bold", e.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>{e.accuracy === "ON_TARGET" ? "Strike" : "Ball"}</td>
                  {isFG && <td className={clsx("text-center py-1 px-2", e.laces === "Good" ? "text-make" : e.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{e.laces === "Good" ? "Perfect" : e.laces === "1/4 Turn" ? "1/4" : e.laces || "—"}</td>}
                  <td className={clsx("text-center py-1 px-2", e.spiral === "Good" ? "text-make" : "text-miss")}>{e.spiral === "Good" ? "Tight" : e.spiral === "Bad" ? "Open" : "—"}</td>
                  <td className="text-right py-1 px-2 font-bold text-sky-400">{e.score}/{isFG ? 3 : 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
