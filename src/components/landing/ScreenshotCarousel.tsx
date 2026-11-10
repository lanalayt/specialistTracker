"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Slide = {
  /**
   * Path under /public, e.g. "/landing/dashboard.png" or "/landing/charting.mp4".
   * Videos (.mp4 / .webm) autoplay muted on loop. Omit to show a placeholder frame.
   */
  src?: string;
  title: string;
  caption: string;
};

const INTERVAL_MS = 6000;

const isVideo = (src: string) => /\.(mp4|webm|mov)$/i.test(src);

/**
 * 3D "cover flow" carousel: one slide front and centre, the previous and next
 * slides smaller and angled behind it on the left and right. Every few seconds
 * everything shifts left: the right slide comes to the front, the front slide
 * moves to the left, and a new slide comes in on the right.
 */
export function ScreenshotCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [zoomed, setZoomed] = useState<Slide | null>(null);
  const paused = hovering || zoomed !== null;
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const t = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [index, paused, count, go]);

  // Position of slide i relative to the front slide: 0 = front, 1 = right, -1 = left.
  const offsetOf = (i: number) => {
    let o = (((i - index) % count) + count) % count;
    if (o > count / 2) o -= count;
    return o;
  };

  // Close the enlarged view with Escape.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomed(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const current = slides[index];

  return (
    <div
      className="relative mx-auto w-full max-w-[1440px]"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      {/* Glow behind the stage */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full blur-3xl"
        style={{ background: "radial-gradient(45% 55% at 50% 50%, rgba(0,212,160,0.30), transparent 70%)" }}
      />

      {/* Stage */}
      <div className="relative flex aspect-[16/9] w-full items-center justify-center sm:aspect-[12/5]" style={{ perspective: "1800px" }}>
        {slides.map((s, i) => {
          const o = offsetOf(i);
          const abs = Math.abs(o);
          const visible = abs <= 1;
          // The front slide has no transform at all so the browser draws it pixel-sharp.
          const transform =
            o === 0
              ? "none"
              : `translateX(${o * (visible ? 48 : 85)}%) scale(${visible ? 0.66 : 0.5}) rotateY(${o > 0 ? -22 : 22}deg)`;
          const canZoom = o === 0 && !!s.src && !isVideo(s.src);
          return (
            <div
              key={s.title}
              role={o === 0 && !canZoom ? undefined : "button"}
              aria-label={o === 0 ? (canZoom ? `Enlarge ${s.title}` : undefined) : `Show ${s.title}`}
              aria-hidden={!visible}
              onClick={o === 0 ? (canZoom ? () => setZoomed(s) : undefined) : () => go(i)}
              className="group absolute aspect-[3/2] w-[78%] transition-all duration-[900ms] sm:w-[58%] lg:w-[62%]"
              style={{
                transform,
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                zIndex: 30 - abs * 10,
                opacity: o === 0 ? 1 : visible ? 0.55 : 0,
                filter: o === 0 ? "none" : "brightness(0.6) blur(1px)",
                cursor: o === 0 ? (canZoom ? "zoom-in" : "default") : "pointer",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              <div
                className="h-full w-full overflow-hidden rounded-2xl border border-border bg-bg"
                style={{
                  boxShadow:
                    o === 0
                      ? "0 50px 120px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,212,160,0.25), 0 0 80px -10px rgba(0,212,160,0.35)"
                      : "0 30px 80px -20px rgba(0,0,0,0.9)",
                }}
              >
                <SlideMedia slide={s} active={o === 0} />
              </div>
              {canZoom && (
                <span
                  className="pointer-events-none absolute right-3 top-3 hidden items-center gap-1.5 rounded-pill border border-border px-3 py-1 text-xs font-semibold text-slate-100 opacity-0 transition group-hover:opacity-100 sm:flex"
                  style={{ background: "rgba(10,15,20,0.85)" }}
                >
                  ⤢ Click to enlarge
                </span>
              )}
            </div>
          );
        })}

        {/* Arrows */}
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => go(index - 1)}
              className="absolute left-1 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border text-xl text-slate-100 transition hover:scale-105 sm:left-4"
              style={{ background: "rgba(10,15,20,0.8)" }}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => go(index + 1)}
              className="absolute right-1 top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border text-xl text-slate-100 transition hover:scale-105 sm:right-4"
              style={{ background: "rgba(10,15,20,0.8)" }}
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Caption + progress */}
      <div className="mt-8 text-center">
        <h3 key={current.title} className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {current.title}
        </h3>
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
      {/* Enlarged view */}
      {zoomed?.src && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomed.title}
          onClick={() => setZoomed(null)}
          className="fixed inset-0 z-[100] flex cursor-zoom-out flex-col items-center justify-center gap-4 p-4"
          style={{ background: "rgba(5,8,11,0.92)" }}
        >
          <img
            src={zoomed.src}
            alt={zoomed.title}
            className="max-h-[85vh] max-w-[95vw] rounded-xl border border-border object-contain"
          />
          <p className="text-sm text-muted">{zoomed.title} · click anywhere or press Esc to close</p>
        </div>
      )}
      <style>{`@keyframes st-progress { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
}

function SlideMedia({ slide, active }: { slide: Slide; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Restart a recording from the beginning each time it comes to the front.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [active]);

  if (!slide.src) return <Placeholder title={slide.title} />;
  if (isVideo(slide.src)) {
    return (
      <video
        ref={videoRef}
        src={slide.src}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover object-top"
      />
    );
  }
  return <img src={slide.src} alt={slide.title} className="h-full w-full object-cover object-top" />;
}

/** Stand-in frame shown until a real screenshot or recording is added for the slide. */
function Placeholder({ title }: { title: string }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 text-center"
      style={{ background: "repeating-linear-gradient(135deg, var(--surface) 0 18px, var(--bg) 18px 36px)" }}
    >
      <img src="/logo-mark.svg" alt="" className="h-14 w-14 opacity-80" />
      <p className="text-lg font-bold">{title}</p>
      <p className="text-sm text-muted">Screenshot goes here</p>
    </div>
  );
}
