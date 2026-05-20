"use client";

import React from "react";
import type { FGKick, LongSnapEntry } from "@/types";
import { makePct } from "@/lib/stats";
import clsx from "clsx";

interface SessionSummaryProps {
  kicks: FGKick[];
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  snapCount?: number;
  snapEntries?: LongSnapEntry[];
}

export function SessionSummary({
  kicks,
  label,
  onConfirm,
  onCancel,
  snapCount = 0,
  snapEntries,
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

          {snapEntries && snapEntries.length > 0 && (() => {
            const snappers = [...new Set(snapEntries.map((s) => s.athlete))];
            return (
              <div className="card-2 space-y-2">
                <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Short Snap Recap</p>
                {snappers.map((name) => {
                  const snaps = snapEntries.filter((s) => s.athlete === name);
                  return (
                    <div key={name}>
                      <p className="text-xs font-bold text-slate-200 mb-1">{name}</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-[10px] text-muted text-left py-0.5 px-1">#</th>
                            <th className="text-[10px] text-muted text-center py-0.5 px-1">Result</th>
                            <th className="text-[10px] text-muted text-center py-0.5 px-1">Laces</th>
                            <th className="text-[10px] text-muted text-center py-0.5 px-1">Spiral</th>
                            <th className="text-[10px] text-muted text-right py-0.5 px-1">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snaps.map((s, i) => (
                            <tr key={i} className="border-t border-border/30">
                              <td className="text-muted py-0.5 px-1">{i + 1}</td>
                              <td className={clsx("text-center py-0.5 px-1 font-bold", s.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>{s.accuracy === "ON_TARGET" ? "Strike" : "Ball"}</td>
                              <td className={clsx("text-center py-0.5 px-1", s.laces === "Good" ? "text-make" : s.laces === "1/4 Turn" ? "text-amber-400" : "text-miss")}>{s.laces === "Good" ? "Perfect" : s.laces || "—"}</td>
                              <td className={clsx("text-center py-0.5 px-1", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : s.spiral === "Bad" ? "Open" : "—"}</td>
                              <td className="text-right py-0.5 px-1 font-bold text-sky-400">{s.score}/3</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted">Will be saved to short snap history</p>
              </div>
            );
          })()}

          {snapCount > 0 && !snapEntries?.length && (
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
