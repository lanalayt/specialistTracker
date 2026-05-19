"use client";

import React from "react";
import type { FGKick } from "@/types";
import { makePct } from "@/lib/stats";

interface SessionSummaryProps {
  kicks: FGKick[];
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  snapCount?: number;
}

export function SessionSummary({
  kicks,
  label,
  onConfirm,
  onCancel,
  snapCount = 0,
}: SessionSummaryProps) {
  const makes = kicks.filter((k) => k.result.startsWith("Y")).length;
  const misses = kicks.length - makes;
  const athletes = [...new Set(kicks.map((k) => k.athlete))];
  const longFG = Math.max(
    0,
    ...kicks.filter((k) => k.result.startsWith("Y") && !k.isPAT).map((k) => k.dist)
  );

  // Per-athlete summary
  const byAthlete = athletes.map((a) => {
    const ak = kicks.filter((k) => k.athlete === a);
    const am = ak.filter((k) => k.result.startsWith("Y")).length;
    return { name: a, att: ak.length, made: am };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md shadow-accent-lg">
        {/* Header */}
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold text-slate-100">Commit Practice</h2>
          <p className="text-sm text-muted mt-0.5">{label}</p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Overview */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-accent">{kicks.length}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">
                Kicks
              </p>
            </div>
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-make">
                {makePct(kicks.length, makes)}
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">
                Make%
              </p>
            </div>
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-slate-100">
                {longFG > 0 ? `${longFG}` : "—"}
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">
                Long FG
              </p>
            </div>
          </div>

          {/* Per-athlete */}
          <div className="card-2 space-y-1.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              By Athlete
            </p>
            {byAthlete.map((a) => (
              <div
                key={a.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-medium text-slate-200">{a.name}</span>
                <span className="text-muted">
                  {a.made}/{a.att}{" "}
                  <span className="text-accent font-semibold">
                    ({makePct(a.att, a.made)})
                  </span>
                </span>
              </div>
            ))}
          </div>

          {snapCount > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-input bg-sky-500/10 border border-sky-500/30">
              <span className="text-xs text-sky-400 font-semibold">{snapCount} snap{snapCount !== 1 ? "s" : ""} logged</span>
              <span className="text-[10px] text-muted">— will be saved to snap history</span>
            </div>
          )}

          <p className="text-xs text-muted">
            This will be added to cumulative stats. You can undo once after committing.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1">
            Commit {kicks.length} kick{kicks.length !== 1 ? "s" : ""}{snapCount > 0 ? ` + ${snapCount} snap${snapCount !== 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
