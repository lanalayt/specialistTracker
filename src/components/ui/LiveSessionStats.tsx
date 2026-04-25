"use client";

import React from "react";
import type { FGKick, FGPosition, DistRange } from "@/types";
import { POSITIONS, DIST_RANGES } from "@/types";
import { getDistRange } from "@/lib/stats";
import { FGHeatGrid } from "./FGHeatGrid";
import { GoalPostViz } from "./GoalPostViz";

interface LiveFGStatsProps {
  kicks: FGKick[];
}

export function LiveFGStats({ kicks }: LiveFGStatsProps) {
  const makes = kicks.filter((k) => k.result.startsWith("Y") && !k.isPAT).length;

  // Build heatmap — only regular FG kicks, not PATs
  const grid = {} as Record<FGPosition, Record<DistRange, { att: number; made: number }>>;
  POSITIONS.forEach((pos) => {
    grid[pos] = {} as Record<DistRange, { att: number; made: number }>;
    DIST_RANGES.forEach((dr) => {
      grid[pos][dr] = { att: 0, made: 0 };
    });
  });
  kicks.filter((k) => !k.isPAT).forEach((k) => {
    const dr = getDistRange(k.dist);
    if (dr && POSITIONS.includes(k.pos)) {
      grid[k.pos][dr].att++;
      if (k.result.startsWith("Y")) grid[k.pos][dr].made++;
    }
  });

  const missL = kicks.filter((k) => k.result === "XL").length;
  const missR = kicks.filter((k) => k.result === "XR").length;
  const missS = kicks.filter((k) => k.result === "XS").length;
  const missX = kicks.filter((k) => k.result === "X").length;

  // PAT summary
  const pats = kicks.filter((k) => k.isPAT);
  const patMakes = pats.filter((k) => k.result.startsWith("Y")).length;

  // Per-athlete make stats (non-PAT)
  const fgKicks = kicks.filter((k) => !k.isPAT);
  const athleteNames = [...new Set(fgKicks.map((k) => k.athlete))];
  const athleteStats = athleteNames.map((name) => {
    const ak = fgKicks.filter((k) => k.athlete === name);
    const m = ak.filter((k) => k.result.startsWith("Y")).length;
    const pct = ak.length > 0 ? Math.round((m / ak.length) * 100) : 0;
    return { name, made: m, att: ak.length, pct };
  });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {athleteStats.map((a) => (
          <div key={a.name} className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-200 truncate">{a.name}</span>
            <span className="text-xs text-muted whitespace-nowrap">
              {a.made}/{a.att}{" "}
              <span className="font-semibold text-accent">{a.pct}%</span>
            </span>
          </div>
        ))}
        {pats.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
            <span className="text-xs font-medium text-slate-400">PAT</span>
            <span className="text-xs text-muted whitespace-nowrap">
              {patMakes}/{pats.length}{" "}
              <span className="font-semibold text-accent">{pats.length > 0 ? Math.round((patMakes / pats.length) * 100) : 0}%</span>
            </span>
          </div>
        )}
      </div>
      <FGHeatGrid grid={grid} />
      <GoalPostViz missL={missL} missR={missR} missS={missS} missX={missX} makes={makes} />
    </div>
  );
}
