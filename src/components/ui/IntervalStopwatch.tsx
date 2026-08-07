"use client";

import { useState, useRef } from "react";
import clsx from "clsx";

/**
 * A tap-sequence stopwatch. Instead of a running clock, the coach taps the big
 * button at each cue point (e.g. snap, then kick). Each tap flashes for
 * feedback. When the sequence finishes, the elapsed time between consecutive
 * taps is handed back as `intervals` (seconds) — one fewer than the number of
 * steps — and the parent drops those into the right time fields.
 */
export function IntervalStopwatch({
  steps,
  onIntervals,
  title,
}: {
  steps: string[]; // cue points to tap at, e.g. ["Snap", "Kick"]
  onIntervals: (intervals: number[]) => void; // seconds between consecutive taps
  title?: string;
}) {
  const [idx, setIdx] = useState(0); // taps recorded so far in this sequence
  const [flash, setFlash] = useState<null | "step" | "done">(null);
  const times = useRef<number[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFlash = (kind: "step" | "done") => {
    setFlash(kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 180);
  };

  const press = () => {
    const now = Date.now();
    if (idx === 0) {
      times.current = [now];
      setIdx(1);
      doFlash("step");
      return;
    }
    times.current.push(now);
    if (idx + 1 >= steps.length) {
      const intervals: number[] = [];
      for (let i = 1; i < times.current.length; i++) {
        intervals.push((times.current[i] - times.current[i - 1]) / 1000);
      }
      onIntervals(intervals);
      times.current = [];
      setIdx(0);
      doFlash("done");
    } else {
      setIdx(idx + 1);
      doFlash("step");
    }
  };

  const reset = () => {
    times.current = [];
    setIdx(0);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
  };

  const nextLabel = steps[idx] ?? steps[0];
  const inProgress = idx > 0;

  return (
    <div>
      <button
        type="button"
        onClick={press}
        className={clsx(
          "w-full h-16 rounded-input border-2 font-black text-lg uppercase tracking-wide transition-colors duration-100 active:scale-[0.98]",
          flash === "done"
            ? "bg-make text-slate-900 border-make"
            : flash === "step"
              ? "bg-accent text-slate-900 border-accent"
              : inProgress
                ? "bg-accent/15 text-accent border-accent"
                : "bg-surface-2 text-accent border-accent/60 hover:bg-accent/10"
        )}
      >
        Press at {nextLabel}
      </button>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {title && <span className="font-semibold text-slate-300">{title} — </span>}
          {steps.map((s, i) => (
            <span key={i} className={clsx(inProgress && i === idx && "text-accent font-bold")}>
              {i > 0 ? " → " : ""}{s}
            </span>
          ))}
        </p>
        {inProgress && (
          <button type="button" onClick={reset} className="text-[11px] text-muted hover:text-miss font-semibold shrink-0">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
