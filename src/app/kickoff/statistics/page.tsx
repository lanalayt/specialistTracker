"use client";

import { useMemo } from "react";
import { useKickoff } from "@/lib/kickoffContext";
import { StatCard } from "@/components/ui/StatCard";
import { ZoneBarChart } from "@/components/ui/Chart";
import { KICKOFF_ZONES } from "@/types";
import type { KickoffEntry, KickoffAthleteStats } from "@/types";
import { emptyKickoffStats, processKickoff } from "@/lib/stats";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportKickoffStats } from "@/lib/exportStats";

function computeFilteredKOStats(
  athletes: string[],
  history: { entries?: KickoffEntry[] }[]
): Record<string, KickoffAthleteStats> {
  let statsMap: Record<string, KickoffAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a] = emptyKickoffStats(); });
  history.forEach((session) => {
    const entries = (session.entries ?? []) as KickoffEntry[];
    entries.forEach((e) => {
      statsMap = processKickoff(e, statsMap);
    });
  });
  return statsMap;
}

export default function KickoffStatisticsPage() {
  const { athletes, stats, history } = useKickoff();
  const dateFilter = useDateRangeFilter();

  const filteredHistory = useMemo(() => {
    return dateFilter.filterByDate(history as { date?: string; entries?: KickoffEntry[] }[]);
  }, [history, dateFilter.mode, dateFilter.range]) as { entries?: KickoffEntry[] }[];

  const displayStats = useMemo(() => {
    if (dateFilter.mode === "all") return stats;
    return computeFilteredKOStats(athletes, filteredHistory);
  }, [dateFilter.mode, filteredHistory, stats, athletes]);

  const totals = athletes.reduce(
    (acc, a) => {
      const s = displayStats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        touchbacks: acc.touchbacks + s.overall.touchbacks,
        oob: acc.oob + s.overall.oob,
        totalDist: acc.totalDist + s.overall.totalDist,
        distAtt: acc.distAtt + (s.overall.distAtt ?? s.overall.att),
        totalHang: acc.totalHang + s.overall.totalHang,
        hangAtt: acc.hangAtt + (s.overall.hangAtt ?? s.overall.att),
      };
    },
    { att: 0, touchbacks: 0, oob: 0, totalDist: 0, distAtt: 0, totalHang: 0, hangAtt: 0 }
  );

  const tbRate = totals.att > 0 ? `${Math.round((totals.touchbacks / totals.att) * 100)}%` : "—";
  const avgDist = totals.distAtt > 0 ? (totals.totalDist / totals.distAtt).toFixed(1) : "—";
  const avgHang = totals.hangAtt > 0 ? (totals.totalHang / totals.hangAtt).toFixed(2) : "—";

  const zoneData = KICKOFF_ZONES.map((z) => ({
    zone: z === "TB" ? "TB" : `Zone ${z}`,
    count: athletes.reduce((acc, a) => acc + (displayStats[a]?.byZone[z] ?? 0), 0),
  }));

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <button
          onClick={() => exportKickoffStats(athletes, history as { date?: string; entries?: KickoffEntry[] }[])}
          className="px-3 py-1.5 text-xs font-semibold rounded-input border border-border text-slate-300 hover:text-white hover:border-accent/50 hover:bg-accent/10 transition-all"
        >
          Export
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="TB Rate" value={tbRate} accent glow />
        <StatCard label="Avg Dist" value={avgDist ? `${avgDist} yd` : "—"} />
        <StatCard label="Avg Hang" value={avgHang ? `${avgHang}s` : "—"} />
      </div>

      <ZoneBarChart data={zoneData} />

      <div className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">By Athlete</p>
        {athletes.length === 0 ? (
          <p className="text-xs text-muted">No data yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">KOs</th>
                <th className="table-header">TB%</th>
                <th className="table-header">OOB</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = displayStats[a];
                if (!s) return null;
                const tbPct = s.overall.att > 0 ? `${Math.round((s.overall.touchbacks / s.overall.att) * 100)}%` : "—";
                return (
                  <tr key={a} className="hover:bg-surface/30">
                    <td className="table-name">{a}</td>
                    <td className="table-cell">{s.overall.att || "—"}</td>
                    <td className="table-cell make-pct">{tbPct}</td>
                    <td className="table-cell text-miss">{s.overall.oob || "—"}</td>
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
