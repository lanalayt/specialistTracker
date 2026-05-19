"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useKickoff } from "@/lib/kickoffContext";
import { getTeamId } from "@/lib/teamData";
import { loadAthletes } from "@/lib/athleteStore";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import clsx from "clsx";

interface KOTypeConfig { id: string; label: string; category: string; metric: string; hangTime: boolean }
interface KOCategory { id: string; label: string; enabled: boolean }

const DEFAULT_CATEGORIES: KOCategory[] = [
  { id: "DEEP", label: "Deep Kickoffs", enabled: true },
  { id: "SKY", label: "Sky Kick", enabled: true },
  { id: "SQUIB", label: "Squib", enabled: true },
  { id: "ONSIDE", label: "Onside", enabled: true },
];

const DEFAULT_TYPES: KOTypeConfig[] = [
  { id: "DEEP_LEFT", label: "Directional Left", category: "DEEP", metric: "distance", hangTime: true },
  { id: "DEEP_RIGHT", label: "Directional Right", category: "DEEP", metric: "distance", hangTime: true },
  { id: "SKY", label: "Sky Kick", category: "SKY", metric: "distance", hangTime: true },
  { id: "SQUIB_LEFT", label: "Left", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "SQUIB_MID", label: "Middle", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "SQUIB_RIGHT", label: "Right", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "ONSIDE", label: "Onside", category: "ONSIDE", metric: "none", hangTime: false },
];

const HASH_OPTIONS = [
  { value: "LH", label: "Left Hash" },
  { value: "LM", label: "LM" },
  { value: "M", label: "Middle" },
  { value: "RM", label: "RM" },
  { value: "RH", label: "Right Hash" },
];

interface KORow {
  category: string;
  count: number;
  typeId: string;
  hash: string;
}

function loadKOSettings(): { types: KOTypeConfig[]; categories: KOCategory[] } {
  try {
    const raw = localStorage.getItem("kickoffSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const categories: KOCategory[] = parsed.kickoffCategories?.length > 0 ? parsed.kickoffCategories : DEFAULT_CATEGORIES;
      if (parsed.kickoffTypes?.length > 0) {
        const types: KOTypeConfig[] = parsed.kickoffTypes.map((t: Record<string, unknown>) => ({
          id: t.id as string,
          label: t.label as string,
          category: (t.category as string) ?? "DEEP",
          metric: (t.metric as string) ?? "distance",
          hangTime: typeof t.hangTime === "boolean" ? t.hangTime : true,
        }));
        return { types, categories: categories.filter((c) => c.enabled) };
      }
      return { types: DEFAULT_TYPES, categories: categories.filter((c) => c.enabled) };
    }
  } catch {}
  return { types: DEFAULT_TYPES, categories: DEFAULT_CATEGORIES };
}

