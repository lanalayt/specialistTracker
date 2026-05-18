"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { usePunt } from "@/lib/puntContext";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import clsx from "clsx";

const HASH_OPTIONS = [
  { value: "Left", label: "Left Hash" },
  { value: "LM", label: "LM" },
  { value: "M", label: "Middle" },
  { value: "RM", label: "RM" },
  { value: "Right", label: "Right Hash" },
];

interface PuntTypeConfig { id: string; label: string; category: string; metric: string; hangTime: boolean }
interface PuntCategory { id: string; label: string; enabled: boolean }

const DEFAULT_CATEGORIES: PuntCategory[] = [
  { id: "DIRECTIONAL", label: "Directional", enabled: true },
  { id: "POOCH", label: "Pooch", enabled: true },
  { id: "BANANA", label: "Banana", enabled: true },
  { id: "RUGBY", label: "Rugby", enabled: true },
];

const DEFAULT_TYPES: PuntTypeConfig[] = [
  { id: "DIR_LEFT", label: "Left", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "DIR_STRAIGHT", label: "Straight", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "DIR_RIGHT", label: "Right", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "POOCH_LEFT", label: "Pooch Left", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "POOCH_MIDDLE", label: "Pooch Middle", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "POOCH_RIGHT", label: "Pooch Right", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "BANANA_LEFT", label: "Banana Left", category: "BANANA", metric: "distance", hangTime: true },
  { id: "BANANA_RIGHT", label: "Banana Right", category: "BANANA", metric: "distance", hangTime: true },
  { id: "RUGBY", label: "Rugby", category: "RUGBY", metric: "distance", hangTime: true },
];

function loadPuntSettings() {
  if (typeof window === "undefined") return { types: DEFAULT_TYPES, categories: DEFAULT_CATEGORIES };
  try {
    const raw = localStorage.getItem("puntSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const categories = parsed.puntCategories?.length > 0 ? parsed.puntCategories : DEFAULT_CATEGORIES;
      const types = parsed.puntTypes?.length > 0 ? parsed.puntTypes : DEFAULT_TYPES;
      return { types: types as PuntTypeConfig[], categories: categories as PuntCategory[] };
    }
  } catch {}
  return { types: DEFAULT_TYPES, categories: DEFAULT_CATEGORIES };
}

interface PuntRow {
  category: string;
  count: number;
  typeId: string;
  hash: string;
}

