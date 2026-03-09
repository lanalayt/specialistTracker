"use client";

import { useFG } from "@/lib/fgContext";
import { makePct, avgScore } from "@/lib/stats";
import { POSITIONS, DIST_RANGES } from "@/types";
import type { FGPosition, DistRange, AthleteStats } from "@/types";

const POS_LABELS: Record<FGPosition, string> = {
  LH: "Left Hash",
  RH: "Right Hash",
  LM: "Left Middle",
  M: "Middle",
  RM: "Right Middle",
};

const DIST_LABELS: Record<DistRange, string> = {
  "20-29": "20–29 yds",
  "30-39": "30–39 yds",
  "40-49": "40–49 yds",
  "50-60": "50–60 yds",
  "60+": "60+ yds",
};

function StatTable({
  athletes,
  statsMap,
  getValue,
  showScore = true,
  maxScore = 3,
}: {
  athletes: string[];
  statsMap: Record<string, AthleteStats>;
  getValue: (s: AthleteStats) => { att: number; made: number; score: number };
  showScore?: boolean;
  maxScore?: number;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="table-header text-left">Athlete</th>
          <th className="table-header">Att</th>
          <th className="table-header">Made</th>
          <th className="table-header">%</th>
          {showScore && <th className="table-header">Score</th>}
          {showScore && <th className="table-header">AVG /{maxScore}</th>}
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a];
          if (!s) return null;
          const v = getValue(s);
          return (
            <tr key={a} className="hover:bg-surface/30 transition-colors">
              <td className="table-name">{a}</td>
              <td className="table-cell">{v.att || "—"}</td>
              <td className="table-cell">{v.made || "—"}</td>
              <td className="table-cell make-pct">{makePct(v.att, v.made)}</td>
              {showScore && <td className="table-cell">{v.score || "—"}</td>}
              {showScore && <td className="table-cell">{avgScore(v.att, v.score)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function KickingStatisticsPage() {
  const { athletes, stats } = useFG();

  const hasData = athletes.some((a) => stats[a]?.overall.att > 0);

  if (!hasData) {
    return (
      <main className="p-4 lg:p-6 max-w-5xl">
        <p className="text-sm text-muted">No kicking data yet. Commit a practice to see statistics.</p>
      </main>
    );
  }

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-5xl overflow-y-auto">
      {/* Overall FG */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Overall FG</p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">Athlete</th>
              <th className="table-header">Att</th>
              <th className="table-header">Made</th>
              <th className="table-header">%</th>
              <th className="table-header">Score</th>
              <th className="table-header">AVG /3</th>
              <th className="table-header">Long FG</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => {
              const s = stats[a];
              if (!s) return null;
              const o = s.overall;
              return (
                <tr key={a} className="hover:bg-surface/30 transition-colors">
                  <td className="table-name">{a}</td>
                  <td className="table-cell">{o.att || "—"}</td>
                  <td className="table-cell">{o.made || "—"}</td>
                  <td className="table-cell make-pct">{makePct(o.att, o.made)}</td>
                  <td className="table-cell">{o.score || "—"}</td>
                  <td className="table-cell">{avgScore(o.att, o.score)}</td>
                  <td className="table-cell">{o.longFG > 0 ? `${o.longFG} yd` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Miss Chart */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Miss Chart</p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">Athlete</th>
              <th className="table-header">Miss Left</th>
              <th className="table-header">Miss Right</th>
              <th className="table-header">Miss Short</th>
              <th className="table-header">Total</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => {
              const s = stats[a];
              if (!s) return null;
              const total = s.miss.XL + s.miss.XR + s.miss.XS;
              return (
                <tr key={a} className="hover:bg-surface/30 transition-colors">
                  <td className="table-name">{a}</td>
                  <td className="table-cell text-miss">{s.miss.XL || "—"}</td>
                  <td className="table-cell text-miss">{s.miss.XR || "—"}</td>
                  <td className="table-cell text-miss">{s.miss.XS || "—"}</td>
                  <td className="table-cell text-miss font-semibold">{total || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* By Hash / Position */}
      <section>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">By Hash / Position</p>
        {/* LH, RH */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {(["LH", "RH"] as FGPosition[]).map((pos) => (
            <div key={pos} className="card-2">
              <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[pos]}</p>
              <StatTable
                athletes={athletes}
                statsMap={stats}
                getValue={(s) => s.position[pos]}
              />
            </div>
          ))}
        </div>
        {/* LM, M, RM */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["LM", "M", "RM"] as FGPosition[]).map((pos) => (
            <div key={pos} className="card-2">
              <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[pos]}</p>
              <StatTable
                athletes={athletes}
                statsMap={stats}
                getValue={(s) => s.position[pos]}
              />
            </div>
          ))}
        </div>
      </section>

      {/* By Distance */}
      <section>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">By Distance</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {DIST_RANGES.map((range) => {
            const maxScore = range === "50-60" || range === "60+" ? 4 : 3;
            return (
              <div key={range} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{DIST_LABELS[range]}</p>
                <StatTable
                  athletes={athletes}
                  statsMap={stats}
                  getValue={(s) => s.distance[range]}
                  maxScore={maxScore}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* PAT */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">PAT</p>
        <StatTable
          athletes={athletes}
          statsMap={stats}
          getValue={(s) => s.pat ?? { att: 0, made: 0, score: 0 }}
          showScore={false}
        />
      </section>
    </main>
  );
}
