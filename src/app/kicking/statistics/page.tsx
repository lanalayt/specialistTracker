"use client";

import { useFG } from "@/lib/fgContext";
import { makePct } from "@/lib/stats";
import { StatCard } from "@/components/ui/StatCard";

export default function KickingStatisticsPage() {
  const { athletes, stats } = useFG();

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        made: acc.made + s.overall.made,
        longFG: Math.max(acc.longFG, s.overall.longFG),
      };
    },
    { att: 0, made: 0, longFG: 0 }
  );

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Season Make%" value={makePct(totals.att, totals.made)} accent glow />
        <StatCard label="Total Attempts" value={totals.att || "—"} />
        <StatCard label="Long FG" value={totals.longFG > 0 ? `${totals.longFG} yd` : "—"} />
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
                <th className="table-header">Att</th>
                <th className="table-header">Made</th>
                <th className="table-header">Make%</th>
                <th className="table-header">Long FG</th>
                <th className="table-header">Miss L</th>
                <th className="table-header">Miss R</th>
                <th className="table-header">Short</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = stats[a];
                if (!s) return null;
                return (
                  <tr key={a} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a}</td>
                    <td className="table-cell">{s.overall.att || "—"}</td>
                    <td className="table-cell">{s.overall.made || "—"}</td>
                    <td className="table-cell make-pct">{makePct(s.overall.att, s.overall.made)}</td>
                    <td className="table-cell">{s.overall.longFG > 0 ? `${s.overall.longFG} yd` : "—"}</td>
                    <td className="table-cell text-miss">{s.miss.XL || "—"}</td>
                    <td className="table-cell text-miss">{s.miss.XR || "—"}</td>
                    <td className="table-cell text-miss">{s.miss.XS || "—"}</td>
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
