"use client";

import React from "react";
import { POSITIONS, DIST_RANGES } from "@/types";
import type { FGPosition, DistRange } from "@/types";
import clsx from "clsx";

interface CellData {
  att: number;
  made: number;
}

interface FGHeatGridProps {
  grid: Record<FGPosition, Record<DistRange, CellData>>;
}

function cellStyle(att: number, made: number): string {
  if (att === 0) return "bg-surface-2/30 text-muted/30";
  const pct = made / att;
  if (pct >= 0.8) return "bg-[#00d4a0]/70 text-slate-900 font-extrabold";
  if (pct >= 0.6) return "bg-[#00d4a0]/40 text-slate-100 font-bold";
  if (pct >= 0.4) return "bg-yellow-500/40 text-slate-100 font-bold";
  if (pct >= 0.2) return "bg-orange-500/50 text-slate-100 font-bold";
  return "bg-red-500/60 text-white font-bold";
}

export function FGHeatGrid({ grid }: FGHeatGridProps) {
  const hasData = POSITIONS.some((pos) =>
    DIST_RANGES.some((dr) => grid[pos]?.[dr]?.att > 0)
  );

  return (
    <div className="card">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        Make% by Position &amp; Distance
      </p>
      {!hasData ? (
        <div className="h-16 flex items-center justify-center text-xs text-muted">
          Log kicks to see heatmap
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-muted pb-2 pr-2 font-medium w-10">Pos</th>
                  {DIST_RANGES.map((dr) => (
                    <th key={dr} className="text-center text-muted pb-2 font-medium px-1">
                      {dr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((pos) => (
                  <tr key={pos}>
                    <td className="text-muted pr-2 py-0.5 font-semibold">{pos}</td>
                    {DIST_RANGES.map((dr) => {
                      const cell = grid[pos]?.[dr] ?? { att: 0, made: 0 };
                      return (
                        <td key={dr} className="py-0.5 px-0.5">
                          <div
                            className={clsx(
                              "rounded text-center py-1.5 min-w-[42px] text-xs",
                              cellStyle(cell.att, cell.made)
                            )}
                          >
                            {cell.att === 0
                              ? "—"
                              : `${Math.round((cell.made / cell.att) * 100)}%`}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] text-muted">0%</span>
            <div
              className="flex-1 h-2 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, #ef4444, #f59e0b, #00d4a0)",
              }}
            />
            <span className="text-[10px] text-muted">100%</span>
          </div>
        </>
      )}
    </div>
  );
}
