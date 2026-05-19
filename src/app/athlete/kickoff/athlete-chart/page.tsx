"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useKickoff } from "@/lib/kickoffContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import Link from "next/link";
import clsx from "clsx";
import type { KickoffEntry } from "@/types";

const HASH_OPTIONS = ["LH", "LM", "M", "RM", "RH"];
const HASH_LABELS: Record<string, string> = { LH: "Left Hash", LM: "Left Middle", M: "Middle", RM: "Right Middle", RH: "Right Hash" };

function getTypeInitials(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 3);
}

function KOAthleteChartInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignedId = searchParams.get("assigned");
  const { user } = useAuth();
  const { athletes, commitPractice } = useKickoff();

  const [chartNowData] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("coach_ko_chart_now");
      if (raw) {
        localStorage.removeItem("coach_ko_chart_now");
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

  const [results, setResults] = useState<KickoffEntry[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";

  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [dirGood, setDirGood] = useState(true);
  const [liveType, setLiveType] = useState("Deep");
  const [liveHash, setLiveHash] = useState("M");

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const athleteNames = athletes.map((a) => a.name);
  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const totalReps = parseInt(reps) || 0;

  // Set assigned chart from Chart Now data
  useEffect(() => {
    if (chartNowData?.koRows) {
      const totalR = chartNowData.koRows.reduce((s: number, r: any) => s + (r.count ?? 0), 0);
      setAssignedChart({
        id: "chart-now", sport: "ATHLETE_KICKOFF", createdBy: "Coach",
        createdAt: new Date().toISOString(), dueDate: "", athletes: chartNowData.players,
        kicks: [], reps: totalR, koRows: chartNowData.koRows, completedBy: {},
      } as AssignedChart);
      setReps(String(totalR));
    }
  }, []);

  useUnsavedWarning(results.length > 0 && !saved);

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
        const totalR = chart.koRows ? chart.koRows.reduce((s, r) => s + r.count, 0) : (chart.reps ?? 5);
        setReps(String(totalR));
      }
    }
    load();
  }, [assignedId]);

  const togglePlayer = (name: string) => setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  // Build kick schedule from koRows
  const kickSchedule: { typeId: string; typeLabel: string; hash: string }[] = [];
  if (assignedChart?.koRows) {
    for (const row of assignedChart.koRows) {
      for (let i = 0; i < row.count; i++) {
        kickSchedule.push({ typeId: row.typeId, typeLabel: row.typeLabel, hash: row.hash });
      }
    }
  }

  const playerKicks = getPlayerResults(currentPlayer);
  const currentKickIdx = playerKicks.length;
  const currentScheduleItem = kickSchedule[currentKickIdx];
  const displayType = assignedChart ? (currentScheduleItem?.typeLabel || "") : liveType;
  const displayHash = assignedChart ? (currentScheduleItem?.hash || "M") : liveHash;

  const handleLog = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    if (isNaN(dist) || dist <= 0) return;
    const kickNum = playerKicks.length + 1;
    const typeId = assignedChart ? (currentScheduleItem?.typeId ?? "REG") : liveType;
    const hash = assignedChart ? (currentScheduleItem?.hash ?? "M") : liveHash;
    const entry: KickoffEntry = {
      athleteId: currentPlayer, athlete: currentPlayer, type: typeId as any, hash: hash as any,
      distance: dist, hangTime: hang || 0, direction: dirGood ? "Good" : "Bad",
      score: 0, landingZone: "FIELD" as any, kickNum,
    };
    setResults((prev) => [...prev, entry]);
    setDistInput(""); setHangInput(""); setDirGood(true);
    if (selectedPlayers.length > 1) {
      setCurrentPlayerIdx((currentPlayerIdx + 1) % selectedPlayers.length);
    }
    if (chartType === "preset" && kickSchedule.length > 0) {
      const totalNeeded = kickSchedule.length * selectedPlayers.length;
      if (results.length + 1 >= totalNeeded) setPhase("results");
    }
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    const last = results[results.length - 1];
    setResults((prev) => prev.slice(0, -1));
    setCurrentPlayerIdx(selectedPlayers.indexOf(last.athlete));
    if (phase === "results") setPhase("live");
  };

  const handleSave = async () => {
    const label = `KO Chart — ${selectedPlayers.map((p) => `${p}: ${getPlayerResults(p).length} kicks`).join(", ")}${assignedChart ? " (Assigned)" : ""}`;
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
        <Link href="/athlete/kickoff/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Athlete Chart</h2>
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
          <div>
            <p className="text-xs text-muted mb-1">Kicks per player</p>
            <input type="text" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} className="input w-20 text-center text-sm font-bold py-1.5" />
          </div>
        )}
        <button onClick={() => { setPhase("live"); setCurrentPlayerIdx(0); setResults([]); }} disabled={selectedPlayers.length === 0 || (chartType === "preset" && !totalReps)} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">{chartType === "preset" ? "Start Preset Chart" : "Start Live Chart"}</button>
      </main>
    );
  }

  // ── Preview (assigned) ──
  if (phase === "preview") {
    return (
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <Link href="/athlete/kickoff/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <h2 className="text-lg font-bold text-slate-100">Assigned KO Chart</h2>
        {assignedChart && <p className="text-xs text-muted">From {assignedChart.createdBy} — Due {new Date(assignedChart.dueDate).toLocaleDateString()}</p>}
        {assignedChart?.koRows && (
          <div className="card-2 space-y-1">
            {assignedChart.koRows.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-slate-300">
                <span className="text-muted w-4">{i + 1}.</span>
                <span className="font-semibold text-slate-200">{r.typeLabel}</span>
                <span>x{r.count}</span>
                <span className="text-muted">{HASH_LABELS[r.hash] ?? r.hash}</span>
              </div>
            ))}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Kicker(s)</p>
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
            const avgDist = pr.length > 0 ? (pr.reduce((s, r) => s + r.distance, 0) / pr.length).toFixed(1) : "—";
            const avgHang = pr.filter((r) => r.hangTime > 0).length > 0 ? (pr.filter((r) => r.hangTime > 0).reduce((s, r) => s + r.hangTime, 0) / pr.filter((r) => r.hangTime > 0).length).toFixed(2) : "—";
            return (
              <div key={p} className="card-2 px-4 py-3 text-center">
                <p className="text-sm font-bold text-slate-200">{p}</p>
                <p className="text-xl font-black text-sky-400">{pr.length} kicks</p>
                <p className="text-[10px] text-muted">Avg: {avgDist}yd / {avgHang}s</p>
              </div>
            );
          })}
        </div>
        {/* Per-athlete breakdown */}
        {selectedPlayers.map((p) => {
          const pr = getPlayerResults(p);
          return (
            <div key={p} className="card-2 text-left text-xs">
              <p className="text-xs font-bold text-slate-200 mb-2">{p}</p>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
                    <th className="text-[10px] text-muted text-left py-1 px-2">Type</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Loc</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
                    <th className="text-[10px] text-muted text-center py-1 px-2">Hang</th>
                    <th className="text-[10px] text-muted text-right py-1 px-2">Dir</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.map((r, i) => (
                    <tr key={i} className="border-t border-border/30">
                      <td className="text-muted py-1 px-2">{i + 1}</td>
                      <td className="py-1 px-2 text-slate-300">{kickSchedule[i]?.typeLabel || r.type}</td>
                      <td className="text-center py-1 px-2 text-slate-400">{r.hash}</td>
                      <td className="text-center py-1 px-2 text-slate-200">{r.distance}yd</td>
                      <td className="text-center py-1 px-2 text-slate-200">{r.hangTime > 0 ? `${r.hangTime.toFixed(2)}s` : "—"}</td>
                      <td className={clsx("text-right py-1 px-2 font-bold", r.direction === "Good" ? "text-make" : "text-miss")}>{r.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <div className="flex gap-3 max-w-sm mx-auto">
          {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to History</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
          <Link href="/athlete/kickoff" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
        </div>
      </main>
    );
  }

  // ── Live — One kick at a time ──
  return (
    <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <Link href="/athlete/kickoff/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>

      {/* Per-athlete kick circles */}
      {selectedPlayers.map((player) => {
        const pr = getPlayerResults(player);
        const isActive = player === currentPlayer;
        return (
          <div key={player} className={clsx("space-y-1", !isActive && selectedPlayers.length > 1 && "opacity-50")}>
            <button onClick={() => setCurrentPlayerIdx(selectedPlayers.indexOf(player))} className="text-xs font-bold text-slate-200 hover:text-accent transition-colors">{player}</button>
            <div className="flex flex-wrap gap-1.5">
              {pr.map((r, i) => {
                const label = getTypeInitials(kickSchedule[i]?.typeLabel || r.type);
                return (
                  <div key={i} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold border", r.direction === "Good" ? "bg-make/20 border-make/40 text-make" : "bg-miss/20 border-miss/40 text-miss")} title={`${r.distance}yd ${r.hangTime.toFixed(2)}s ${r.hash}`}>{label}</div>
                );
              })}
              {kickSchedule.length > 0 && Array.from({ length: Math.max(0, kickSchedule.length - pr.length) }).map((_, i) => {
                const schedIdx = pr.length + i;
                const label = getTypeInitials(kickSchedule[schedIdx]?.typeLabel || "");
                return (
                  <div key={`empty-${i}`} className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-semibold border", schedIdx === currentKickIdx && isActive ? "border-accent/60 text-accent bg-accent/10" : "border-border/40 text-muted/40")}>{label}</div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Current kick info */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-100">{currentPlayer}</p>
          <p className="text-xs text-muted">Kick {playerKicks.length + 1}{kickSchedule.length > 0 ? ` / ${kickSchedule.length}` : ""}</p>
        </div>

        {/* Type + Location */}
        {assignedChart ? (
          <div className="flex gap-3 text-xs">
            <span className="text-muted">Type: <span className="text-slate-200 font-semibold">{displayType}</span></span>
            <span className="text-muted">Location: <span className="text-slate-200 font-semibold">{HASH_LABELS[displayHash] ?? displayHash}</span></span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted mb-1">Type</p>
              <input type="text" value={liveType} onChange={(e) => setLiveType(e.target.value)} className="input w-full text-sm py-1.5" placeholder="Type" />
            </div>
            <div>
              <p className="text-[10px] text-muted mb-1">Location</p>
              <select value={liveHash} onChange={(e) => setLiveHash(e.target.value)} className="input w-full text-sm py-1.5">
                {HASH_OPTIONS.map((h) => <option key={h} value={h}>{HASH_LABELS[h]}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted text-center mb-1">Distance</p>
            <input type="text" inputMode="numeric" value={distInput} onChange={(e) => setDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" placeholder="yd" />
          </div>
          <div>
            <p className="text-[10px] text-muted text-center mb-1">Hang Time</p>
            <input type="text" inputMode="numeric" value={hangInput ? parseHangRaw(hangInput).toFixed(2) : ""} onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" placeholder="sec" />
          </div>
        </div>

        {/* Direction */}
        <div className="flex gap-2">
          <button onClick={() => setDirGood(true)} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border-2 transition-all", dirGood ? "bg-make/20 text-make border-make/40" : "bg-surface-2 text-muted border-border")}>Good</button>
          <button onClick={() => setDirGood(false)} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border-2 transition-all", !dirGood ? "bg-miss/20 text-miss border-miss/40" : "bg-surface-2 text-muted border-border")}>Bad</button>
        </div>

        {/* Log kick */}
        <button onClick={handleLog} disabled={!distInput} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Log Kick</button>
      </div>

      {/* Undo + Finish */}
      <div className="flex gap-2">
        {results.length > 0 && <button onClick={handleUndo} className="text-xs px-4 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
        {results.length > 0 && <button onClick={() => setPhase("results")} className="btn-ghost flex-1 py-2 text-xs font-bold border border-sky-500/40 text-sky-400">Finish</button>}
      </div>

      {/* Running log */}
      {results.length > 0 && (
        <div className="card-2 text-xs">
          <table className="w-full">
            <thead><tr>
              <th className="text-[10px] text-muted text-left py-1 px-2">#</th>
              <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
              <th className="text-[10px] text-muted text-left py-1 px-2">Type</th>
              <th className="text-[10px] text-muted text-center py-1 px-2">Loc</th>
              <th className="text-[10px] text-muted text-center py-1 px-2">Dist</th>
              <th className="text-[10px] text-muted text-right py-1 px-2">Dir</th>
            </tr></thead>
            <tbody>
              {[...results].reverse().map((r, i) => {
                const idx = results.length - 1 - i;
                const athleteKickNum = results.slice(0, idx + 1).filter((k) => k.athlete === r.athlete).length;
                return (
                  <tr key={i} className="border-t border-border/30">
                    <td className="text-muted py-1 px-2">{athleteKickNum}</td>
                    <td className="py-1 px-2 text-slate-200 truncate max-w-[60px]">{r.athlete}</td>
                    <td className="py-1 px-2 text-slate-300">{kickSchedule[athleteKickNum - 1]?.typeLabel || r.type}</td>
                    <td className="text-center py-1 px-2 text-slate-400">{r.hash}</td>
                    <td className="text-center py-1 px-2 text-slate-200">{r.distance}yd</td>
                    <td className={clsx("text-right py-1 px-2 font-bold", r.direction === "Good" ? "text-make" : "text-miss")}>{r.direction === "Good" ? "G" : "B"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function KOAthleteChartPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}>
      <KOAthleteChartInner />
    </Suspense>
  );
}
