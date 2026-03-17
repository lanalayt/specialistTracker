"use client";

import React, { useState } from "react";
import type { FGKick, FGPosition, FGResult } from "@/types";
import { POSITIONS } from "@/types";
import clsx from "clsx";

const MAX_SCORE = 4;

interface KickEntryCardProps {
  athletes: string[];
  kickCount: number;
  onAdd: (kick: FGKick) => void;
}

export function KickEntryCard({ athletes, kickCount, onAdd }: KickEntryCardProps) {
  const [athlete, setAthlete] = useState<string>(athletes[0] ?? "");
  const [dist, setDist] = useState<string>("35");
  const [pos, setPos] = useState<FGPosition>("M");
  const [result, setResult] = useState<FGResult | null>(null);
  const [score, setScore] = useState<number>(0);
  const [isPAT, setIsPAT] = useState(false);

  const MAKE_BTNS: { r: FGResult; label: string }[] = [
    { r: "YL", label: "← GOOD" },
    { r: "YC", label: "✓ GOOD" },
    { r: "YR", label: "GOOD →" },
  ];

  const MISS_BTNS: { r: FGResult; label: string }[] = [
    { r: "XL", label: "← MISS" },
    { r: "XS", label: "↓ SHORT" },
    { r: "XR", label: "MISS →" },
  ];

  const handleLog = () => {
    if (!athlete || (!isPAT && !dist) || !result) return;
    const kick: FGKick = {
      athleteId: athlete,
      athlete,
      dist: isPAT ? 20 : parseInt(dist) || 0,
      pos,
      result,
      score,
      isPAT: isPAT || undefined,
    };
    onAdd(kick);
    setResult(null);
    setScore(0);
    // athlete, dist, pos remain sticky
  };

  const canLog = !!athlete && (isPAT || !!dist) && !!result;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">
          New Kick
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPAT((v) => !v)}
            className={clsx(
              "text-xs px-2.5 py-1 rounded-pill border font-semibold transition-all",
              isPAT
                ? "bg-accent/20 text-accent border-accent/50"
                : "border-border text-muted hover:text-slate-300"
            )}
          >
            {isPAT ? "PAT ●" : "PAT"}
          </button>
          <span className="text-xs text-muted">#{kickCount + 1}</span>
        </div>
      </div>

      {/* Athlete */}
      <div>
        <p className="label">Athlete</p>
        <div className="flex flex-wrap gap-2">
          {athletes.map((a) => (
            <button
              key={a}
              onClick={() => setAthlete(a)}
              className={clsx(
                "px-3 py-1.5 rounded-input text-sm font-medium transition-all",
                athlete === a
                  ? "bg-accent text-slate-900 font-bold"
                  : "bg-surface-2 text-slate-300 hover:bg-surface-2/80 border border-border"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Distance + Position */}
      <div className="flex gap-4 items-start">
        {!isPAT && (
          <div className="shrink-0">
            <p className="label">Distance (yd)</p>
            <input
              className="input w-20 text-center text-lg font-bold"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="35"
              value={dist}
              onChange={(e) => setDist(e.target.value)}
            />
          </div>
        )}
        <div className="flex-1">
          <p className="label">Position</p>
          <div className="flex gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPos(p)}
                className={clsx(
                  "flex-1 py-2 rounded-input text-xs font-semibold transition-all",
                  pos === p
                    ? "bg-accent/20 text-accent border border-accent/50"
                    : "bg-surface-2 text-muted hover:text-slate-300 border border-border"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result buttons — goal post layout */}
      <div>
        <p className="label">Result</p>
        <div className="space-y-1.5">
          {/* Makes */}
          <div className="grid grid-cols-3 gap-2">
            {MAKE_BTNS.map(({ r, label }) => (
              <button
                key={r}
                onClick={() => setResult(r)}
                className={clsx(
                  "py-3 rounded-input text-xs font-bold transition-all",
                  result === r
                    ? "bg-make text-slate-900 shadow-lg"
                    : "bg-make/10 text-make border border-make/30 hover:bg-make/20"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Misses */}
          <div className="grid grid-cols-3 gap-2">
            {MISS_BTNS.map(({ r, label }) => (
              <button
                key={r}
                onClick={() => setResult(r)}
                className={clsx(
                  "py-3 rounded-input text-xs font-bold transition-all",
                  result === r
                    ? "bg-miss text-white shadow-lg"
                    : "bg-miss/10 text-miss border border-miss/30 hover:bg-miss/20"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Score pills */}
      <div>
        <p className="label">Score</p>
        <div className="flex gap-1.5">
          {Array.from({ length: MAX_SCORE + 1 }, (_, i) => (
            <button
              key={i}
              onClick={() => setScore(i)}
              className={clsx(
                "w-9 h-9 rounded-full text-sm font-bold transition-all",
                score === i
                  ? "bg-accent text-slate-900"
                  : "bg-surface-2 text-muted border border-border hover:border-accent/50"
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      {/* Log button */}
      <button
        onClick={handleLog}
        disabled={!canLog}
        className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        LOG KICK
      </button>
    </div>
  );
}