export default function KickoffCoachesChartPage() {
  const { user, isCoach } = useAuth();
  const { athletes, history } = useKickoff();
  const [teamRoster, setTeamRoster] = useState<Set<string> | null>(null);

  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const team = await loadAthletes(tid, "KICKOFF");
      setTeamRoster(new Set(team.map((a) => a.name)));
    })();
  }, []);

  const athleteNames = teamRoster
    ? athletes.map((a) => a.name).filter((n) => teamRoster.has(n))
    : athletes.map((a) => a.name);

  const [koTypes, setKoTypes] = useState<KOTypeConfig[]>(DEFAULT_TYPES);
  const [koCategories, setKoCategories] = useState<KOCategory[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    const { types, categories } = loadKOSettings();
    setKoTypes(types);
    setKoCategories(categories);
  }, []);

  const getTypesForCategory = (catId: string) => koTypes.filter((t) => t.category === catId);

  const KO_DRAFT_KEY = "ko_coaches_chart_draft";

  const [koRows, setKoRows] = useState<KORow[]>(() => {
    try { const d = JSON.parse(localStorage.getItem(KO_DRAFT_KEY) ?? ""); if (d?.koRows?.length) return d.koRows; } catch {}
    return [{ category: "DEEP", count: 5, typeId: "DEEP_LEFT", hash: "M" }];
  });
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(() => {
    try { const d = JSON.parse(localStorage.getItem(KO_DRAFT_KEY) ?? ""); return d?.selectedPlayers ?? []; } catch {} return [];
  });
  const [chartAction, setChartAction] = useState<"assign" | "now">(() => {
    try { const d = JSON.parse(localStorage.getItem(KO_DRAFT_KEY) ?? ""); return d?.chartAction ?? "assign"; } catch {} return "assign";
  });
  const [dueDate, setDueDate] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(KO_DRAFT_KEY) ?? ""); return d?.dueDate ?? ""; } catch {} return "";
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KO_DRAFT_KEY, JSON.stringify({ koRows, selectedPlayers, chartAction, dueDate })); } catch {}
  }, [koRows, selectedPlayers, chartAction, dueDate]);
  const [charts, setCharts] = useState<AssignedChart[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [reassignPlayers, setReassignPlayers] = useState<string[]>([]);
  const [reassignDate, setReassignDate] = useState("");

  const totalReps = koRows.reduce((s, r) => s + r.count, 0);

  useEffect(() => { loadChartsData(); }, [user?.id]);

  const loadChartsData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
    if (!tid) return;
    const all = await loadAssignedCharts(tid);
    setCharts(all.filter((c) => c.sport === "ATHLETE_KICKOFF").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const togglePlayer = (name: string) => setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  const selectAll = () => setSelectedPlayers(athleteNames);
  const toggleReassignPlayer = (name: string) => setReassignPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);

  const addRow = () => {
    const firstCat = koCategories[0]?.id ?? "DEEP";
    const firstType = getTypesForCategory(firstCat)[0]?.id ?? "";
    setKoRows([...koRows, { category: firstCat, count: 3, typeId: firstType, hash: "M" }]);
  };

  const removeRow = (idx: number) => setKoRows(koRows.filter((_, i) => i !== idx));

  const updateRow = (idx: number, field: keyof KORow, value: string | number) => {
    setKoRows(koRows.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      if (field === "category") {
        const types = getTypesForCategory(value as string);
        updated.typeId = types[0]?.id ?? "";
      }
      return updated;
    }));
  };

  const handleAssign = async () => {
    if (totalReps <= 0 || selectedPlayers.length === 0 || !dueDate) return;
    const tid = getTeamId();
    if (!tid) return;
    const chart: AssignedChart = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "ATHLETE_KICKOFF", createdBy: user?.name ?? "Coach", createdAt: new Date().toISOString(),
      dueDate, athletes: selectedPlayers, kicks: [], reps: totalReps,
      koRows: koRows.map((r) => {
        const t = koTypes.find((t) => t.id === r.typeId);
        return { typeId: r.typeId, typeLabel: t?.label ?? r.typeId, count: r.count, hash: r.hash };
      }),
      completedBy: {},
    };
    const existing = await loadAssignedCharts(tid);
    await saveAssignedCharts(tid, [...existing, chart]);
    try { localStorage.removeItem(KO_DRAFT_KEY); } catch {}
    setSaved(true);
    loadChartsData();
  };

  const handleChartNow = () => {
    const rows = koRows.map((r) => {
      const t = koTypes.find((t) => t.id === r.typeId);
      return { typeId: r.typeId, typeLabel: t?.label ?? r.typeId, count: r.count, hash: r.hash };
    });
    localStorage.setItem("coach_ko_chart_now", JSON.stringify({ reps: totalReps, players: selectedPlayers, koRows: rows }));
    try { localStorage.removeItem(KO_DRAFT_KEY); } catch {}
  };

  const handleDeleteAssignedChart = async (chartId: string) => {
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
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "ATHLETE_KICKOFF", createdBy: user?.name ?? "Coach", createdAt: new Date().toISOString(),
      dueDate: reassignDate, athletes: reassignPlayers, kicks: [], reps: original.reps, koRows: original.koRows,
      completedBy: {},
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
    return (
      <div key={chart.id} className="card-2 space-y-2">
        <button onClick={() => setExpandedId(isExpanded ? null : chart.id)} className="w-full text-left flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-200">{chart.reps} kickoff{(chart.reps ?? 0) !== 1 ? "s" : ""} — Due {new Date(chart.dueDate).toLocaleDateString()}</p>
            <p className="text-[10px] text-muted">{new Date(chart.createdAt).toLocaleDateString()} — {chart.athletes.join(", ")}</p>
          </div>
          <span className="text-xs text-muted">{isExpanded ? "▼" : "▶"}</span>
        </button>
        {isExpanded && (
          <div className="space-y-2 pt-1">
            {chart.koRows && chart.koRows.length > 0 && (
              <div className="space-y-0.5">
                {chart.koRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-slate-300">
                    <span className="text-muted w-4">{i + 1}.</span>
                    <span className="font-semibold text-slate-200">{r.typeLabel}</span>
                    <span>x{r.count}</span>
                    <span className="text-muted">{r.hash}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {pending.map((a) => (
                <Link key={a} href={`/athlete/kickoff/athlete-chart?assigned=${chart.id}`} className="text-[10px] px-2 py-0.5 rounded-input border border-miss/40 text-miss font-semibold hover:bg-miss/10 transition-colors">{a} — start chart</Link>
              ))}
              {completed.map((a) => (
                <span key={a} className="text-[10px] px-2 py-0.5 rounded-input border border-make/40 text-make font-semibold">{a} — done</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {isCoach && !isReassigning && (<div className="flex flex-col gap-1">
                <button onClick={() => { setReassignId(chart.id); setReassignPlayers([]); setReassignDate(""); }} className="text-[10px] text-sky-400 hover:underline">Re-assign</button>
                <button onClick={() => handleDeleteAssignedChart(chart.id)} className="text-[10px] text-miss hover:underline">Delete chart</button>
              </div>)}
            </div>
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
      <Link href="/athlete/kickoff/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
      <h2 className="text-lg font-bold text-slate-100">{isCoach ? "Coaches Chart" : "Assigned Charts"}</h2>

      {isCoach && (saved ? (
        <div className="space-y-4 text-center py-8">
          <p className="text-2xl font-black text-sky-400">Chart Assigned!</p>
          <p className="text-sm text-muted">{totalReps} kickoffs — {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""}</p>
          <div className="flex gap-3 max-w-sm mx-auto">
            <button onClick={() => { setKoRows([{ category: "DEEP", count: 5, typeId: "DEEP_LEFT", hash: "M" }]); setSelectedPlayers([]); setDueDate(""); setSaved(false); }} className="btn-primary flex-1 py-3 text-sm">Create Another</button>
            <Link href="/athlete/kickoff/session" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
          </div>
        </div>
      ) : (
        <>
          {/* KO Rows — type, count, hash */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Kickoff Breakdown</p>
            {koRows.map((row, idx) => (
              <div key={idx} className="card-2 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted">Row {idx + 1}</p>
                  {koRows.length > 1 && <button onClick={() => removeRow(idx)} className="text-[10px] text-miss hover:underline">Remove</button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted mb-1">Category</p>
                    <select value={row.category} onChange={(e) => updateRow(idx, "category", e.target.value)} className="input w-full text-xs py-1.5">
                      {koCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted mb-1"># of Kicks</p>
                    <input type="text" inputMode="numeric" value={row.count} onChange={(e) => updateRow(idx, "count", parseInt(e.target.value.replace(/\D/g, "")) || 0)} className="input w-full text-xs py-1.5 text-center" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted mb-1">Type</p>
                    <select value={row.typeId} onChange={(e) => updateRow(idx, "typeId", e.target.value)} className="input w-full text-xs py-1.5">
                      {getTypesForCategory(row.category).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted mb-1">Location</p>
                    <select value={row.hash} onChange={(e) => updateRow(idx, "hash", e.target.value)} className="input w-full text-xs py-1.5">
                      {HASH_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addRow} className="text-xs text-sky-400 hover:underline">+ Add Row</button>
          </div>

          {/* Athletes */}
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

          {/* Chart Now / Assign */}
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
              Assign Chart ({totalReps} kickoff{totalReps !== 1 ? "s" : ""} → {selectedPlayers.length} athlete{selectedPlayers.length !== 1 ? "s" : ""})
            </button>
          ) : (
            <Link
              href="/athlete/kickoff/athlete-chart"
              onClick={handleChartNow}
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
