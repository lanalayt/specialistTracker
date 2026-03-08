"use client";

import React from "react";
import type { LongSnapEntry, SnapType, SnapBenchmark } from "@/types";
import { SNAP_TYPES } from "@/types";
import { getSnapBenchmark } from "@/lib/stats";
import clsx from "clsx";

const BENCHMARKS: Record<SnapType, { excellent: number; good: number; maxDisplay: number }> = {
  PUNT: { excellent: 0.80, good: 0.95, maxDisplay: 1.5 },
  FG: { excellent: 0.38, good: 0.45, maxDisplay: 0.70 },
  PAT: { excellent: 0.38, good: 0.45, maxDisplay: 0.70 },
};

const BM_COLOR: Record<SnapBenchmark, string> = {
  excellent: "bg-make",
  good: "bg-accent",
  needsWork: "bg-miss",
};

const BM_TEXT: Record<SnapBenchmark, string> = {
  excellent: "text-make",
  good: "text-accent",
  needsWork: "text-miss",
};

interface SnapTimeBarsProps {
  entries: LongSnapEntry[];
  athletes: string[];
}

export function SnapTimeBars({ entries, athletes }: SnapTimeBarsProps) {
  if (entries.length === 0) {
    return (
      <div className="card">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
          Snap Time Benchmarks
        </p>
        <div className="h-16 flex items-center justify-center text-xs text-muted">
          No snaps logged yet
        </div>
      </div>
    );
  }

  const athleteRows = athletes
    .map((a) => {
      const aSnaps = entries.filter((e) => e.athlete === a);
      if (aSnaps.length === 0) return null;

      const byType = SNAP_TYPES.map((t) => {
        const tSnaps = aSnaps.filter((e) => e.snapType === t);
        if (tSnaps.length === 0) return null;
        const avgTime = tSnaps.reduce((acc, e) => acc + e.time, 0) / tSnaps.length;
        const bm = getSnapBenchmark(t, avgTime);
        const bench = BENCHMARKS[t];
        const widthPct = Math.min((avgTime / bench.maxDisplay) * 100, 100);
        const excPct = (bench.excellent / bench.maxDisplay) * 100;
        const goodPct = ((bench.good - bench.excellent) / bench.maxDisplay) * 100;
        return { type: t, avgTime, bm, widthPct, excPct, goodPct };
      }).filter(Boolean) as NonNullable<ReturnType<typeof SNAP_TYPES.map>[0]>[];

      return { athlete: a, byType };
    })
    .filter(Boolean) as { athlete: string; byType: { type: SnapType; avgTime: number; bm: SnapBenchmark; widthPct: number; excPct: number; goodPct: number }[] }[];

  return (
    <div className="card">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
        Snap Time Benchmarks
      </p>
      <div className="space-y-5">
        {athleteRows.map((ar) => (
          <div key={ar.athlete}>
            <p className="text-sm font-semibold text-slate-200 mb-2">{ar.athlete}</p>
            <div className="space-y-2">
              {ar.byType.map((bt) => (
                <div key={bt.type}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted font-medium">{bt.type}</span>
                    <span className={clsx("font-bold", BM_TEXT[bt.bm])}>
                      {bt.avgTime.toFixed(3)}s
                    </span>
                  </div>
                  <div className="relative h-5 bg-surface-2 rounded-full overflow-hidden">
                    {/* Benchmark bands */}
                    <div
                      className="absolute inset-y-0 left-0 bg-make/20 rounded-l-full"
                      style={{ width: `${bt.excPct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 bg-accent/10"
                      style={{ left: `${bt.excPct}%`, width: `${bt.goodPct}%` }}
                    />
                    {/* Time bar */}
                    <div
                      className={clsx(
                        "absolute inset-y-0 left-0 rounded-full transition-all",
                        BM_COLOR[bt.bm]
                      )}
                      style={{ width: `${bt.widthPct}%`, opacity: 0.65 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
