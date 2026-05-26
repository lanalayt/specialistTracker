"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLongSnap } from "@/lib/longSnapContext";
import { getTeamId } from "@/lib/teamData";
import { loadAthletes } from "@/lib/athleteStore";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import clsx from "clsx";

interface SnapRow {
  snapType: "FG" | "PUNT";
  count: number;
}

export default function SnapCoachesChartPage() {
  const { user, isCoach } = useAuth();
  const { athletes } = useLongSnap();
  const [teamRoster, setTeamRoster] = useState<Set<string> | null>(null);

  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const team = await loadAthletes(tid, "LONGSNAP");
      setTeamRoster(new Set(team.map((a) => a.name)));
    })();
  }, []);

  const athleteNames = teamRoster
    ? athletes.map((a) => a.name).filter((n) => teamRoster.has(n))
    : athletes.map((a) => a.name);

  const DRAFT_KEY = "snap_coaches_chart_draft";

  const [snapRows, setSnapRows] = useState<SnapRow[]>(() => {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? ""); if (d?.snapRows?.length) return d.snapRows; } catch {}
    return [{ snapType: "FG", count: 10 }];
  });
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(() => {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? ""); return d?.selectedPlayers ?? []; } catch {} return [];
  });
  const [chartAction, setChartAction] = useState<"assign" | "now">("assign");
  const [dueDate, setDueDate] = useState("");
  const [saved, setSaved] = useState(false);
  const [charts, setCharts] = useState<AssignedChart[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignPlayers, setReassignPlayers] = useState<string[]>([]);
  const [reassignDate, setReassignDate] = useState("");

  const totalSnaps = snapRows.reduce((s, r) => s + r.count, 0);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ snapRows, selectedPlayers })); } catch {}
  }, [snapRows, selectedPlayers]);

  useEffect(() => { loadChartsData(); }, [user?.id]);

  const loadChartsData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
    if (!tid) return;
    const all = await loadAssignedCharts(tid);
    setCharts(all.filter((c) => c.sport === "ATHLETE_LONGSNAP").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const togglePlayer = (name: string) => setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  const selectAll = () => setSelectedPlayers(athleteNames);
  const toggleReassignPlayer = (name: string) => setReassignPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const addRow = () => setSnapRows([...snapRows, { snapType: "FG", count: 5 }]);
  const removeRow = (idx: number) => { if (snapRows.length > 1) setSnapRows(snapRows.filter((_, i) => i !== idx)); };

  const handleAssign = async () => {
    if (totalSnaps <= 0 || selectedPlayers.length === 0 || !dueDate) return;
    const tid = getTeamId();
    if (!tid) return;
    const chart: AssignedChart = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "ATHLETE_LONGSNAP", createdBy: user?.name ?? "Coach", createdAt: new Date().toISOString(),
      dueDate, athletes: selectedPlayers, kicks: [], reps: totalSnaps,
      puntTypes: snapRows.map((r) => ({ type: r.snapType, typeId: r.snapType, typeLabel: r.snapType === "FG" ? "FG / Short Snap" : "Punt / Long Snap", count: r.count, hash: "" })) as any,
      completedBy: {},
    };
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, [...existing, chart]);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setSaved(true);
    loadChartsData();
  };

  const handleChartNow = () => {
    const rows = snapRows.map((r) => ({ snapType: r.snapType, count: r.count }));
    localStorage.setItem("coach_snap_chart_now", JSON.stringify({ reps: totalSnaps, snapRows: rows, players: selectedPlayers }));
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  const handleDeleteChart = async (chartId: string) => {
    if (!window.confirm("Delete this chart?")) return;
    const tid = getTeamId();
    if (!tid) return;
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, existing.filter((c) => c.id !== chartId));
    loadChartsData();
  };

  const handleReassign = async (chartId: string) => {
    if (reassignPlayers.length === 0 || !reassignDate) return;
    const tid = getTeamId();
    if (!tid) return;
    const original = charts.find((c) => c.id === chartId);
    if (!original) return;
    const newChart: AssignedChart = {
      ...original,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(), dueDate: reassignDate, athletes: reassignPlayers, completedBy: {},
    };
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, [...existing, newChart]);
    setReassignId(null); setReassignPlayers([]); setReassignDate("");
    loadChartsData();
  };

  const renderChart = (chart: AssignedChart) => {
    const isExpanded = expandedId === chart.id;
    const isReassigning = reassignId === chart.id;
    const pending = chart.athletes.filter((a) => !chart.completedBy[a]);
    const completed = chart.athletes.filter((a) => !!chart.completedBy[a]);
    const rows = (chart.puntTypes ?? []) as any[];
    return (
      <div key={chart.id} className="card-2 space-y-2">
        <button onClick={() => setExpandedId(isExpanded ? null : chart.id)} className="w-full text-left flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-200">{chart.reps} snap{(chart.reps ?? 0) !== 1 ? "s" : ""} — Due {new Date(chart.dueDate).toLocaleDateString()}</p>
            <p className="text-[10px] text-muted">{new Date(chart.createdAt).toLocaleDateString()} — {chart.athletes.join(", ")}</p>
          </div>
          <span className="text-xs text-muted">{isExpanded ? "▼" : "▶"}</span>
        </button>
        {isExpanded && (
          <div className="space-y-2 pt-1">
            {rows.length > 0 && (
              <div className="space-y-0.5">
                {rows.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-slate-300">
                    <span className="text-muted w-4">{i + 1}.</span>
                    <span className="font-semibold text-slate-200">{r.typeLabel || r.type}</span>
                    <span>x{r.count}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {pending.map((a) => (
                <Link key={a} href={`/athlete/longsnap/athlete-chart?assigned=${chart.id}`} className="text-[10px] px-2 py-0.5 rounded-input border border-miss/40 text-miss font-semibold hover:bg-miss/10 transition-colors">{a} — start chart</Link>
              ))}
              {completed.map((a) => (
                <span key={a} className="text-[10px] px-2 py-0.5 rounded-input border border-make/40 text-make font-semibold">{a} — done</span>
              ))}
            </div>
            {isCoach && !isReassigning && (
              <div className="flex flex-col gap-1">
                <button onClick={() => { setReassignId(chart.id); setReassignPlayers([]); setReassignDate(""); }} className="text-[10px] text-sky-400 hover:underline">Re-assign</button>
                <button onClick={() => handleDeleteChart(chart.id)} className="text-[10px] text-miss hover:underline">Delete chart</button>
              </div>
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
      <Link href="/athlete/longsnap" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
      <h2 className="text-lg font-bold text-slate-100">{isCoach ? "Coaches Chart" : "Assigned Charts"}</h2>

      {isCoach && (saved ? (
        <div className="space-y-4 text-center py-8">
          <p className="text-2xl font-black text-sky-400">Chart Assigned!</p>
          <p className="text-sm text-muted">{totalSnaps} snaps — {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""}</p>
          <div className="flex gap-3 max-w-sm mx-auto">
            <button onClick={() => { setSnapRows([{ snapType: "FG", count: 10 }]); setSelectedPlayers([]); setDueDate(""); setSaved(false); }} className="btn-primary flex-1 py-3 text-sm">Create Another</button>
            <Link href="/athlete/longsnap" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Snap Breakdown</p>
            {snapRows.map((row, idx) => (
              <div key={idx} className="card-2 flex items-center gap-2">
                <select value={row.snapType} onChange={(e) => setSnapRows(snapRows.map((r, i) => i === idx ? { ...r, snapType: e.target.value as "FG" | "PUNT" } : r))} className="input text-xs py-1.5 w-32">
                  <option value="FG">FG / Short Snap</option>
                  <option value="PUNT">Punt / Long Snap</option>
                </select>
                <input type="text" inputMode="numeric" value={row.count || ""} onChange={(e) => setSnapRows(snapRows.map((r, i) => i === idx ? { ...r, count: parseInt(e.target.value.replace(/\D/g, "")) || 0 } : r))} className="input w-14 text-center text-xs font-bold py-1.5" placeholder="#" />
                <span className="text-xs text-muted">snaps</span>
                {snapRows.length > 1 && <button onClick={() => removeRow(idx)} className="text-miss text-xs hover:underline ml-auto">&times;</button>}
              </div>
            ))}
            <button onClick={addRow} className="text-[10px] text-sky-400 hover:underline">+ Add row</button>
            <p className="text-xs text-muted">Total: {totalSnaps} snap{totalSnaps !== 1 ? "s" : ""} per player</p>
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
            {athleteNames.length === 0 && <p className="text-xs text-muted mt-1">No athletes found.</p>}
          </div>

          <div className="flex rounded-input border border-border overflow-hidden w-fit">
            <button onClick={() => setChartAction("now")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", chartAction === "now" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Chart Now</button>
            <button onClick={() => setChartAction("assign")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", chartAction === "assign" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Assign Chart</button>
          </div>

          {chartAction === "assign" && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Due Date</p>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
            </div>
          )}

          {chartAction === "assign" ? (
            <button onClick={handleAssign} disabled={totalSnaps <= 0 || selectedPlayers.length === 0 || !dueDate} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">
              Assign Chart ({totalSnaps} snap{totalSnaps !== 1 ? "s" : ""} → {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""})
            </button>
          ) : (
            <Link
              href="/athlete/longsnap/athlete-chart"
              onClick={handleChartNow}
              className={clsx("btn-primary w-full py-3 text-sm font-bold text-center block", (totalSnaps <= 0 || selectedPlayers.length === 0) && "opacity-40 pointer-events-none")}
            >
              Start Chart Now
            </Link>
          )}
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
