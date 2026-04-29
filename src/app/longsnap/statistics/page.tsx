"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useLongSnap } from "@/lib/longSnapContext";
import { makePct, emptyLongSnapStats, processLongSnap } from "@/lib/stats";
import { StatCard } from "@/components/ui/StatCard";
import { SNAP_TYPES } from "@/types";
import type { LongSnapEntry, LongSnapAthleteStats } from "@/types";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportLongSnapStats } from "@/lib/exportStats";

function computeFilteredSnapStats(
  athletes: { id: string; name: string }[],
  history: { entries?: LongSnapEntry[] }[]
): Record<string, LongSnapAthleteStats> {
  let statsMap: Record<string, LongSnapAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a.name] = emptyLongSnapStats(); });
  history.forEach((session) => {
    const snaps = (session.entries ?? []) as LongSnapEntry[];
    snaps.forEach((s) => {
      statsMap = processLongSnap(s, statsMap);
    });
  });
  return statsMap;
}

export default function LongSnapStatisticsPage() {
  const { athletes, stats, history } = useLongSnap();
  const dateFilter = useDateRangeFilter();

  const filteredHistory = useMemo(() => {
    return dateFilter.filterByDate(history as { date?: string; entries?: LongSnapEntry[] }[]);
  }, [history, dateFilter.mode, dateFilter.range]) as { entries?: LongSnapEntry[] }[];

  const displayStats = useMemo(() => {
    if (dateFilter.mode === "all") return stats;
    return computeFilteredSnapStats(athletes, filteredHistory);
  }, [dateFilter.mode, filteredHistory, stats, athletes]);

  const totals = athletes.reduce(
    (acc, a) => {
      const s = displayStats[a.name];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        onTarget: acc.onTarget + s.overall.onTarget,
        totalTime: acc.totalTime + s.overall.totalTime,
      };
    },
    { att: 0, onTarget: 0, totalTime: 0 }
  );

  const avgTime = totals.att > 0 ? (totals.totalTime / totals.att).toFixed(2) : "—";
  const onTargetPct = makePct(totals.att, totals.onTarget);

  const [tab, setTab] = useState<"practice" | "charting">("practice");

  // Charting sessions (30 Point Game + Balls & Strikes)
  const chartingSessions = useMemo(() => {
    return history.filter((s) => s.label?.startsWith("30 Point Game") || s.label?.startsWith("Balls & Strikes"));
  }, [history]);

  const practiceSessions = useMemo(() => {
    return history.filter((s) => !s.label?.startsWith("30 Point Game") && !s.label?.startsWith("Balls & Strikes"));
  }, [history]);

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
      {/* Practice / Charting toggle */}
      <div className="flex rounded-input border border-border overflow-hidden w-fit">
        <button onClick={() => setTab("practice")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", tab === "practice" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Practice</button>
        <button onClick={() => setTab("charting")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", tab === "charting" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Charting</button>
      </div>

      {tab === "charting" && (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Charting History</p>
          {chartingSessions.length === 0 ? (
            <p className="text-sm text-muted">No charting sessions yet. Play a 30 Point Game or Balls & Strikes round.</p>
          ) : (
            <div className="space-y-2">
              {[...chartingSessions].reverse().map((s) => (
                <div key={s.id} className="card-2 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-200">{s.label}</p>
                  <p className="text-[10px] text-muted">{new Date(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "practice" && (<>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <button
          onClick={() => exportLongSnapStats(athletes.map((a) => a.name), history as { date?: string; entries?: LongSnapEntry[] }[])}
          className="px-3 py-1.5 text-xs font-semibold rounded-input border border-border text-slate-300 hover:text-white hover:border-accent/50 hover:bg-accent/10 transition-all"
        >
          Export
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Strike %" value={onTargetPct} accent glow />
        <StatCard label="Avg Time" value={totals.att > 0 ? `${avgTime}s` : "—"} />
        <StatCard label="Total Snaps" value={totals.att || "—"} />
      </div>

      <div className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Season by Snap Type</p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">Type</th>
              <th className="table-header">Snaps</th>
              <th className="table-header">Strike %</th>
              <th className="table-header">Avg Time</th>
              <th className="table-header">Crit</th>
            </tr>
          </thead>
          <tbody>
            {SNAP_TYPES.map((t) => {
              let att = 0, onTarget = 0, totalTime = 0, criticals = 0;
              athletes.forEach((a) => {
                const s = displayStats[a.name]?.byType[t];
                if (s) { att += s.att; onTarget += s.onTarget; totalTime += s.totalTime; criticals += (s.criticals || 0); }
              });
              return (
                <tr key={t} className="hover:bg-surface/30">
                  <td className="table-name">{t}</td>
                  <td className="table-cell">{att || "—"}</td>
                  <td className="table-cell make-pct">{makePct(att, onTarget)}</td>
                  <td className="table-cell text-muted">
                    {att > 0 ? `${(totalTime / att).toFixed(2)}s` : "—"}
                  </td>
                  <td className={`table-cell ${criticals > 0 ? "text-miss font-semibold" : ""}`}>{criticals || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Season by Athlete</p>
        {athletes.length === 0 ? (
          <p className="text-xs text-muted">No athletes added yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Snaps</th>
                <th className="table-header">Strike %</th>
                <th className="table-header">Avg Time</th>
                <th className="table-header">Crit</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = displayStats[a.name];
                if (!s) return null;
                return (
                  <tr key={a.id} className="hover:bg-surface/30">
                    <td className="table-name">{a.name}</td>
                    <td className="table-cell">{s.overall.att || "—"}</td>
                    <td className="table-cell make-pct">{makePct(s.overall.att, s.overall.onTarget)}</td>
                    <td className="table-cell text-muted">
                      {s.overall.att > 0 ? `${(s.overall.totalTime / s.overall.att).toFixed(2)}s` : "—"}
                    </td>
                    <td className={`table-cell ${(s.overall.criticals || 0) > 0 ? "text-miss font-semibold" : ""}`}>{s.overall.criticals || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>)}
    </main>
  );
}
