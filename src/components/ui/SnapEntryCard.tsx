"use client";

import React, { useState } from "react";
import type { LongSnapEntry, SnapType, SnapAccuracy, SnapBenchmark } from "@/types";
import { SNAP_TYPES } from "@/types";
import { getSnapBenchmark } from "@/lib/stats";
import clsx from "clsx";

const ACC_OPTIONS: { value: SnapAccuracy; label: string; icon: string }[] = [
  { value: "ON_TARGET", label: "On Target", icon: "✓" },
  { value: "HIGH", label: "High", icon: "↑" },
  { value: "LOW", label: "Low", icon: "↓" },
  { value: "LEFT", label: "Left", icon: "←" },
  { value: "RIGHT", label: "Right", icon: "→" },
];

const ACC_ACTIVE_COLORS: Record<SnapAccuracy, string> = {
  ON_TARGET: "text-make border-make/50 bg-make/10",
  HIGH: "text-warn border-warn/50 bg-warn/10",
  LOW: "text-warn border-warn/50 bg-warn/10",
  LEFT: "text-miss border-miss/50 bg-miss/10",
  RIGHT: "text-miss border-miss/50 bg-miss/10",
};

const BENCHMARK_STYLES: Record<SnapBenchmark, string> = {
  excellent: "text-make",
  good: "text-accent",
  needsWork: "text-miss",
};

const BENCHMARK_LABELS: Record<SnapBenchmark, string> = {
  excellent: "Excellent",
  good: "Good",
  needsWork: "Needs Work",
};

const TYPE_BENCHMARKS: Record<SnapType, string> = {
  PUNT: "≤0.80s = excellent  /  ≤0.95s = good",
  FG: "≤0.38s = excellent  /  ≤0.45s = good",
  PAT: "≤0.38s = excellent  /  ≤0.45s = good",
};

interface SnapEntryCardProps {
  athletes: string[];
  snapCount: number;
  onAdd: (snap: LongSnapEntry) => void;
}

export function SnapEntryCard({ athletes, snapCount, onAdd }: SnapEntryCardProps) {
  const [athlete, setAthlete] = useState<string>(athletes[0] ?? "");
  const [snapType, setSnapType] = useState<SnapType>("PUNT");
  const [time, setTime] = useState<string>("0.74");
  const [accuracy, setAccuracy] = useState<SnapAccuracy>("ON_TARGET");
  const [score, setScore] = useState<number>(0);

  const parsedTime = parseFloat(time);
  const benchmark: SnapBenchmark | null = !isNaN(parsedTime) && parsedTime > 0
    ? getSnapBenchmark(snapType, parsedTime)
    : null;

  const handleLog = () => {
    if (!athlete || !time || isNaN(parsedTime)) return;
    const entry: LongSnapEntry = {
      athleteId: athlete,
      athlete,
      snapType,
      time: parsedTime,
      accuracy,
      score,
      benchmark: benchmark ?? "needsWork",
    };
    onAdd(entry);
    setTime("");
    setScore(0);
    // athlete and snapType remain sticky; time/accuracy reset for new snap
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">New Snap</p>
        <span className="text-xs text-muted">#{snapCount + 1}</span>
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
                  : "bg-surface-2 text-slate-300 border border-border hover:bg-surface-2/80"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Snap type */}
      <div>
        <p className="label">Snap Type</p>
        <div className="flex gap-2">
          {SNAP_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setSnapType(t)}
              className={clsx(
                "flex-1 py-2.5 rounded-input text-sm font-semibold transition-all",
                snapType === t
                  ? "bg-accent/20 text-accent border border-accent/50"
                  : "bg-surface-2 text-muted border border-border hover:text-white"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted mt-1.5">{TYPE_BENCHMARKS[snapType]}</p>
      </div>

      {/* Time + benchmark */}
      <div>
        <p className="label">Time (seconds)</p>
        <div className="flex items-center gap-3">
          <input
            className="input w-32 text-center text-xl font-bold"
            type="text"
            inputMode="decimal"
            placeholder="0.74"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          {benchmark && (
            <span className={clsx("text-sm font-bold", BENCHMARK_STYLES[benchmark])}>
              {BENCHMARK_LABELS[benchmark]}
            </span>
          )}
        </div>
      </div>

      {/* Accuracy */}
      <div>
        <p className="label">Accuracy</p>
        <div className="grid grid-cols-5 gap-1.5">
          {ACC_OPTIONS.map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={() => setAccuracy(value)}
              className={clsx(
                "py-3 rounded-input text-xs font-bold border transition-all flex flex-col items-center gap-1",
                accuracy === value
                  ? ACC_ACTIVE_COLORS[value]
                  : "bg-surface-2 text-muted border-border hover:text-white"
              )}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="text-[10px] leading-none">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Score */}
      <div>
        <p className="label">Score</p>
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
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

      <button
        onClick={handleLog}
        disabled={!athlete || !time || isNaN(parsedTime)}
        className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        LOG SNAP
      </button>
    </div>
  );
}
