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
  }, [history, dateFilter.mode, dateFilter.range]) as ({ entries?: LongSnapEntry[]; label?: string } & Record<string, unknown>)[];

  // Practice-only history (exclude charting)
  const practiceHistory = useMemo(() => {
    return filteredHistory.filter((s) => !s.label?.startsWith("30 Point Game") && !s.label?.startsWith("Balls & Strikes"));
  }, [filteredHistory]);

  const displayStats = useMemo(() => {
    // Always compute from practice-only sessions
    return computeFilteredSnapStats(athletes, practiceHistory);
  }, [practiceHistory, athletes]);

  const [snapTab, setSnapTab] = useState<"long" | "short">("long");

  // Long snap (PUNT) totals
  const longTotals = athletes.reduce(
    (acc, a) => {
      const s = displayStats[a.name]?.byType?.PUNT;
      if (!s) return acc;
      return { att: acc.att + s.att, onTarget: acc.onTarget + s.onTarget, totalTime: acc.totalTime + s.totalTime, criticals: acc.criticals + (s.criticals || 0) };
    },
    { att: 0, onTarget: 0, totalTime: 0, criticals: 0 }
  );

  // Laces scoring: Good=1, 1/4 Out=0.5, 1/4 In=0.5, Back=0
  const lacesScore = (val?: string): number | null => {
    if (!val) return null;
    if (val === "Good") return 1;
    if (val === "1/4 Out" || val === "1/4 In") return 0.5;
    if (val === "Back") return 0;
    return null;
  };

  // Compute per-athlete laces stats from practice history
  const lacesStats = useMemo(() => {
    const result: Record<string, { total: number; att: number }> = {};
    practiceHistory.forEach((session) => {
      const snaps = (session.entries ?? []) as LongSnapEntry[];
      snaps.forEach((s) => {
        if (s.snapType !== "FG" && s.snapType !== "PAT") return;
        const score = lacesScore(s.laces);
        if (score === null) return;
        if (!result[s.athlete]) result[s.athlete] = { total: 0, att: 0 };
        result[s.athlete].total += score;
        result[s.athlete].att += 1;
      });
    });
    return result;
  }, [practiceHistory]);

  const totalLaces = Object.values(lacesStats).reduce((acc, v) => ({ total: acc.total + v.total, att: acc.att + v.att }), { total: 0, att: 0 });

  // Short snap (FG + PAT) totals
  const shortTotals = athletes.reduce(
    (acc, a) => {
      const fg = displayStats[a.name]?.byType?.FG;
      const pat = displayStats[a.name]?.byType?.PAT;
      return {
        att: acc.att + (fg?.att ?? 0) + (pat?.att ?? 0),
        onTarget: acc.onTarget + (fg?.onTarget ?? 0) + (pat?.onTarget ?? 0),
        criticals: acc.criticals + (fg?.criticals ?? 0) + (pat?.criticals ?? 0),
      };
    },
    { att: 0, onTarget: 0, criticals: 0 }
  );

  const activeTotals = snapTab === "long" ? longTotals : shortTotals;
  const avgTime = snapTab === "long" && longTotals.att > 0 ? (longTotals.totalTime / longTotals.att).toFixed(2) : "—";
  const onTargetPct = makePct(activeTotals.att, activeTotals.onTarget);

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <button
          onClick={() => exportLongSnapStats(athletes.map((a) => a.name), history as { date?: string; entries?: LongSnapEntry[] }[])}
          className="px-3 py-1.5 text-xs font-semibold rounded-input border border-border text-slate-300 hover:text-white hover:border-accent/50 hover:bg-accent/10 transition-all"
        >
          Export
        </button>
      </div>

      {/* Long / Short toggle */}
      <div className="flex rounded-input border border-border overflow-hidden w-fit">
        <button onClick={() => setSnapTab("long")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", snapTab === "long" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Long Snap</button>
        <button onClick={() => setSnapTab("short")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", snapTab === "short" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Short Snap</button>
      </div>

      <div className={snapTab === "long" ? "grid grid-cols-3 gap-3" : "grid grid-cols-3 gap-3"}>
        <StatCard label="Strike %" value={onTargetPct} accent glow />
        {snapTab === "long" && <StatCard label="Avg Time" value={longTotals.att > 0 ? `${avgTime}s` : "—"} />}
        {snapTab === "short" && <StatCard label="Laces %" value={totalLaces.att > 0 ? `${Math.round((totalLaces.total / totalLaces.att) * 100)}%` : "—"} />}
        <StatCard label="Total Snaps" value={activeTotals.att || "—"} />
      </div>

      <div className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">By Athlete</p>
        {athletes.length === 0 ? (
          <p className="text-xs text-muted">No athletes added yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Snaps</th>
                <th className="table-header">Strike %</th>
                {snapTab === "long" && <th className="table-header">Avg Time</th>}
                {snapTab === "short" && <th className="table-header">Laces %</th>}
                <th className="table-header">Crit</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = displayStats[a.name];
                if (!s) return null;
                // Get stats for the selected snap type
                const bucket = snapTab === "long" ? s.byType?.PUNT : (() => {
                  const fg = s.byType?.FG;
                  const pat = s.byType?.PAT;
                  if (!fg && !pat) return null;
                  return {
                    att: (fg?.att ?? 0) + (pat?.att ?? 0),
                    onTarget: (fg?.onTarget ?? 0) + (pat?.onTarget ?? 0),
                    totalTime: (fg?.totalTime ?? 0) + (pat?.totalTime ?? 0),
                    criticals: (fg?.criticals ?? 0) + (pat?.criticals ?? 0),
                  };
                })();
                if (!bucket || bucket.att === 0) return null;
                return (
                  <tr key={a.id} className="hover:bg-surface/30">
                    <td className="table-name">{a.name}</td>
                    <td className="table-cell">{bucket.att || "—"}</td>
                    <td className="table-cell make-pct">{makePct(bucket.att, bucket.onTarget)}</td>
                    {snapTab === "long" && (
                    <td className="table-cell text-muted">
                      {bucket.totalTime && bucket.att > 0 ? `${(bucket.totalTime / bucket.att).toFixed(2)}s` : "—"}
                    </td>
                    )}
                    {snapTab === "short" && (() => {
                      const ls = lacesStats[a.name];
                      return <td className="table-cell">{ls && ls.att > 0 ? `${Math.round((ls.total / ls.att) * 100)}%` : "—"}</td>;
                    })()}
                    <td className={`table-cell ${(bucket.criticals || 0) > 0 ? "text-miss font-semibold" : ""}`}>{bucket.criticals || "—"}</td>
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
