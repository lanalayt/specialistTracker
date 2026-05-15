"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useFG } from "@/lib/fgContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import clsx from "clsx";

const HASH_OPTIONS = ["Left", "LM", "M", "RM", "Right"];

interface PresetKick {
  distance: number;
  hash: string;
  pointValue: number;
}

export default function CoachesChartPage() {
  const { user, isCoach } = useAuth();
  const { athletes } = useFG();
  const athleteNames = athletes.map((a) => a.name);

  const [kicks, setKicks] = useState<PresetKick[]>([]);
  const [newDist, setNewDist] = useState("30");
  const [newHash, setNewHash] = useState("M");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [saved, setSaved] = useState(false);

  // Recent charts
  const [charts, setCharts] = useState<AssignedChart[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignPlayers, setReassignPlayers] = useState<string[]>([]);
  const [reassignDate, setReassignDate] = useState("");

  useEffect(() => {
    loadCharts();
  }, [user?.id]);

  const loadCharts = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
    if (!tid) return;
    const all = await loadAssignedCharts(tid);
    setCharts(all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  if (!isCoach) {
    return (
      <main className="p-4 lg:p-6">
        <p className="text-sm text-muted">Only coaches can create charts.</p>
      </main>
    );
  }

  const addKick = () => {
    const d = parseInt(newDist) || 30;
    setKicks((prev) => [...prev, { distance: d, hash: newHash, pointValue: 1 }]);
  };

  const removeKick = (idx: number) => {
    setKicks((prev) => prev.filter((_, i) => i !== idx));
  };

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const selectAll = () => setSelectedPlayers(athleteNames);

  const handleAssign = async () => {
    if (kicks.length === 0 || selectedPlayers.length === 0 || !dueDate) return;
    const tid = getTeamId();
    if (!tid) return;
    const chart: AssignedChart = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "ATHLETE_KICKING",
      createdBy: user?.name ?? "Coach",
      createdAt: new Date().toISOString(),
      dueDate,
      athletes: selectedPlayers,
      kicks,
      completedBy: {},
    };
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, [...existing, chart]);
    setSaved(true);
    loadCharts();
  };

  const handleReassign = async (chartId: string) => {
    if (reassignPlayers.length === 0 || !reassignDate) return;
    const tid = getTeamId();
    if (!tid) return;
    const original = charts.find((c) => c.id === chartId);
    if (!original) return;
    const newChart: AssignedChart = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "ATHLETE_KICKING",
      createdBy: user?.name ?? "Coach",
      createdAt: new Date().toISOString(),
      dueDate: reassignDate,
      athletes: reassignPlayers,
      kicks: original.kicks,
      completedBy: {},
    };
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, [...existing, newChart]);
    setReassignId(null);
    setReassignPlayers([]);
    setReassignDate("");
    loadCharts();
  };

  const toggleReassignPlayer = (name: string) => {
    setReassignPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  return (
    <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <Link href="/athlete/kicking/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
      <h2 className="text-lg font-bold text-slate-100">Create FG Chart</h2>
      <p className="text-xs text-muted">Build a chart, assign it to athletes with a due date.</p>

      {saved ? (
        <div className="space-y-4 text-center py-8">
          <p className="text-2xl font-black text-sky-400">Chart Assigned!</p>
          <p className="text-sm text-muted">Sent to {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""} — due {new Date(dueDate).toLocaleDateString()}</p>
          <div className="flex gap-3 max-w-sm mx-auto">
            <button onClick={() => { setKicks([]); setSelectedPlayers([]); setDueDate(""); setSaved(false); }} className="btn-primary flex-1 py-3 text-sm">Create Another</button>
            <Link href="/athlete/kicking/session" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
          </div>
        </div>
      ) : (
        <>
          {kicks.length > 0 && (
            <div className="card-2 space-y-1">
              {kicks.map((k, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted w-6">{i + 1}.</span>
                  <span className="text-slate-200 font-semibold">{k.distance}yd</span>
                  <span className="text-slate-300">{k.hash}</span>
                  <button onClick={() => removeKick(i)} className="text-miss text-[10px] hover:underline">Remove</button>
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Assign To</p>
              <button onClick={selectAll} className="text-[10px] text-sky-400 hover:underline">Select All</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {athleteNames.map((a) => (
                <button key={a} onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
              ))}
            </div>
            {athleteNames.length === 0 && <p className="text-xs text-muted mt-1">No athletes found. Add athletes in Team Mode first.</p>}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Due Date</p>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
          </div>

          <button
            onClick={handleAssign}
            disabled={kicks.length === 0 || selectedPlayers.length === 0 || !dueDate}
            className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40"
          >
            Assign Chart ({kicks.length} kick{kicks.length !== 1 ? "s" : ""} → {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""})
          </button>
        </>
      )}

      {/* Active & Recent Charts */}
      {charts.length > 0 && (() => {
        const activeCharts = charts.filter((c) => c.athletes.some((a) => !c.completedBy[a]));
        const completedCharts = charts.filter((c) => c.athletes.every((a) => !!c.completedBy[a]));
        const renderChart = (chart: AssignedChart) => {
          const isExpanded = expandedId === chart.id;
          const isReassigning = reassignId === chart.id;
          const pending = chart.athletes.filter((a) => !chart.completedBy[a]);
          const completed = chart.athletes.filter((a) => !!chart.completedBy[a]);
          return (
            <div key={chart.id} className="card-2 space-y-2">
              <button onClick={() => setExpandedId(isExpanded ? null : chart.id)} className="w-full text-left flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-200">{chart.kicks.length} kick{chart.kicks.length !== 1 ? "s" : ""} — Due {new Date(chart.dueDate).toLocaleDateString()}</p>
                  <p className="text-[10px] text-muted">{new Date(chart.createdAt).toLocaleDateString()} — {chart.athletes.join(", ")}</p>
                </div>
                <span className="text-xs text-muted">{isExpanded ? "▼" : "▶"}</span>
              </button>
              {isExpanded && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-0.5">
                    {chart.kicks.map((k, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs text-slate-300">
                        <span className="text-muted w-4">{i + 1}.</span>
                        <span className="font-semibold text-slate-200">{k.distance}yd</span>
                        <span>{k.hash}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {pending.map((a) => (
                      <span key={a} className="text-[10px] px-2 py-0.5 rounded-input border border-miss/40 text-miss font-semibold">{a} — incomplete</span>
                    ))}
                    {completed.map((a) => (
                      <span key={a} className="text-[10px] px-2 py-0.5 rounded-input border border-make/40 text-make font-semibold">{a} — done</span>
                    ))}
                  </div>
                  {!isReassigning && (
                    <button onClick={() => { setReassignId(chart.id); setReassignPlayers([]); setReassignDate(""); }} className="text-[10px] text-sky-400 hover:underline">Re-assign this chart</button>
                  )}
                  {isReassigning && (
                    <div className="card space-y-3">
                      <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Re-assign</p>
                      <div className="flex flex-wrap gap-1.5">
                        {athleteNames.map((a) => (
                          <button key={a} onClick={() => toggleReassignPlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", reassignPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
                        ))}
                      </div>
                      <div>
                        <p className="text-[10px] text-muted mb-1">Due Date</p>
                        <input type="date" value={reassignDate} onChange={(e) => setReassignDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setReassignId(null)} className="btn-ghost flex-1 py-2 text-xs">Cancel</button>
                        <button onClick={() => handleReassign(chart.id)} disabled={reassignPlayers.length === 0 || !reassignDate} className="btn-primary flex-1 py-2 text-xs font-bold disabled:opacity-40">Assign</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="pt-4 border-t border-border space-y-6">
            {activeCharts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-100">Active Charts</h3>
                {activeCharts.map(renderChart)}
              </div>
            )}
            {completedCharts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-100">Completed Charts</h3>
                {completedCharts.map(renderChart)}
              </div>
            )}
          </div>
        );
      })()}
    </main>
  );
}
