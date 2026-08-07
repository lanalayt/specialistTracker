"use client";

import { useState, useRef } from "react";
import clsx from "clsx";

/**
 * A tap-sequence stopwatch. Instead of a running clock, the coach taps the big
 * button at each cue point (e.g. snap, then kick). The button shows the timer
 * name in big letters with the tap instructions beneath. Each tap flashes for
 * feedback; when the sequence finishes, the elapsed time between consecutive
 * taps is handed back as `intervals` (seconds, one fewer than `taps`).
 */
export function IntervalStopwatch({
  taps,
  title,
  instruction,
  onIntervals,
}: {
  taps: number; // number of taps in the full sequence
  title: string; // big label, e.g. "Opp Timer"
  instruction: string; // small label, e.g. "Press at snap and then at kick"
  onIntervals: (intervals: number[]) => void; // seconds between consecutive taps
}) {
  const [count, setCount] = useState(0); // taps recorded so far in this sequence
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
    if (count === 0) {
      times.current = [now];
      setCount(1);
      doFlash("step");
      return;
    }
    times.current.push(now);
    if (count + 1 >= taps) {
      const intervals: number[] = [];
      for (let i = 1; i < times.current.length; i++) {
        intervals.push((times.current[i] - times.current[i - 1]) / 1000);
      }
      onIntervals(intervals);
      times.current = [];
      setCount(0);
      doFlash("done");
    } else {
      setCount(count + 1);
      doFlash("step");
    }
  };

  const reset = () => {
    times.current = [];
    setCount(0);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
  };

  const inProgress = count > 0;

  return (
    <div>
      <button
        type="button"
        onClick={press}
        className={clsx(
          "w-full min-h-16 py-2.5 rounded-input border-2 flex flex-col items-center justify-center transition-colors duration-100 active:scale-[0.98]",
          flash === "done"
            ? "bg-make text-slate-900 border-make"
            : flash === "step"
              ? "bg-accent text-slate-900 border-accent"
              : inProgress
                ? "bg-accent/15 text-accent border-accent"
                : "bg-surface-2 text-accent border-accent/60 hover:bg-accent/10"
        )}
      >
        <span className="text-base sm:text-lg font-black uppercase tracking-wide leading-tight text-center">{title}</span>
        <span className="text-[11px] font-semibold mt-0.5 leading-tight text-center opacity-90">{instruction}</span>
      </button>
      {inProgress && (
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>Tap {count + 1} of {taps}</span>
          <button type="button" onClick={reset} className="hover:text-miss font-semibold">Reset</button>
        </div>
      )}
    </div>
  );
}
