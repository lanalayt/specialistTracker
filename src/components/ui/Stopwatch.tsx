"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { getTeamId } from "@/lib/teamData";
import { saveStopwatchRun, type StopwatchLap } from "@/lib/stopwatchStore";

// The in-progress run is mirrored to localStorage so the clock survives a
// reload or a trip to another page — it keeps counting off wall-clock time.
const LS_KEY = "st_stopwatch_active_v1";

interface ActiveRun {
  id: string;
  startedAt: number; // epoch ms
  laps: number[]; // epoch ms, one per Lap press
  stoppedAt: number | null; // epoch ms once stopped
}

/** m:ss.hh, growing to h:mm:ss.hh past the hour. */
function fmt(ms: number): string {
  const clamped = Math.max(0, ms);
  const hundredths = Math.floor(clamped / 10) % 100;
  const secs = Math.floor(clamped / 1000) % 60;
  const mins = Math.floor(clamped / 60000) % 60;
  const hours = Math.floor(clamped / 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(mins)}:${pad(secs)}.${pad(hundredths)}`
    : `${mins}:${pad(secs)}.${pad(hundredths)}`;
}

function toLaps(run: ActiveRun): StopwatchLap[] {
  return run.laps.map((t, i) => ({
    n: i + 1,
    splitMs: t - run.startedAt,
    lapMs: t - (i === 0 ? run.startedAt : run.laps[i - 1]),
  }));
}

function StopwatchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className}>
      <path d="M9.5 2.5h5" />
      <path d="M12 2.5v2" />
      <path d="M18.5 6.5l1.3-1.3" />
      <circle cx="12" cy="13.5" r="8" />
      <path d="M12 9.5v4h3" />
    </svg>
  );
}

export function Stopwatch() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<ActiveRun | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const panelRef = useRef<HTMLDivElement>(null);

  const running = run !== null && run.stoppedAt === null;
  const elapsed = run ? (run.stoppedAt ?? now) - run.startedAt : 0;

  // Restore an in-progress run (still ticking) on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setRun(JSON.parse(raw) as ActiveRun);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (run) localStorage.setItem(LS_KEY, JSON.stringify(run));
      else localStorage.removeItem(LS_KEY);
    } catch {}
  }, [run]);

  // Tick only while the clock is actually running.
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 47);
    return () => clearInterval(id);
  }, [running]);

  // Click-away / Escape close, so the panel doesn't linger over the dashboard.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const start = () => setRun({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, startedAt: Date.now(), laps: [], stoppedAt: null });

  const lap = () => setRun((r) => (r && r.stoppedAt === null ? { ...r, laps: [...r.laps, Date.now()] } : r));

  const stop = async () => {
    if (!run || run.stoppedAt !== null) return;
    // Stop closes out the segment in progress, so the time since the last Lap
    // (or since the start) lands as a final split rather than being dropped.
    const at = Date.now();
    const stopped: ActiveRun = { ...run, laps: [...run.laps, at], stoppedAt: at };
    setRun(stopped);
    const tid = getTeamId();
    if (!tid) return;
    await saveStopwatchRun(tid, {
      id: stopped.id,
      userId: user?.id ?? null,
      startedAt: new Date(stopped.startedAt).toISOString(),
      stoppedAt: new Date(at).toISOString(),
      totalMs: at - stopped.startedAt,
      laps: toLaps(stopped),
    });
  };

  const reset = () => setRun(null);

  const laps = run ? toLaps(run) : [];

  return (
    <div ref={panelRef} className="fixed top-16 right-3 z-20 flex flex-col items-end">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Stopwatch"
        title="Stopwatch"
        className={clsx(
          "w-9 h-9 rounded-full border flex items-center justify-center transition-colors shadow-lg bg-surface",
          running || open
            ? "border-accent text-accent bg-accent/15"
            : "border-border text-slate-200 hover:text-accent hover:border-accent/50"
        )}
      >
        <StopwatchIcon className="w-5 h-5" />
      </button>

      {/* Running time stays visible as a badge under the icon while collapsed */}
      {!open && run && (
        <span className="mt-1 px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono font-bold text-accent tabular-nums">
          {fmt(elapsed)}
        </span>
      )}

      {open && (
        <div className="mt-2 w-64 sm:w-72 rounded-card border border-border bg-surface shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-widest">Stopwatch</p>
            <button onClick={() => setOpen(false)} aria-label="Close stopwatch" className="text-muted hover:text-white text-xs px-1">
              ✕
            </button>
          </div>

          <div className={clsx("text-center text-3xl font-mono font-black tabular-nums leading-none py-2", running ? "text-accent" : "text-slate-100")}>
            {fmt(elapsed)}
          </div>

          <div className="flex gap-2 mt-2">
            {!run ? (
              <button onClick={start} className="btn-primary flex-1 py-2 px-0">Start</button>
            ) : running ? (
              <>
                <button onClick={lap} className="btn-primary flex-1 py-2 px-0">Lap</button>
                <button onClick={stop} className="btn-danger flex-1 py-2 px-0">Stop</button>
              </>
            ) : (
              <button onClick={reset} className="btn-ghost flex-1 py-2 px-0">Reset</button>
            )}
          </div>

          {laps.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between text-[10px] font-semibold text-muted uppercase tracking-wider px-1 pb-1 border-b border-border">
                <span>Lap</span>
                <span className="flex gap-3">
                  <span className="w-16 text-right">Split</span>
                  <span className="w-16 text-right">Total</span>
                </span>
              </div>
              {[...laps].reverse().map((l) => (
                <div key={l.n} className="flex items-center justify-between text-xs py-1.5 px-1 border-b border-border/40 last:border-0">
                  <span className="font-semibold text-slate-300">{l.n}</span>
                  <span className="flex gap-3 font-mono tabular-nums">
                    <span className="w-16 text-right text-accent">{fmt(l.lapMs)}</span>
                    <span className="w-16 text-right text-muted">{fmt(l.splitMs)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
