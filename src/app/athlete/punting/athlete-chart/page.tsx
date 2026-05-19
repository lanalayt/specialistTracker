"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { usePunt } from "@/lib/puntContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { AthleteSnapPopup, type SnapLogEntry } from "@/components/ui/AthleteSnapPopup";
import { loadAthletes } from "@/lib/athleteStore";
import { insertSession, stampSessionWrite } from "@/lib/sessionStore";
import { genId } from "@/lib/stats";
import Link from "next/link";
import clsx from "clsx";
import type { PuntEntry, LongSnapEntry } from "@/types";

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

  const [chartNowData] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("coach_punt_chart_now");
      if (raw) {
        localStorage.removeItem("coach_punt_chart_now");
        const data = JSON.parse(raw);
        if (data.players?.length > 0) return data;
      }
    } catch {}
    return null;
  });

  const [phase, setPhase] = useState<"setup" | "preview" | "live" | "results">(assignedId ? "preview" : chartNowData ? "live" : "setup");
  const [chartType, setChartType] = useState<"preset" | "live">("preset");
  const [reps, setReps] = useState(chartNowData ? String(chartNowData.reps ?? 5) : "5");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(chartNowData?.players ?? []);
  const [saved, setSaved] = useState(false);
  const [assignedChart, setAssignedChart] = useState<AssignedChart | null>(null);
  const [livePuntType, setLivePuntType] = useState("DIR_STRAIGHT");

  const [results, setResults] = useState<PuntEntry[]>([]);
  // slotResults: player → slotIdx → PuntEntry (for random-access slot filling)
  const [slotResults, setSlotResults] = useState<Record<string, Record<number, PuntEntry>>>({});
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";

  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [opInput, setOpInput] = useState("");
  const [dirGood, setDirGood] = useState(true);
  const [liveType, setLiveType] = useState("DIR_STRAIGHT");
  const [liveHash, setLiveHash] = useState("M");
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0);
  const [showSnap, setShowSnap] = useState(false);
  const [snapLogsMap, setSnapLogsMap] = useState<Record<string, SnapLogEntry[]>>({});
  const [snapAthletes, setSnapAthletes] = useState<string[]>([]);

  useEffect(() => {
    async function loadSnappers() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const ls = await loadAthletes(tid, "ATHLETE_LONGSNAP");
      const teamLs = ls.length > 0 ? ls : await loadAthletes(tid, "LONGSNAP");
      setSnapAthletes(teamLs.map((a) => a.name));
    }
    loadSnappers();
  }, []);

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const athleteNames = athletes.map((a) => a.name);
  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const totalReps = parseInt(reps) || 0;

  useUnsavedWarning(results.length > 0 && !saved);

  // Set assigned chart from Chart Now data
  useEffect(() => {
    if (chartNowData?.puntRows) {
      setAssignedChart({ id: "chart-now", sport: "ATHLETE_PUNTING", createdBy: "Coach", createdAt: new Date().toISOString(), dueDate: "", athletes: chartNowData.players, kicks: [], reps: chartNowData.reps, puntTypes: chartNowData.puntRows.map((r: any) => ({ type: r.type ?? r.category, typeId: r.typeId, typeLabel: r.typeLabel ?? r.category, count: r.count, hash: r.hash, yardLine: r.yardLine })), completedBy: {} } as AssignedChart);
    }
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
    // Remove the currently selected slot
    const filled = getSlotResult(currentPlayer, selectedSlotIdx);
    if (!filled) return;
    setSlotResults((prev) => {
      const playerSlots = { ...(prev[currentPlayer] ?? {}) };
      delete playerSlots[selectedSlotIdx];
      return { ...prev, [currentPlayer]: playerSlots };
    });
    setResults((prev) => prev.filter((r) => !(r.athlete === currentPlayer && r.kickNum === selectedSlotIdx + 1)));
    if (phase === "results") setPhase("live");
  };

  // ── Computed values (must be before phase checks) ──
  const puntSchedule: { type: string; typeLabel: string; subType: string; hash: string; yardLine?: string }[] = [];
  if (assignedChart?.puntTypes) {
    for (const pt of assignedChart.puntTypes as any[]) {
      for (let i = 0; i < (pt.count ?? 0); i++) {
        puntSchedule.push({ type: pt.typeId ?? pt.type, typeLabel: pt.type ?? pt.typeLabel, subType: pt.typeLabel ?? "", hash: pt.hash ?? "M", yardLine: pt.yardLine });
      }
    }
  }

  const getTypeInitials = (label: string): string => {
    const parts = label.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return parts.map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 3);
  };

  const getSlotResult = (player: string, slotIdx: number) => slotResults[player]?.[slotIdx];
  const isSlotFilled = (player: string, slotIdx: number) => !!getSlotResult(player, slotIdx);
  const filledCount = selectedPlayers.reduce((s, p) => s + puntSchedule.filter((_, i) => isSlotFilled(p, i)).length, 0);
  const totalSlots = puntSchedule.length * selectedPlayers.length;

  const allResults: PuntEntry[] = [];
  for (const player of selectedPlayers) {
    for (let i = 0; i < puntSchedule.length; i++) {
      const r = getSlotResult(player, i);
      if (r) allResults.push({ ...r, kickNum: i + 1 });
    }
  }

  const allSnapEntries: LongSnapEntry[] = Object.values(snapLogsMap).flat().map((s) => s.dbEntry);

  const handleSave = async () => {
    const label = `Punt Chart — ${selectedPlayers.map((p) => `${p}: ${allResults.filter((r) => r.athlete === p).length} punts`).join(", ")}${assignedChart ? " (Assigned)" : ""}`;
    commitPractice(allResults, label);

    // Batch save snap entries
    if (allSnapEntries.length > 0) {
      const tid = getTeamId();
      if (tid) {
        const snapperNames = [...new Set(allSnapEntries.map((e) => e.athlete))].join(", ");
        const snapSession = {
          id: genId(), teamId: tid, sport: "ATHLETE_LONGSNAP",
          label: `Long Snap — ${new Date().toLocaleDateString()} — ${snapperNames}`,
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
            const pr = allResults.filter((r) => r.athlete === p);
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
        {/* Long Snap Summary */}
        {allSnapEntries.length > 0 && (() => {
          const snapperNames = [...new Set(allSnapEntries.map((e) => e.athlete))];
          const snapsBySnapper: Record<string, LongSnapEntry[]> = {};
          allSnapEntries.forEach((e) => {
            if (!snapsBySnapper[e.athlete]) snapsBySnapper[e.athlete] = [];
            snapsBySnapper[e.athlete].push(e);
          });
          return (
            <div className="card-2 text-left space-y-3">
              <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Long Snap Summary</p>
              {snapperNames.map((name) => {
                const snaps = snapsBySnapper[name];
                return (
                  <div key={name}>
                    <p className="text-xs font-bold text-slate-200 mb-1">{name}</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                          <th className="text-[10px] text-muted text-center py-1 px-2">Result</th>
                          <th className="text-[10px] text-muted text-center py-1 px-2">Spiral</th>
                          {snaps.some((s) => s.time > 0) && <th className="text-[10px] text-muted text-center py-1 px-2">Time</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {snaps.map((s, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="text-muted py-1 px-2">{i + 1}</td>
                            <td className={clsx("text-center py-1 px-2 font-bold", s.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>{s.accuracy === "ON_TARGET" ? "Strike" : "Ball"}</td>
                            <td className={clsx("text-center py-1 px-2 font-semibold", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : s.spiral === "Bad" ? "Open" : "—"}</td>
                            {snaps.some((ss) => ss.time > 0) && <td className="text-center py-1 px-2 text-slate-300">{s.time > 0 ? `${s.time.toFixed(2)}s` : "—"}</td>}
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
          <Link href="/athlete/punting" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
        </div>
      </main>
    );
  }

  // ── Live — One punt at a time ──
  const currentScheduleItem = puntSchedule[selectedSlotIdx];
  const currentType = currentScheduleItem?.typeLabel || currentScheduleItem?.type || "";
  const currentHash = currentScheduleItem?.hash || "M";

  const HASH_OPTIONS = ["Left", "LM", "M", "RM", "Right"];

  const displayType = assignedChart ? currentType : liveType;
  const displayHash = assignedChart ? currentHash : liveHash;

  const selectSlot = (playerIdx: number, slotIdx: number) => {
    setCurrentPlayerIdx(playerIdx);
    setSelectedSlotIdx(slotIdx);
    const player = selectedPlayers[playerIdx];
    const filled = slotResults[player]?.[slotIdx];
    if (filled) {
      setDistInput(String(filled.yards));
      setHangInput(String(Math.round(filled.hangTime * 100)));
      setOpInput(filled.opTime ? String(Math.round(filled.opTime * 100)) : "");
      setDirGood(filled.directionalAccuracy === 1 || filled.directionalAccuracy === "1");
    } else {
      setDistInput(""); setHangInput(""); setOpInput(""); setDirGood(true);
    }
  };

  // Find next empty slot for current player
  const findNextEmptySlot = (player: string, afterIdx: number): number => {
    for (let i = afterIdx + 1; i < puntSchedule.length; i++) {
      if (!isSlotFilled(player, i)) return i;
    }
    for (let i = 0; i <= afterIdx; i++) {
      if (!isSlotFilled(player, i)) return i;
    }
    return afterIdx;
  };

  const handleLogPunt = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    const op = parseHangRaw(opInput);
    if (isNaN(dist) || dist <= 0 || !hang) return;
    const puntType = assignedChart ? (currentScheduleItem?.type ?? "DIR_STRAIGHT") : liveType;
    const hash = assignedChart ? (currentHash === "ANY" ? (liveHash || "") : currentHash) : liveHash;
    const playerSlotsFilled = puntSchedule.filter((_, i) => isSlotFilled(currentPlayer, i)).length;
    const entry: PuntEntry = {
      athleteId: currentPlayer, athlete: currentPlayer, type: puntType as any, hash: hash as any,
      yards: dist, hangTime: hang, opTime: op || 0,
      directionalAccuracy: dirGood ? 1 : 0, landingZones: [] as any, kickNum: playerSlotsFilled + 1,
    };
    // Store in slotResults
    setSlotResults((prev) => ({
      ...prev,
      [currentPlayer]: { ...(prev[currentPlayer] ?? {}), [selectedSlotIdx]: entry },
    }));
    // Also add to flat results for save
    setResults((prev) => [...prev.filter((r) => !(r.athlete === currentPlayer && r.kickNum === selectedSlotIdx + 1)), { ...entry, kickNum: selectedSlotIdx + 1 }]);
    setDistInput(""); setHangInput(""); setOpInput(""); setDirGood(true);

    // Auto-advance using updated state (include the slot we just filled)
    const updatedSlots = { ...(slotResults[currentPlayer] ?? {}), [selectedSlotIdx]: entry };
    const findNextEmpty = (player: string, afterIdx: number, slots: Record<number, PuntEntry>): number => {
      for (let i = afterIdx + 1; i < puntSchedule.length; i++) {
        if (!slots[i]) return i;
      }
      for (let i = 0; i <= afterIdx; i++) {
        if (!slots[i]) return i;
      }
      return afterIdx;
    };
    const nextSlot = findNextEmpty(currentPlayer, selectedSlotIdx, updatedSlots);
    if (nextSlot !== selectedSlotIdx) {
      setSelectedSlotIdx(nextSlot);
    } else if (selectedPlayers.length > 1) {
      const nextPlayerIdx = (currentPlayerIdx + 1) % selectedPlayers.length;
      setCurrentPlayerIdx(nextPlayerIdx);
      const nextPlayer = selectedPlayers[nextPlayerIdx];
      const nextPlayerSlots = slotResults[nextPlayer] ?? {};
      const firstEmpty = findNextEmpty(nextPlayer, -1, nextPlayerSlots);
      setSelectedSlotIdx(firstEmpty);
    }
    // Check if all done
    if (chartType === "preset" && puntSchedule.length > 0) {
      if (filledCount + 1 >= totalSlots) setPhase("results");
    }
  };

  return (
    <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <Link href="/athlete/punting/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>

      {/* Per-athlete punt circles */}
      {selectedPlayers.map((player) => {
        const isActive = player === currentPlayer;
        return (
          <div key={player} className={clsx("space-y-1", !isActive && selectedPlayers.length > 1 && "opacity-50")}>
            <button onClick={() => { const pidx = selectedPlayers.indexOf(player); const first = findNextEmptySlot(player, -1); selectSlot(pidx, first); }} className="text-xs font-bold text-slate-200 hover:text-accent transition-colors">{player}</button>
            <div className="flex flex-wrap gap-1.5">
              {puntSchedule.map((sched, i) => {
                const filled = getSlotResult(player, i);
                const label = getTypeInitials(sched.typeLabel || sched.type);
                const isSelected = isActive && selectedSlotIdx === i;
                if (filled) {
                  const dirOk = filled.directionalAccuracy === 1 || filled.directionalAccuracy === "1";
                  return (
                    <button key={i} onClick={() => selectSlot(selectedPlayers.indexOf(player), i)} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold border cursor-pointer transition-all", dirOk ? "bg-make/20 border-make/40 text-make" : "bg-miss/20 border-miss/40 text-miss", isSelected && "ring-2 ring-accent")} title={`${sched.subType || sched.typeLabel}${sched.yardLine ? " | YL " + sched.yardLine : ""} | ${filled.yards}yd | ${filled.hangTime.toFixed(2)}s | ${filled.opTime ? filled.opTime.toFixed(2) + "s OT | " : ""}${dirOk ? "Good" : "Bad"} Dir`}>{label}</button>
                  );
                }
                return (
                  <button key={i} onClick={() => selectSlot(selectedPlayers.indexOf(player), i)} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-semibold border cursor-pointer transition-all", isSelected ? "border-accent/60 text-accent bg-accent/10 ring-2 ring-accent" : "border-border/40 text-muted/40 hover:border-accent/40 hover:text-accent/60")}>{label}</button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Current punt info */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-100">{currentPlayer}</p>
          <p className="text-xs text-muted">Punt {selectedSlotIdx + 1}{puntSchedule.length > 0 ? ` / ${puntSchedule.length}` : ""}{isSlotFilled(currentPlayer, selectedSlotIdx) ? " (filled)" : ""}</p>
        </div>

        {/* Type + Hash display (assigned) or selection (live) */}
        {assignedChart ? (
          <div className="flex gap-3 text-xs flex-wrap items-center">
            <span className="text-muted">Type: <span className="text-slate-200 font-semibold">{displayType}</span></span>
            {currentScheduleItem?.subType && currentScheduleItem.subType !== displayType && <span className="text-muted">Sub: <span className="text-accent font-semibold">{currentScheduleItem.subType}</span></span>}
            {displayHash === "ANY" ? (
              <span className="text-muted">Hash: <select value={liveHash} onChange={(e) => setLiveHash(e.target.value)} className="input text-xs py-0.5 px-1 inline w-auto ml-1">
                <option value="">—</option>
                {["Left", "LM", "M", "RM", "Right"].map((h) => <option key={h} value={h}>{h}</option>)}
              </select></span>
            ) : (
              <span className="text-muted">Hash: <span className="text-slate-200 font-semibold">{displayHash}</span></span>
            )}
            {currentScheduleItem?.yardLine && <span className="text-muted">YL: <span className="text-sky-400 font-semibold">{currentScheduleItem.yardLine}</span></span>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1">Type</p>
              <input type="text" value={liveType} onChange={(e) => setLiveType(e.target.value)} className="input w-full text-sm py-1.5" placeholder="Type" />
            </div>
            <div>
              <p className="text-[10px] text-muted mb-1">Hash</p>
              <select value={liveHash} onChange={(e) => setLiveHash(e.target.value)} className="input w-full text-sm py-1.5">
                {HASH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Inputs */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-muted text-center mb-1">Distance</p>
            <input type="text" inputMode="numeric" value={distInput} onChange={(e) => setDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" placeholder="yd" />
          </div>
          <div>
            <p className="text-[10px] text-muted text-center mb-1">Hang Time</p>
            <input type="text" inputMode="numeric" value={hangInput ? parseHangRaw(hangInput).toFixed(2) : ""} onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" placeholder="sec" />
          </div>
          <div>
            <p className="text-[10px] text-muted text-center mb-1">Op Time</p>
            <input type="text" inputMode="numeric" value={opInput ? parseHangRaw(opInput).toFixed(2) : ""} onChange={(e) => setOpInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" placeholder="sec" />
          </div>
        </div>

        {/* Direction */}
        <div>
          <p className="text-[10px] text-muted text-center mb-1">Direction</p>
          <div className="flex gap-2">
          <button onClick={() => setDirGood(true)} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border-2 transition-all", dirGood ? "bg-make/20 text-make border-make/40" : "bg-surface-2 text-muted border-border")}>Good</button>
          <button onClick={() => setDirGood(false)} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border-2 transition-all", !dirGood ? "bg-miss/20 text-miss border-miss/40" : "bg-surface-2 text-muted border-border")}>Bad</button>
          </div>
        </div>

        {/* Log Snap + Log Punt */}
        <div className="flex gap-2">
          <button onClick={() => setShowSnap(true)} className={clsx("px-3 py-3 rounded-input border text-xs font-semibold transition-colors", (snapLogsMap[`${currentPlayer}-${selectedSlotIdx}`]?.length ?? 0) > 0 ? "bg-make/20 border-make/50 text-make hover:bg-make/30" : "border-sky-500/30 text-sky-400 hover:bg-sky-500/10")}>{(snapLogsMap[`${currentPlayer}-${selectedSlotIdx}`]?.length ?? 0) > 0 ? "Snap Logged ✓" : "Log Snap"}</button>
          <button onClick={handleLogPunt} disabled={!distInput || !hangInput} className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40">Log Punt</button>
        </div>
      </div>

      {/* Undo + Finish */}
      <div className="flex gap-2">
        {isSlotFilled(currentPlayer, selectedSlotIdx) && <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
        {filledCount > 0 && <button onClick={() => setPhase("results")} className="btn-ghost flex-1 py-2 text-xs font-bold border border-sky-500/40 text-sky-400">Finish ({filledCount}/{totalSlots})</button>}
      </div>

      {/* Running log */}
      {allResults.length > 0 && (
        <div className="card-2 text-xs">
          <table className="w-full">
            <thead><tr>
              <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
              <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
              <th className="text-[10px] text-muted text-left py-1 px-2">Type</th>
              <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
              <th className="text-[10px] text-muted text-center py-1 px-2">HT</th>
              <th className="text-[10px] text-muted text-right py-1 px-2">Dir</th>
            </tr></thead>
            <tbody>
              {[...allResults].reverse().map((r, i) => {
                const num = allResults.length - i;
                return (
                  <tr key={i} className="border-t border-border/30">
                    <td className="text-muted py-1 px-2">{num}</td>
                    <td className="py-1 px-2 text-slate-200 truncate max-w-[60px]">{r.athlete}</td>
                    <td className="py-1 px-2 text-slate-300">{r.type}</td>
                    <td className="text-center py-1 px-2 text-slate-200">{r.yards}yd</td>
                    <td className="text-center py-1 px-2 text-slate-200">{r.hangTime.toFixed(2)}s</td>
                    <td className={clsx("text-right py-1 px-2 font-bold", (r.directionalAccuracy === 1 || r.directionalAccuracy === "1") ? "text-make" : "text-miss")}>{(r.directionalAccuracy === 1 || r.directionalAccuracy === "1") ? "G" : "B"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showSnap && (
        <AthleteSnapPopup
          snapType="PUNT"
          athletes={snapAthletes}
          kickerName={currentPlayer}
          previousSnaps={snapLogsMap[`${currentPlayer}-${selectedSlotIdx}`]}
          onClose={() => setShowSnap(false)}
          onSaved={(entry) => setSnapLogsMap((prev) => ({ ...prev, [`${currentPlayer}-${selectedSlotIdx}`]: [...(prev[`${currentPlayer}-${selectedSlotIdx}`] ?? []), entry] }))}
        />
      )}
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
