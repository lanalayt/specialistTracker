"use client";

import React from "react";
import type { PuntEntry } from "@/types";

interface PuntSessionSummaryProps {
  punts: PuntEntry[];
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PuntSessionSummary({
  punts,
  label,
  onConfirm,
  onCancel,
}: PuntSessionSummaryProps) {
  // Only count punts with actual yardage for distance averages
  const ydsEntries = punts.filter((p) => p.yards > 0);
  const htEntries = punts.filter((p) => p.hangTime > 0);
  const totalYards = ydsEntries.reduce((s, p) => s + p.yards, 0);
  const totalHang = htEntries.reduce((s, p) => s + p.hangTime, 0);
  const avgYds = ydsEntries.length > 0 ? (totalYards / ydsEntries.length).toFixed(1) : "—";
  const avgHT = htEntries.length > 0 ? (totalHang / htEntries.length).toFixed(2) : "—";
  const touchbacks = punts.filter((p) => p.touchback || p.landingZones?.includes("TB")).length;
  const fairCatches = punts.filter((p) => p.fairCatch || p.landingZones?.includes("fairCatch")).length;
  const athletes = [...new Set(punts.map((p) => p.athlete))];

  const byAthlete = athletes.map((a) => {
    const ap = punts.filter((p) => p.athlete === a);
    const apYds = ap.filter((p) => p.yards > 0);
    const apHt = ap.filter((p) => p.hangTime > 0);
    const aYds = apYds.reduce((s, p) => s + p.yards, 0);
    const aHt = apHt.reduce((s, p) => s + p.hangTime, 0);
    return {
      name: a,
      count: ap.length,
      avgYds: apYds.length > 0 ? (aYds / apYds.length).toFixed(1) : "—",
      avgHT: apHt.length > 0 ? (aHt / apHt.length).toFixed(2) : "—",
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
              <p className="text-2xl font-extrabold text-accent">{punts.length}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Punts</p>
            </div>
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-make">{avgYds}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Avg Yds</p>
            </div>
            <div className="card-2 text-center">
              <p className="text-2xl font-extrabold text-slate-100">{avgHT}s</p>
              <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Avg HT</p>
            </div>
          </div>
          {(touchbacks > 0 || fairCatches > 0) && (
            <div className="flex gap-3">
              {touchbacks > 0 && (
                <div className="card-2 text-center flex-1">
                  <p className="text-xl font-extrabold text-miss">{touchbacks}</p>
                  <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Touchbacks</p>
                </div>
              )}
              {fairCatches > 0 && (
                <div className="card-2 text-center flex-1">
                  <p className="text-xl font-extrabold text-slate-300">{fairCatches}</p>
                  <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">Fair Catches</p>
                </div>
              )}
            </div>
          )}

          <div className="card-2 space-y-1.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              By Athlete
            </p>
            {byAthlete.map((a) => (
              <div key={a.name} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-200">{a.name}</span>
                <span className="text-muted">
                  {a.count} punts ·{" "}
                  <span className="text-accent font-semibold">{a.avgYds} avg</span>
                  {a.avgHT !== "—" && <span className="text-slate-300"> · {a.avgHT}s</span>}
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
            Commit {punts.length} punt{punts.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
