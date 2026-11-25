"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { PuntFootIcon, KickoffTeeIcon, SnapperIcon } from "@/components/ui/SportIcons";
import { useAuth } from "@/lib/auth";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, saveAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import React from "react";

const SPORT_CARDS: { href: string; icon?: string; iconEl?: React.ReactNode; label: string }[] = [
  { href: "/athlete/kicking", iconEl: <img src="/kicker-fg.png" alt="" className="h-11 w-auto" />, label: "FG Kicking" },
  { href: "/athlete/punting", iconEl: <PuntFootIcon size={44} />, label: "Punting" },
  { href: "/athlete/kickoff", iconEl: <KickoffTeeIcon size={44} />, label: "Kickoff" },
  { href: "/athlete/longsnap", iconEl: <SnapperIcon size={44} />, label: "Snapping" },
];


const SPORT_PATHS: Record<string, { chart: string; edit: string; label: string; noun: string }> = {
  ATHLETE_KICKING: { chart: "/athlete/kicking/off-sticks/athlete-chart", edit: "/athlete/kicking/off-sticks/coaches-chart", label: "FG", noun: "kick" },
  ATHLETE_PUNTING: { chart: "/athlete/punting/athlete-chart", edit: "/athlete/punting/coaches-chart", label: "Punt", noun: "punt" },
  ATHLETE_KICKOFF: { chart: "/athlete/kickoff/athlete-chart", edit: "/athlete/kickoff/coaches-chart", label: "KO", noun: "kickoff" },
  ATHLETE_LONGSNAP: { chart: "/athlete/longsnap/athlete-chart", edit: "/athlete/longsnap/coaches-chart", label: "Snap", noun: "snap" },
};
const sportInfo = (sport: string) => SPORT_PATHS[sport] ?? SPORT_PATHS.ATHLETE_KICKING;

function chartPathFor(sport: string): string {
  return sportInfo(sport).chart;
}

function editPathFor(sport: string): string {
  return sportInfo(sport).edit;
}

function sportLabel(sport: string): string {
  return sportInfo(sport).label;
}

const HASH_NAMES: Record<string, string> = {
  Left: "Left hash", "Left Hash": "Left hash", LH: "Left hash",
  Right: "Right hash", "Right Hash": "Right hash", RH: "Right hash",
  M: "Middle", LM: "Left middle", RM: "Right middle", ANY: "Any hash",
};
const hashName = (h: string) => HASH_NAMES[h] ?? h;

