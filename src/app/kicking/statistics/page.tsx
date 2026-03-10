"use client";

import { useState } from "react";
import { useFG } from "@/lib/fgContext";
import { makePct, avgScore } from "@/lib/stats";
import { POSITIONS, DIST_RANGES } from "@/types";
import type { FGPosition, DistRange, AthleteStats } from "@/types";
import clsx from "clsx";

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
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Made</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">%</th>
          {showScore && <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5 whitespace-nowrap">KS<span className="text-[8px] font-normal"> /{maxScore}</span></th>}
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a];
          if (!s) return null;
          const v = getValue(s);
          return (
            <tr key={a} className="hover:bg-surface/30 transition-colors">
              <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{v.made || "—"}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{v.att || "—"}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50 make-pct">{makePct(v.att, v.made)}</td>
              {showScore && <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgScore(v.att, v.score)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">
          {title}
        </p>
        <span
          className={clsx(
            "text-muted text-sm transition-transform",
            open && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>
      {open && children}
    </section>
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
    <main className="p-4 lg:p-6 space-y-4 max-w-5xl overflow-y-auto">
      {/* Overall FG — always visible */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Overall FG</p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">Athlete</th>
              <th className="table-header">Made</th>
              <th className="table-header">Att</th>
              <th className="table-header">%</th>
              <th className="table-header whitespace-nowrap"><span>Kick Score</span><br/><span className="text-[9px] font-normal text-muted">Out of 3</span></th>
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
                  <td className="table-cell">{o.made || "—"}</td>
                  <td className="table-cell">{o.att || "—"}</td>
                  <td className="table-cell make-pct">{makePct(o.att, o.made)}</td>
                  <td className="table-cell">{avgScore(o.att, o.score)}</td>
                  <td className="table-cell">{o.longFG > 0 ? `${o.longFG} yd` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Miss Chart — collapsible */}
      <CollapsibleSection title="Miss Chart">
        <div className="card-2">
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
        </div>
      </CollapsibleSection>

      {/* By Hash / Position — collapsible */}
      <CollapsibleSection title="By Hash / Position">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        </div>
      </CollapsibleSection>

      {/* By Distance — collapsible */}
      <CollapsibleSection title="By Distance">
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
      </CollapsibleSection>

      {/* PAT — collapsible */}
      <CollapsibleSection title="PAT">
        <div className="card-2">
          <StatTable
            athletes={athletes}
            statsMap={stats}
            getValue={(s) => s.pat ?? { att: 0, made: 0, score: 0 }}
            showScore={false}
          />
        </div>
      </CollapsibleSection>
    </main>
  );
}
