"use client";

import React from "react";
import type { KickoffEntry } from "@/types";

interface KickoffSessionSummaryProps {
  kicks: KickoffEntry[];
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function KickoffSessionSummary({
  kicks,
  label,
  onConfirm,
  onCancel,
}: KickoffSessionSummaryProps) {
  const totalDist = kicks.reduce((s, k) => s + k.distance, 0);
  const totalHang = kicks.reduce((s, k) => s + k.hangTime, 0);
  const avgDist = kicks.length > 0 ? (totalDist / kicks.length).toFixed(1) : "—";
  const avgHT = kicks.length > 0 ? (totalHang / kicks.length).toFixed(2) : "—";
  const athletes = [...new Set(kicks.map((k) => k.athlete))];

  const byAthlete = athletes.map((a) => {
    const ak = kicks.filter((k) => k.athlete === a);
    const aDist = ak.reduce((s, k) => s + k.distance, 0);
    return {
      name: a,
      count: ak.length,
      avgDist: (aDist / ak.length).toFixed(1),
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md shadow-accent-lg">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold text-slate-100">Commit Practice</h2>
          <p className="text-sm text-muted mt-0.5">{label}</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-accent">{kicks.length}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Kickoffs</p>
            </div>
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-make">{avgDist}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Avg Dist</p>
            </div>
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-slate-100">{avgHT}s</p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Avg HT</p>
            </div>
          </div>

          <div className="card-2 space-y-1.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              By Athlete
            </p>
            {byAthlete.map((a) => (
              <div key={a.name} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-200">{a.name}</span>
                <span className="text-muted">
                  {a.count} kicks{" "}
                  <span className="text-accent font-semibold">({a.avgDist} avg)</span>
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">
            This will be added to cumulative stats. You can undo once after committing.
          </p>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1">
            Commit {kicks.length} kickoff{kicks.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
