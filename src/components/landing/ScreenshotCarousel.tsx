"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Slide = {
  /** Image path under /public, e.g. "/landing/dashboard.png". Omit to show a placeholder frame. */
  src?: string;
  title: string;
  caption: string;
};

const INTERVAL_MS = 5000;

export function ScreenshotCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const t = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [index, paused, count, go]);

  const current = slides[index];

  return (
    <div
      className="relative mx-auto w-full max-w-6xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      {/* Glow behind the frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -inset-y-16 -z-10 blur-3xl"
        style={{ background: "radial-gradient(60% 50% at 50% 50%, rgba(0,212,160,0.28), transparent 70%)" }}
      />

      {/* Browser frame */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl" style={{ boxShadow: "0 40px 120px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,212,160,0.12)" }}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-3 w-3 rounded-full" style={{ background: "#ef4444" }} />
          <span className="h-3 w-3 rounded-full" style={{ background: "#f59e0b" }} />
          <span className="h-3 w-3 rounded-full" style={{ background: "#00d4a0" }} />
          <div className="ml-4 hidden flex-1 truncate rounded-pill bg-surface-2 px-4 py-1 text-xs text-muted sm:block">
            specialisttracker · {current.title}
          </div>
        </div>

        <div className="relative aspect-[16/10] w-full bg-bg">
          {slides.map((s, i) => (
            <div
              key={s.title}
              className="absolute inset-0 transition-all duration-700 ease-out"
              style={{
                opacity: i === index ? 1 : 0,
                transform: i === index ? "scale(1)" : "scale(1.03)",
              }}
              aria-hidden={i !== index}
            >
              {s.src ? (
                <img src={s.src} alt={s.title} className="h-full w-full object-cover object-top" />
              ) : (
                <Placeholder title={s.title} />
              )}
            </div>
          ))}

          {/* Arrows */}
          {count > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous screenshot"
                onClick={() => go(index - 1)}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border text-xl text-slate-100 transition hover:scale-105"
                style={{ background: "rgba(10,15,20,0.75)" }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next screenshot"
                onClick={() => go(index + 1)}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border text-xl text-slate-100 transition hover:scale-105"
                style={{ background: "rgba(10,15,20,0.75)" }}
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>

      {/* Caption + progress */}
      <div className="mt-8 text-center">
        <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{current.title}</h3>
        <p className="mx-auto mt-2 max-w-xl text-muted">{current.caption}</p>
        <div className="mt-6 flex items-center justify-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Show ${s.title}`}
              onClick={() => go(i)}
              className="relative h-1.5 overflow-hidden rounded-pill bg-surface-2 transition-all"
              style={{ width: i === index ? 48 : 16 }}
            >
              {i === index && (
                <span
                  key={`${index}-${paused}`}
                  className="absolute inset-y-0 left-0 rounded-pill bg-accent"
                  style={{
                    width: paused ? "100%" : undefined,
                    animation: paused ? undefined : `st-progress ${INTERVAL_MS}ms linear forwards`,
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
      <style>{`@keyframes st-progress { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
}

/** Stand-in frame shown until a real screenshot is added for the slide. */
function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center"
      style={{ background: "repeating-linear-gradient(135deg, var(--surface) 0 18px, var(--bg) 18px 36px)" }}>
      <img src="/logo-mark.svg" alt="" className="h-14 w-14 opacity-80" />
      <p className="text-lg font-bold">{title}</p>
      <p className="text-sm text-muted">Screenshot goes here</p>
    </div>
  );
}
