"use client";

import { useMemo } from "react";
import { useLongSnap } from "@/lib/longSnapContext";
import { makePct, emptyLongSnapStats, processLongSnap } from "@/lib/stats";
import { StatCard } from "@/components/ui/StatCard";
import { SNAP_TYPES } from "@/types";
import type { LongSnapEntry, LongSnapAthleteStats } from "@/types";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportLongSnapStats } from "@/lib/exportStats";

function computeFilteredSnapStats(
  athletes: string[],
  history: { entries?: LongSnapEntry[] }[]
): Record<string, LongSnapAthleteStats> {
  let statsMap: Record<string, LongSnapAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a] = emptyLongSnapStats(); });
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
      const s = displayStats[a];
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

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <button
          onClick={() => exportLongSnapStats(athletes, history as { date?: string; entries?: LongSnapEntry[] }[])}
          className="px-3 py-1.5 text-xs font-semibold rounded-input border border-border text-slate-300 hover:text-white hover:border-accent/50 hover:bg-accent/10 transition-all"
        >
          Export
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="On-Target%" value={onTargetPct} accent glow />
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
              <th className="table-header">On Target%</th>
              <th className="table-header">Avg Time</th>
            </tr>
          </thead>
          <tbody>
            {SNAP_TYPES.map((t) => {
              let att = 0, onTarget = 0, totalTime = 0;
              athletes.forEach((a) => {
                const s = displayStats[a]?.byType[t];
                if (s) { att += s.att; onTarget += s.onTarget; totalTime += s.totalTime; }
              });
              return (
                <tr key={t} className="hover:bg-surface/30">
                  <td className="table-name">{t}</td>
                  <td className="table-cell">{att || "—"}</td>
                  <td className="table-cell make-pct">{makePct(att, onTarget)}</td>
                  <td className="table-cell text-muted">
                    {att > 0 ? `${(totalTime / att).toFixed(3)}s` : "—"}
                  </td>
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
                <th className="table-header">On Target%</th>
                <th className="table-header">Avg Time</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = displayStats[a];
                if (!s) return null;
                return (
                  <tr key={a} className="hover:bg-surface/30">
                    <td className="table-name">{a}</td>
                    <td className="table-cell">{s.overall.att || "—"}</td>
                    <td className="table-cell make-pct">{makePct(s.overall.att, s.overall.onTarget)}</td>
                    <td className="table-cell text-muted">
                      {s.overall.att > 0 ? `${(s.overall.totalTime / s.overall.att).toFixed(3)}s` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