// Turn a raw id that leaked into a label (e.g. "DIR_STRAIGHT") into something readable ("Straight").
function prettyLabel(label: string): string {
  if (!/^[A-Z0-9_]+$/.test(label) || !label.includes("_")) return label;
  const parts = label.split("_");
  const word = (parts.length > 1 ? parts.slice(1) : parts).join(" ").toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

type PreviewRow = { title: string; subtitle: string; start: number; end: number };

// Expand an assigned chart into its ordered reps, then merge back-to-back identical reps
// so the preview reads "1–2  Blue ×2" instead of repeating the same line.
function buildPreviewRows(chart: AssignedChart): PreviewRow[] {
  const reps: { title: string; subtitle: string }[] = [];
  if (chart.sport === "ATHLETE_PUNTING") {
    for (const pt of (chart.puntTypes ?? []) as any[]) {
      const category = String(pt.type ?? "Punt");
      const sub = pt.typeLabel ? prettyLabel(String(pt.typeLabel)) : "";
      const title = sub && sub !== category ? sub : category;
      const bits = [title !== category ? category : "", pt.hash ? hashName(pt.hash) : "", pt.yardLine ? `LOS ${pt.yardLine}` : ""].filter(Boolean);
      for (let i = 0; i < (pt.count ?? 0); i++) reps.push({ title, subtitle: bits.join(" · ") });
    }
  } else if (chart.sport === "ATHLETE_LONGSNAP") {
    for (const r of (chart.puntTypes ?? []) as any[]) {
      const isPunt = (r.typeId ?? r.type) === "PUNT";
      for (let i = 0; i < (r.count ?? 0); i++) reps.push({ title: isPunt ? "Long snap" : "Short snap", subtitle: isPunt ? "Punt" : "Field goal" });
    }
  } else if (chart.sport === "ATHLETE_KICKOFF") {
    for (const r of chart.koRows ?? []) {
      for (let i = 0; i < r.count; i++) reps.push({ title: prettyLabel(r.typeLabel), subtitle: hashName(r.hash) });
    }
  } else {
    for (const k of chart.kicks) reps.push({ title: `${k.distance} yd`, subtitle: hashName(k.hash) });
  }
  const rows: PreviewRow[] = [];
  reps.forEach((r, i) => {
    const last = rows[rows.length - 1];
    if (last && last.title === r.title && last.subtitle === r.subtitle) last.end = i + 1;
    else rows.push({ ...r, start: i + 1, end: i + 1 });
  });
  return rows;
}

export default function AthleteDashboardPage() {
  const { user, isCoach } = useAuth();
  const [charts, setCharts] = useState<AssignedChart[]>([]);
  const [previewChart, setPreviewChart] = useState<AssignedChart | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteChart = async (chart: AssignedChart) => {
    if (!window.confirm("Delete this assigned chart? This cannot be undone.")) return;
    const tid = getTeamId();
    if (!tid) return;
    setDeleting(true);
    try {
      const existing = await loadAssignedCharts(tid);
      await saveAssignedCharts(tid, existing.filter((c) => c.id !== chart.id));
      setCharts(await loadAssignedCharts(tid));
      setPreviewChart(null);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 200)); tid = getTeamId(); }
      if (!tid) return;
      const all = await loadAssignedCharts(tid);
      setCharts(all);
    }
    load();
  }, [user?.id]);

  // Show all charts that have at least one athlete who hasn't completed it
  const activeCharts = charts.filter((c) => c.athletes.some((a) => !c.completedBy[a]));

  return (
    <>
      <Header title="Athlete Mode" />
      <main className="p-4 lg:p-6 space-y-6 max-w-6xl">
        <h1 className="text-2xl font-extrabold text-slate-100">Athlete Mode</h1>

        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Sport Modules
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SPORT_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6"
              >
                <div className="text-4xl mb-2">{card.iconEl ?? card.icon}</div>
                <h3 className="text-xs font-bold text-slate-100 group-hover:text-sky-400 transition-colors">
                  {card.label}
                </h3>
              </Link>
            ))}
          </div>
        </div>

        {/* Assigned Charts */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Assigned Charts
          </h2>
          {activeCharts.length === 0 ? (
            <p className="text-xs text-muted">No assigned charts right now.</p>
          ) : (
            <div className="space-y-2">
              {activeCharts.map((chart) => {
                const isOverdue = new Date(chart.dueDate) < new Date(new Date().toDateString());
                const pending = chart.athletes.filter((a) => !chart.completedBy[a]);
                const completed = chart.athletes.filter((a) => !!chart.completedBy[a]);
                return (
                  <div key={chart.id} role="button" tabIndex={0} onClick={() => setPreviewChart(chart)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewChart(chart); } }} className="card py-3 px-4 space-y-2 cursor-pointer hover:bg-surface-2 hover:border-sky-500/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {sportLabel(chart.sport)} Chart — {chart.reps ? `${chart.reps} reps` : `${chart.kicks.length} kick${chart.kicks.length !== 1 ? "s" : ""}`}
                        </p>
                        <p className="text-[10px] text-muted">
                          From {chart.createdBy}{chart.kicks.length > 0 ? ` — ${chart.kicks.map((k) => `${k.distance}${k.hash}`).join(", ")}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={`text-xs font-bold ${isOverdue ? "text-miss" : "text-sky-400"}`}>
                          {isOverdue ? "Overdue" : `Due ${new Date(chart.dueDate).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pending.map((name) => (
                        <span key={name} className="text-[10px] px-2 py-0.5 rounded-input border border-miss/40 text-miss font-semibold">
                          {name} — incomplete
                        </span>
                      ))}
                      {completed.map((name) => (
                        <span key={name} className="text-[10px] px-2 py-0.5 rounded-input border border-make/40 text-make font-semibold">
                          {name} — done
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activeCharts.length > 0 && <p className="text-[10px] text-muted mt-2">Tap a chart to preview every rep before starting.</p>}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Link href="/athlete/archives" className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex items-center gap-3 py-3 px-4">
              <span className="text-xl">🗄</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition-colors">Archives</span>
            </Link>
          </div>
        </div>
      </main>

      {previewChart && (() => {
        const rows = buildPreviewRows(previewChart);
        const total = rows.length ? rows[rows.length - 1].end : (previewChart.reps ?? 0);
        const noun = sportInfo(previewChart.sport).noun;
        const pending = previewChart.athletes.filter((a) => !previewChart.completedBy[a]);
        const completed = previewChart.athletes.filter((a) => !!previewChart.completedBy[a]);
        const isOverdue = !!previewChart.dueDate && new Date(previewChart.dueDate) < new Date(new Date().toDateString());
        const dueText = previewChart.dueDate ? new Date(previewChart.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={() => setPreviewChart(null)}>
            <div className="bg-surface border border-white/10 w-full sm:max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15" />
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-100">{sportLabel(previewChart.sport)} Chart</h3>
                  <p className="text-xs text-muted">
                    {total} {noun}{total !== 1 ? "s" : ""} each · From {previewChart.createdBy}
                  </p>
                  {dueText && (
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${isOverdue ? "bg-red-500/15 text-miss" : "bg-sky-400/10 text-sky-300"}`}>
                      {isOverdue ? `Overdue · ${dueText}` : `Due ${dueText}`}
                    </span>
                  )}
                </div>
                <button onClick={() => setPreviewChart(null)} aria-label="Close" className="h-8 w-8 shrink-0 rounded-full bg-white/5 text-muted hover:text-white flex items-center justify-center text-lg leading-none">&times;</button>
              </div>

              <div className="overflow-y-auto px-5 pb-2">
                {rows.length === 0 ? (
                  <p className="text-sm text-muted py-4">No specific reps listed for this chart.</p>
                ) : (
                  <ol className="divide-y divide-white/5">
                    {rows.map((r) => {
                      const count = r.end - r.start + 1;
                      return (
                        <li key={r.start} className="flex items-center gap-3 py-3">
                          <span className="w-10 shrink-0 text-xs tabular-nums text-muted opacity-60">{count > 1 ? `${r.start}–${r.end}` : r.start}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-slate-100 truncate">{r.title}</p>
                            {r.subtitle && <p className="text-xs text-muted truncate">{r.subtitle}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-white/5 space-y-3">
                <Link href={`${chartPathFor(previewChart.sport)}?assigned=${previewChart.id}`} className="btn-primary w-full py-3 text-sm font-bold block text-center">
                  Start Chart
                </Link>
                {(pending.length > 0 || completed.length > 0) && (
                  <p className="text-[11px] text-muted text-center">
                    {pending.length > 0 && <>For {pending.join(", ")}</>}
                    {pending.length > 0 && completed.length > 0 && " · "}
                    {completed.length > 0 && <span className="text-make">Done: {completed.join(", ")}</span>}
                  </p>
                )}
                {isCoach && (
                  <div className="flex justify-center gap-6 text-xs font-semibold">
                    <Link href={`${editPathFor(previewChart.sport)}?edit=${previewChart.id}`} className="text-slate-300 hover:text-white transition-colors">Edit chart</Link>
                    <button onClick={() => handleDeleteChart(previewChart)} disabled={deleting} className="text-miss opacity-80 hover:opacity-100 transition-opacity disabled:opacity-40">{deleting ? "Deleting…" : "Delete chart"}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
