"use client";

import { useState, useRef } from "react";
import clsx from "clsx";

/**
 * A tap-sequence stopwatch. Instead of a running clock, the coach taps the big
 * button at each cue point (e.g. snap, then kick). The button shows the timer
 * name in big letters with the tap instructions beneath. Each tap flashes for
 * feedback.
 *
 * Each gap between consecutive taps fires `onInterval` immediately (seconds),
 * so a partial capture still records — e.g. if the op-time window is missed,
 * the punter can start at the punt and tap at the landing to grab just the
 * hang. After `taps` taps the sequence auto-resets for the next rep; Reset
 * clears it early.
 */
export function IntervalStopwatch({
  taps,
  title,
  instruction,
  onInterval,
}: {
  taps: number; // taps in a full sequence (used for auto-reset)
  title: string; // big label, e.g. "Opp Timer"
  instruction: string; // small label, e.g. "Press at snap and then at kick"
  onInterval: (seconds: number) => void; // fired per gap, as it happens
}) {
  const [count, setCount] = useState(0); // taps recorded so far in this sequence
  const [flash, setFlash] = useState<null | "step" | "done">(null);
  const last = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFlash = (kind: "step" | "done") => {
    setFlash(kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 180);
  };

  const press = () => {
    const now = Date.now();
    if (count === 0) {
      last.current = now;
      setCount(1);
      doFlash("step");
      return;
    }
    // Apply the gap since the previous tap right away, rounded to hundredths.
    if (last.current != null) {
      const secs = Math.round(((now - last.current) / 1000) * 100) / 100;
      if (secs > 0) onInterval(secs);
    }
    last.current = now;
    if (count + 1 >= taps) {
      last.current = null;
      setCount(0);
      doFlash("done");
    } else {
      setCount(count + 1);
      doFlash("step");
    }
  };

  const reset = () => {
    last.current = null;
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
          "w-full min-h-24 py-4 rounded-input border-2 flex flex-col items-center justify-center transition-colors duration-100 active:scale-[0.98]",
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
