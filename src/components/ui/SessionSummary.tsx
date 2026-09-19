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
  weather?: string;
  onWeatherChange?: (value: string) => void;
  onLogSnap?: () => void;
}

export function SessionSummary({
  kicks,
  label,
  onConfirm,
  onCancel,
  snapCount = 0,
  snapEntries,
  weather,
  onWeatherChange,
  onLogSnap,
}: SessionSummaryProps) {
  const fgKicks = kicks.filter((k) => !k.isPAT);
  const patKicks = kicks.filter((k) => k.isPAT);
  const hasFG = fgKicks.length > 0;
  const hasPAT = patKicks.length > 0;
  const hasBoth = hasFG && hasPAT;
  const fgMakes = fgKicks.filter((k) => k.result.startsWith("Y")).length;
  const patMakes = patKicks.filter((k) => k.result.startsWith("Y")).length;
  const athletes = [...new Set(kicks.map((k) => k.athlete))];
  const longFG = Math.max(
    0,
    ...fgKicks.filter((k) => k.result.startsWith("Y")).map((k) => k.dist)
  );

  // Per-athlete summary, FG and PAT kept separate
  const byAthlete = athletes.map((a) => {
    const afg = fgKicks.filter((k) => k.athlete === a);
    const apat = patKicks.filter((k) => k.athlete === a);
    return {
      name: a,
      fgAtt: afg.length,
      fgMade: afg.filter((k) => k.result.startsWith("Y")).length,
      patAtt: apat.length,
      patMade: apat.filter((k) => k.result.startsWith("Y")).length,
    };
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
          {onWeatherChange && (
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Weather</label>
              <input
                type="text"
                value={weather ?? ""}
                onChange={(e) => onWeatherChange(e.target.value)}
                placeholder="e.g. 72°F, Sunny, Wind 10mph SW"
                className="mt-1 w-full bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
              />
            </div>
          )}
          {/* Overview — FG and PAT kept separate */}
          {hasFG && (
            <div>
              {hasBoth && (
                <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-1.5">
                  Field Goals
                </p>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="card-2 text-center">
                  <p className="text-2xl font-extrabold text-accent">{fgKicks.length}</p>
                  <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">
                    Kicks
                  </p>
                </div>
                <div className="card-2 text-center">
                  <p className="text-2xl font-extrabold text-make">
                    {makePct(fgKicks.length, fgMakes)}
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
            </div>
          )}
          {hasPAT && (
            <div>
              {hasBoth && (
                <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider mb-1.5">
                  PATs
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="card-2 text-center">
                  <p className="text-2xl font-extrabold text-sky-400">{patKicks.length}</p>
                  <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">
                    Kicks
                  </p>
                </div>
                <div className="card-2 text-center">
                  <p className="text-2xl font-extrabold text-make">
                    {makePct(patKicks.length, patMakes)}
                  </p>
                  <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">
                    Make%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Per-athlete, FG and PAT kept separate */}
          <div className="card-2 space-y-1.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              By Athlete
            </p>
            {byAthlete.map((a) => {
              const rowHasFG = a.fgAtt > 0;
              const rowHasPAT = a.patAtt > 0;
              return (
                <div
                  key={a.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium text-slate-200">{a.name}</span>
                  <span className="text-muted">
                    {rowHasFG && (
                      <span>
                        {hasBoth && <span className="text-accent/70 text-[10px] font-bold uppercase mr-1">FG</span>}
                        {a.fgMade}/{a.fgAtt}{" "}
                        <span className="text-accent font-semibold">
                          ({makePct(a.fgAtt, a.fgMade)})
                        </span>
                      </span>
                    )}
                    {rowHasFG && rowHasPAT && <span className="mx-1.5 text-border">·</span>}
                    {rowHasPAT && (
                      <span>
                        {hasBoth && <span className="text-sky-400/70 text-[10px] font-bold uppercase mr-1">PAT</span>}
                        {a.patMade}/{a.patAtt}{" "}
                        <span className="text-sky-400 font-semibold">
                          ({makePct(a.patAtt, a.patMade)})
                        </span>
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {snapEntries && snapEntries.length > 0 && (() => {
            const totalScore = snapEntries.reduce((s, e) => s + (e.score ?? 0), 0);
            const maxScore = snapEntries.length * 3;
            const pct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
            return (
              <div className="card-2 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Short Snap</p>
                  <p className="text-[10px] text-muted">Will be saved to snap history</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-200">{snapEntries.length} snap{snapEntries.length !== 1 ? "s" : ""}</p>
                  <p className="text-sm font-bold text-sky-400">{totalScore}/{maxScore} <span className="text-xs text-slate-300">{pct}%</span></p>
                </div>
              </div>
            );
          })()}

          {snapCount > 0 && !snapEntries?.length && (
            <div className="flex items-center gap-2 p-2.5 rounded-input bg-sky-500/10 border border-sky-500/30">
              <span className="text-xs text-sky-400 font-semibold">{snapCount} snap{snapCount !== 1 ? "s" : ""} logged</span>
              <span className="text-[10px] text-muted">— will be saved to snap history</span>
            </div>
          )}

          {onLogSnap && (
            <button
              onClick={onLogSnap}
              className="w-full py-2.5 rounded-input bg-accent/15 border border-accent text-accent hover:bg-accent/25 active:scale-[0.99] text-sm font-bold transition-all"
            >
              + Log Snaps
            </button>
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
