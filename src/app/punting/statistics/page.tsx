"use client";

import { usePunt } from "@/lib/puntContext";
import { StatCard } from "@/components/ui/StatCard";

export default function PuntingStatisticsPage() {
  const { athletes, stats } = usePunt();

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        totalYards: acc.totalYards + s.overall.totalYards,
        totalHang: acc.totalHang + s.overall.totalHang,
        long: Math.max(acc.long, s.overall.long),
      };
    },
    { att: 0, totalYards: 0, totalHang: 0, long: 0 }
  );

  const avgYards = totals.att > 0 ? (totals.totalYards / totals.att).toFixed(1) : "—";
  const avgHang = totals.att > 0 ? (totals.totalHang / totals.att).toFixed(2) : "—";

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Avg Yards" value={avgYards} accent glow />
        <StatCard label="Avg Hang" value={totals.att > 0 ? `${avgHang}s` : "—"} />
        <StatCard label="Long Punt" value={totals.long > 0 ? `${totals.long} yd` : "—"} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Season by Athlete</p>
        {athletes.length === 0 ? (
          <p className="text-xs text-muted">No athletes added yet.</p>
        ) : athletes.map((a) => {
          const s = stats[a];
          if (!s) return null;
          const avgYds = s.overall.att > 0 ? (s.overall.totalYards / s.overall.att).toFixed(1) : "—";
          const avgDA = s.overall.att > 0 ? (s.overall.totalDirectionalAccuracy / s.overall.att).toFixed(2) : "—";
          const critDirs = s.overall.criticalDirections ?? 0;
          const hasPooch = (s.overall.poochYardLineAtt ?? 0) > 0;
          const avgPoochYL = hasPooch ? (s.overall.poochYardLineTotal / s.overall.poochYardLineAtt).toFixed(1) : null;
          return (
            <div key={a} className="card-2 px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-200">{a}</span>
                <span className="text-xs text-muted">{s.overall.att} punts</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-base font-bold text-accent">{avgYds}</p>
                  <p className="text-[10px] text-muted">Avg Yds</p>
                </div>
                <div>
                  <p className="text-base font-bold text-slate-100">{avgDA}</p>
                  <p className="text-[10px] text-muted">Avg DA</p>
                </div>
                <div>
                  <p className={`text-base font-bold ${critDirs > 0 ? "text-miss" : "text-slate-100"}`}>{critDirs}</p>
                  <p className="text-[10px] text-muted">Critical</p>
                </div>
              </div>
              {avgPoochYL && (
                <div className="mt-1.5 text-center">
                  <span className="text-[10px] text-muted">Avg Pooch YL: </span>
                  <span className="text-[10px] text-accent font-semibold">{avgPoochYL}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
