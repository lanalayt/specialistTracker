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

      {/* Long / Short toggle */}
      <div className="flex rounded-input border border-border overflow-hidden w-fit">
        <button onClick={() => setSnapTab("long")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", snapTab === "long" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Long Snap</button>
        <button onClick={() => setSnapTab("short")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", snapTab === "short" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Short Snap</button>
      </div>

      <div className={snapTab === "long" ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
        <StatCard label="Strike %" value={onTargetPct} accent glow />
        {snapTab === "long" && <StatCard label="Avg Time" value={longTotals.att > 0 ? `${avgTime}s` : "—"} />}
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
                    <td className={`table-cell ${(bucket.criticals || 0) > 0 ? "text-miss font-semibold" : ""}`}>{bucket.criticals || "—"}</td>
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