export default function PuntCoachesChartPage() {
  const { user, isCoach } = useAuth();
  const { athletes } = usePunt();
  const athleteNames = athletes.map((a) => a.name);

  const [puntTypes, setPuntTypes] = useState<PuntTypeConfig[]>(DEFAULT_TYPES);
  const [puntCategories, setPuntCategories] = useState<PuntCategory[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    const { types, categories } = loadPuntSettings();
    setPuntTypes(types);
    setPuntCategories(categories);
  }, []);

  const enabledCategories = puntCategories.filter((c) => c.enabled);
  const getTypesForCategory = (catId: string) => puntTypes.filter((t) => t.category === catId);

  const [puntRows, setPuntRows] = useState<PuntRow[]>([{ category: "DIRECTIONAL", count: 5, typeId: "DIR_STRAIGHT", hash: "M" }]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [chartAction, setChartAction] = useState<"assign" | "now">("assign");
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

  const updateRow = (idx: number, field: keyof PuntRow, value: string | number) => {
    setPuntRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      // When category changes, auto-select first type in that category
      if (field === "category") {
        const types = getTypesForCategory(value as string);
        updated.typeId = types[0]?.id ?? "";
      }
      return updated;
    }));
  };

  const addRow = () => {
    const firstCat = enabledCategories[0]?.id ?? "DIRECTIONAL";
    const firstType = getTypesForCategory(firstCat)[0]?.id ?? "";
    setPuntRows((prev) => [...prev, { category: firstCat, count: 0, typeId: firstType, hash: "M" }]);
  };

  const removeRow = (idx: number) => {
    if (puntRows.length <= 1) return;
    setPuntRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAssign = async () => {
    if (totalReps <= 0 || selectedPlayers.length === 0 || !dueDate) return;
    const tid = getTeamId();
    if (!tid) return;
    const puntTypeBreakdown = puntRows.filter((r) => r.count > 0).map((r) => {
      const typeConfig = puntTypes.find((t) => t.id === r.typeId);
      const catConfig = puntCategories.find((c) => c.id === r.category);
      return { type: catConfig?.label ?? r.category, typeId: r.typeId, typeLabel: typeConfig?.label ?? r.typeId, count: r.count, hash: r.hash };
    });
    const chart: AssignedChart = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "ATHLETE_PUNTING", createdBy: user?.name ?? "Coach", createdAt: new Date().toISOString(),
      dueDate, athletes: selectedPlayers, kicks: [], reps: totalReps,
      puntTypes: puntTypeBreakdown.map((p) => ({ type: `${p.type} - ${p.typeLabel}`, count: p.count, typeId: p.typeId, hash: p.hash } as any)),
      completedBy: {},
    };
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, [...existing, chart]);
    setSaved(true);
    loadCharts();
  };

  const handleDeleteAssignedChart = async (chartId: string) => {
    if (!window.confirm("Are you sure you want to delete this assigned chart? This cannot be undone.")) return;
    const tid = getTeamId();
    if (!tid) return;
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, existing.filter((c) => c.id !== chartId));
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
    const types = chart.puntTypes ?? [];
    return (
      <div key={chart.id} className="card-2 space-y-2">
        <button onClick={() => setExpandedId(isExpanded ? null : chart.id)} className="w-full text-left flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-200">{chart.reps} punt{(chart.reps ?? 0) !== 1 ? "s" : ""} — Due {new Date(chart.dueDate).toLocaleDateString()}</p>
            <p className="text-[10px] text-muted">{types.map((t: any) => `${t.type} ×${t.count}${t.hash ? ` (${t.hash})` : ""}`).join(", ")}</p>
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
            {isCoach && !isReassigning && (<>
              <button onClick={() => { setReassignId(chart.id); setReassignPlayers([]); setReassignDate(""); }} className="text-[10px] text-sky-400 hover:underline">Re-assign</button>
              <button onClick={() => handleDeleteAssignedChart(chart.id)} className="text-[10px] text-miss hover:underline">Delete chart</button>
            </>)}
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
            <button onClick={() => { setPuntRows([{ category: "DIRECTIONAL", count: 5, typeId: "DIR_STRAIGHT", hash: "M" }]); setSelectedPlayers([]); setDueDate(""); setSaved(false); }} className="btn-primary flex-1 py-3 text-sm">Create Another</button>
            <Link href="/athlete/punting/session" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Punt Chart</p>
            {puntRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                {/* Category */}
                <select value={row.category} onChange={(e) => updateRow(idx, "category", e.target.value)} className="input text-xs py-1.5 w-24">
                  {enabledCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {/* Count */}
                <input type="text" inputMode="numeric" value={row.count || ""} onChange={(e) => updateRow(idx, "count", parseInt(e.target.value.replace(/\D/g, "")) || 0)} className="input w-12 text-center text-xs font-bold py-1.5" />
                {/* Sub-type */}
                <select value={row.typeId} onChange={(e) => updateRow(idx, "typeId", e.target.value)} className="input text-xs py-1.5 flex-1 min-w-[80px]">
                  {getTypesForCategory(row.category).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {/* Hash */}
                <select value={row.hash} onChange={(e) => updateRow(idx, "hash", e.target.value)} className="input text-xs py-1.5 w-24">
                  {HASH_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
                {puntRows.length > 1 && (
                  <button onClick={() => removeRow(idx)} className="text-miss text-xs hover:underline">&times;</button>
                )}
              </div>
            ))}
            <button onClick={addRow} className="text-[10px] text-sky-400 hover:underline">+ Add punt</button>
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
            <button onClick={handleAssign} disabled={totalReps <= 0 || selectedPlayers.length === 0 || !dueDate} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">
              Assign Chart ({totalReps} punt{totalReps !== 1 ? "s" : ""} → {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""})
            </button>
          ) : (
            <Link
              href="/athlete/punting/athlete-chart"
              onClick={() => localStorage.setItem("coach_punt_chart_now", JSON.stringify({ reps: totalReps, puntRows, players: selectedPlayers }))}
              className={clsx("btn-primary w-full py-3 text-sm font-bold text-center block", (totalReps <= 0 || selectedPlayers.length === 0) && "opacity-40 pointer-events-none")}
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
