"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { PuntFootIcon, KickoffTeeIcon, SnapperIcon } from "@/components/ui/SportIcons";
import { useAuth } from "@/lib/auth";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import React from "react";

const SPORT_CARDS: { href: string; icon?: string; iconEl?: React.ReactNode; label: string }[] = [
  { href: "/athlete/kicking", iconEl: <img src="/kicker-fg.png" alt="" className="h-11 w-auto" />, label: "FG Kicking" },
  { href: "/athlete/punting", iconEl: <PuntFootIcon size={44} />, label: "Punting" },
  { href: "/athlete/kickoff", iconEl: <KickoffTeeIcon size={44} />, label: "Kickoff" },
  { href: "/athlete/longsnap", iconEl: <SnapperIcon size={44} />, label: "Snapping" },
];

const KO_HASH_LABELS: Record<string, string> = { LH: "Left Hash", LM: "Left Middle", M: "Middle", RM: "Right Middle", RH: "Right Hash" };

function chartPathFor(sport: string): string {
  return sport === "ATHLETE_PUNTING" ? "/athlete/punting/athlete-chart" : sport === "ATHLETE_KICKOFF" ? "/athlete/kickoff/athlete-chart" : "/athlete/kicking/off-sticks/athlete-chart";
}

function sportLabel(sport: string): string {
  return sport === "ATHLETE_KICKING" ? "FG" : sport === "ATHLETE_PUNTING" ? "Punt" : "KO";
}

type PreviewRow = { main: string; details: string[] };

// Expand an assigned chart into the full ordered list of reps, matching how the chart pages build their schedule.
function buildPreviewRows(chart: AssignedChart): PreviewRow[] {
  const rows: PreviewRow[] = [];
  if (chart.sport === "ATHLETE_PUNTING") {
    for (const pt of (chart.puntTypes ?? []) as any[]) {
      const label = String(pt.type ?? pt.typeLabel ?? "Punt");
      const sub = pt.typeLabel && pt.typeLabel !== label ? String(pt.typeLabel) : "";
      for (let i = 0; i < (pt.count ?? 0); i++) {
        const details: string[] = [];
        if (sub) details.push(sub);
        if (pt.hash) details.push(pt.hash === "ANY" ? "Any hash" : `Hash: ${pt.hash}`);
        if (pt.yardLine) details.push(`LOS: ${pt.yardLine}`);
        rows.push({ main: label, details });
      }
    }
  } else if (chart.sport === "ATHLETE_KICKOFF") {
    for (const r of chart.koRows ?? []) {
      for (let i = 0; i < r.count; i++) rows.push({ main: r.typeLabel, details: [KO_HASH_LABELS[r.hash] ?? r.hash] });
    }
  } else {
    for (const k of chart.kicks) rows.push({ main: `${k.distance}yd`, details: [k.hash] });
  }
  return rows;
}

export default function AthleteDashboardPage() {
  const { user } = useAuth();
  const [charts, setCharts] = useState<AssignedChart[]>([]);
  const [previewChart, setPreviewChart] = useState<AssignedChart | null>(null);

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
        const noun = previewChart.sport === "ATHLETE_PUNTING" ? "Punt" : "Kick";
        const pending = previewChart.athletes.filter((a) => !previewChart.completedBy[a]);
        const completed = previewChart.athletes.filter((a) => !!previewChart.completedBy[a]);
        const isOverdue = new Date(previewChart.dueDate) < new Date(new Date().toDateString());
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setPreviewChart(null)}>
            <div className="bg-surface border border-border w-full sm:max-w-md max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
                <div>
                  <h3 className="text-base font-bold text-slate-100">{sportLabel(previewChart.sport)} Chart Preview</h3>
                  <p className="text-[11px] text-muted">
                    From {previewChart.createdBy}
                    {previewChart.dueDate ? <> — <span className={isOverdue ? "text-miss font-semibold" : "text-sky-400 font-semibold"}>{isOverdue ? "Overdue" : `Due ${new Date(previewChart.dueDate).toLocaleDateString()}`}</span></> : null}
                  </p>
                </div>
                <button onClick={() => setPreviewChart(null)} aria-label="Close" className="text-muted hover:text-white text-xl leading-none px-1">&times;</button>
              </div>

              <div className="overflow-y-auto p-4 space-y-1">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">{rows.length > 0 ? `${rows.length} ${noun}${rows.length !== 1 ? "s" : ""} per athlete` : `${previewChart.reps ?? 0} reps per athlete`}</p>
                {rows.length === 0 ? (
                  <p className="text-xs text-muted">No specific reps listed for this chart.</p>
                ) : (
                  rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/30 last:border-0">
                      <span className="text-muted w-6 text-xs shrink-0">{i + 1}.</span>
                      <span className="text-slate-100 font-bold">{r.main}</span>
                      {r.details.map((d, j) => <span key={j} className="text-slate-300 text-xs">{d}</span>)}
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border space-y-2">
                {completed.length > 0 && (
                  <p className="text-[10px] text-make">Done: {completed.join(", ")}</p>
                )}
                <Link href={`${chartPathFor(previewChart.sport)}?assigned=${previewChart.id}`} className="btn-primary w-full py-3 text-sm font-bold block text-center">
                  Start Chart{pending.length > 0 ? ` (${pending.join(", ")})` : ""}
                </Link>
                <button onClick={() => setPreviewChart(null)} className="w-full text-xs text-muted hover:text-white transition-colors py-1">Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
