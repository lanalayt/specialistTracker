"use client";

import React from "react";
import type { FGKick, FGPosition, DistRange } from "@/types";
import { POSITIONS, DIST_RANGES } from "@/types";
import { getDistRange } from "@/lib/stats";
import { DonutChart } from "./Chart";
import { FGHeatGrid } from "./FGHeatGrid";
import { GoalPostViz } from "./GoalPostViz";

interface LiveFGStatsProps {
  kicks: FGKick[];
}

export function LiveFGStats({ kicks }: LiveFGStatsProps) {
  const makes = kicks.filter((k) => k.result.startsWith("Y")).length;
  const total = kicks.filter((k) => !k.isPAT).length;

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

  // PAT summary
  const pats = kicks.filter((k) => k.isPAT);
  const patMakes = pats.filter((k) => k.result.startsWith("Y")).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-start">
        <DonutChart made={makes} total={total} label="Session Make%" />
        {pats.length > 0 && (
          <DonutChart made={patMakes} total={pats.length} label="PAT%" />
        )}
      </div>
      <FGHeatGrid grid={grid} />
      <GoalPostViz missL={missL} missR={missR} missS={missS} makes={makes} />
    </div>
  );
}
