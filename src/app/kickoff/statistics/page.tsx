"use client";

import { useKickoff } from "@/lib/kickoffContext";
import { StatCard } from "@/components/ui/StatCard";
import { ZoneBarChart } from "@/components/ui/Chart";
import { KICKOFF_ZONES } from "@/types";

export default function KickoffStatisticsPage() {
  const { athletes, stats } = useKickoff();

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        touchbacks: acc.touchbacks + s.overall.touchbacks,
        oob: acc.oob + s.overall.oob,
        totalDist: acc.totalDist + s.overall.totalDist,
        totalHang: acc.totalHang + s.overall.totalHang,
      };
    },
    { att: 0, touchbacks: 0, oob: 0, totalDist: 0, totalHang: 0 }
  );

  const tbRate = totals.att > 0 ? `${Math.round((totals.touchbacks / totals.att) * 100)}%` : "—";
  const avgDist = totals.att > 0 ? (totals.totalDist / totals.att).toFixed(1) : "—";
  const avgHang = totals.att > 0 ? (totals.totalHang / totals.att).toFixed(2) : "—";

  const zoneData = KICKOFF_ZONES.map((z) => ({
    zone: z === "TB" ? "TB" : `Zone ${z}`,
    count: athletes.reduce((acc, a) => acc + (stats[a]?.byZone[z] ?? 0), 0),
  }));

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
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
                const s = stats[a];
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
