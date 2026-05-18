"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { usePunt } from "@/lib/puntContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import clsx from "clsx";

const DEFAULT_PUNT_TYPES = ["Open Field", "Pooch", "Rugby", "Banana"];

export default function PuntCoachesChartPage() {
  const { user, isCoach } = useAuth();
  const { athletes } = usePunt();
  const athleteNames = athletes.map((a) => a.name);

  const [puntTypeOptions, setPuntTypeOptions] = useState(DEFAULT_PUNT_TYPES);
  const [puntRows, setPuntRows] = useState<{ type: string; count: number }[]>([{ type: "Open Field", count: 5 }]);
  const [newTypeName, setNewTypeName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [saved, setSaved] = useState(false);

  const [charts, setCharts] = useState<AssignedChart[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignPlayers, setReassignPlayers] = useState<string[]>([]);
  const [reassignDate, setReassignDate] = useState("");

  const totalReps = puntRows.reduce((s, r) => s + r.count, 0);

  useEffect(() => { loadCharts(); }, [user?.id]);

  const loadCharts = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
    if (!tid) return;
    const all = await loadAssignedCharts(tid);
    setCharts(all.filter((c) => c.sport === "ATHLETE_PUNTING").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const togglePlayer = (name: string) => setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  const selectAll = () => setSelectedPlayers(athleteNames);
  const toggleReassignPlayer = (name: string) => setReassignPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const updateRowType = (idx: number, type: string) => {
    setPuntRows((prev) => prev.map((r, i) => i === idx ? { ...r, type } : r));
  };

  const updateRowCount = (idx: number, count: number) => {
    setPuntRows((prev) => prev.map((r, i) => i === idx ? { ...r, count } : r));
  };

  const addRow = () => {
    setPuntRows((prev) => [...prev, { type: "Open Field", count: 0 }]);
  };

  const removeRow = (idx: number) => {
    if (puntRows.length <= 1) return;
    setPuntRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addCustomType = () => {
    const trimmed = newTypeName.trim();
    if (!trimmed || puntTypeOptions.includes(trimmed)) return;
    setPuntTypeOptions((prev) => [...prev, trimmed]);
    setNewTypeName("");
  };

  const handleAssign = async () => {
    if (totalReps <= 0 || selectedPlayers.length === 0 || !dueDate) return;
    const tid = getTeamId();
    if (!tid) return;
    const chart: AssignedChart = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "ATHLETE_PUNTING", createdBy: user?.name ?? "Coach", createdAt: new Date().toISOString(),
      dueDate, athletes: selectedPlayers, kicks: [], reps: totalReps, puntTypes: puntRows.filter((r) => r.count > 0), completedBy: {},
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
      sport: "ATHLETE_PUNTING", createdBy: user?.name ?? "Coach", createdAt: new Date().toISOString(),
      dueDate: reassignDate, athletes: reassignPlayers, kicks: [], reps: original.reps, puntTypes: original.puntTypes, completedBy: {},
    };
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, [...existing, newChart]);
    setReassignId(null); setReassignPlayers([]); setReassignDate("");
    loadCharts();
  };

  const renderChart = (chart: AssignedChart) => {
    const isExpanded = expandedId === chart.id;
    const isReassigning = reassignId === chart.id;
    const pending = chart.athletes.filter((a) => !chart.completedBy[a]);
    const completed = chart.athletes.filter((a) => !!chart.completedBy[a]);
    const types = chart.puntTypes ?? (chart.reps ? [{ type: "Open Field", count: chart.reps }] : []);
    return (
      <div key={chart.id} className="card-2 space-y-2">
        <button onClick={() => setExpandedId(isExpanded ? null : chart.id)} className="w-full text-left flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-200">{chart.reps} punt{(chart.reps ?? 0) !== 1 ? "s" : ""} — Due {new Date(chart.dueDate).toLocaleDateString()}</p>
            <p className="text-[10px] text-muted">{types.map((t) => `${t.type} (${t.count})`).join(", ")}</p>
          </div>
          <span className="text-xs text-muted">{isExpanded ? "▼" : "▶"}</span>
        </button>
        {isExpanded && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-1">
              {pending.map((a) => (
                <Link key={a} href={`/athlete/punting/athlete-chart?assigned=${chart.id}`} className="text-[10px] px-2 py-0.5 rounded-input border border-miss/40 text-miss font-semibold hover:bg-miss/10 transition-colors">{a} — start chart</Link>
              ))}
              {completed.map((a) => (
                <span key={a} className="text-[10px] px-2 py-0.5 rounded-input border border-make/40 text-make font-semibold">{a} — done</span>
              ))}
            </div>
            {isCoach && !isReassigning && (
              <button onClick={() => { setReassignId(chart.id); setReassignPlayers([]); setReassignDate(""); }} className="text-[10px] text-sky-400 hover:underline">Re-assign</button>
            )}
            {isReassigning && (
              <div className="card space-y-3">
                <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Re-assign</p>
                <div className="flex flex-wrap gap-1.5">
                  {athleteNames.map((a) => (
                    <button key={a} onClick={() => toggleReassignPlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", reassignPlayers.includes(a) ? "bg-sky-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
                  ))}
                </div>
                <input type="date" value={reassignDate} onChange={(e) => setReassignDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
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

  const activeCharts = charts.filter((c) => c.athletes.some((a) => !c.completedBy[a]));
  const completedCharts = charts.filter((c) => c.athletes.every((a) => !!c.completedBy[a]));

  return (
    <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
      <Link href="/athlete/punting/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
      <h2 className="text-lg font-bold text-slate-100">{isCoach ? "Coaches Chart" : "Assigned Charts"}</h2>

      {isCoach && (saved ? (
        <div className="space-y-4 text-center py-8">
          <p className="text-2xl font-black text-sky-400">Chart Assigned!</p>
          <p className="text-sm text-muted">{totalReps} punts — {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""}</p>
          <div className="flex gap-3 max-w-sm mx-auto">
            <button onClick={() => { setPuntRows([{ type: "Open Field", count: 5 }]); setSelectedPlayers([]); setDueDate(""); setSaved(false); }} className="btn-primary flex-1 py-3 text-sm">Create Another</button>
            <Link href="/athlete/punting/session" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Punt type rows */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Punt Types</p>
            {puntRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={row.type} onChange={(e) => updateRowType(idx, e.target.value)} className="input flex-1 text-sm py-1.5">
                  {puntTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="text" inputMode="numeric" value={row.count || ""} onChange={(e) => updateRowCount(idx, parseInt(e.target.value.replace(/\D/g, "")) || 0)} className="input w-14 text-center text-sm font-bold py-1.5" />
                {puntRows.length > 1 && (
                  <button onClick={() => removeRow(idx)} className="text-miss text-xs hover:underline">&times;</button>
                )}
              </div>
            ))}
            <button onClick={addRow} className="text-[10px] text-sky-400 hover:underline">+ Add punt type</button>

            {/* Add custom type */}
            <div className="flex gap-2">
              <input type="text" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustomType(); }} placeholder="Custom punt type..." className="input flex-1 text-xs py-1" />
              <button onClick={addCustomType} disabled={!newTypeName.trim()} className="text-[10px] text-sky-400 hover:underline disabled:opacity-40">Add</button>
            </div>

            <p className="text-xs text-muted">Total: {totalReps} punt{totalReps !== 1 ? "s" : ""} per player</p>
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
          </div>

          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Due Date</p>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
          </div>

          <button onClick={handleAssign} disabled={totalReps <= 0 || selectedPlayers.length === 0 || !dueDate} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">
            Assign Chart ({totalReps} punt{totalReps !== 1 ? "s" : ""} → {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""})
          </button>
        </>
      ))}

      {charts.length > 0 && (
        <div className="pt-4 border-t border-border space-y-6">
          {activeCharts.length > 0 && (<div className="space-y-3"><h3 className="text-sm font-bold text-slate-100">Active Charts</h3>{activeCharts.map(renderChart)}</div>)}
          {completedCharts.length > 0 && (<div className="space-y-3"><h3 className="text-sm font-bold text-slate-100">Completed Charts</h3>{completedCharts.map(renderChart)}</div>)}
        </div>
      )}
    </main>
  );
}
