"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mobile-friendly bottom sheet (centered dialog on sm+ screens).
 * - Drag down on the sheet to dismiss (from the handle/header anywhere, or from
 *   a scroll area marked with `data-sheet-scroll` once it's scrolled to the top).
 * - Locks background scrolling while open, so touches never move the page behind.
 */
export function BottomSheet({ onClose, children, className = "" }: { onClose: () => void; children: React.ReactNode; className?: string }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Lock page scroll behind the sheet.
  useEffect(() => {
    const { body, documentElement: html } = document;
    const prev = { body: body.style.overflow, html: html.style.overflow };
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev.body;
      html.style.overflow = prev.html;
    };
  }, []);

  useEffect(() => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;

    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let canDrag = false;
    let dragging = false;

    const scrollAreaOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest("[data-sheet-scroll]") as HTMLElement | null) : null);

    const setOffset = (y: number, animate: boolean) => {
      sheet.style.transition = animate ? "transform 200ms ease-out" : "none";
      sheet.style.transform = y ? `translateY(${y}px)` : "";
      backdrop.style.transition = animate ? "background-color 200ms ease-out" : "none";
      const fade = Math.max(0, 1 - y / Math.max(sheet.offsetHeight, 1));
      backdrop.style.backgroundColor = `rgba(0,0,0,${0.7 * fade})`;
    };

    const onStart = (e: TouchEvent) => {
      const area = scrollAreaOf(e.target);
      canDrag = !area || area.scrollTop <= 0;
      dragging = false;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
    };

    const onMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const dy = y - startY;
      const dt = Math.max(e.timeStamp - lastT, 1);
      velocity = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;

      const area = scrollAreaOf(e.target);
      if (!dragging && canDrag && dy > 0 && (!area || area.scrollTop <= 0)) dragging = true;
      if (dragging) {
        e.preventDefault();
        setOffset(Math.max(0, dy), false);
      } else if (!area) {
        // Touches outside a scroll area must never scroll the page behind.
        e.preventDefault();
      }
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      const dy = lastY - startY;
      if (dy > Math.min(120, sheet.offsetHeight * 0.25) || velocity > 0.5) {
        setClosing(true);
        setOffset(sheet.offsetHeight, true);
        setTimeout(() => onCloseRef.current(), 200);
      } else {
        setOffset(0, true);
      }
    };

    // Swallow touch scrolling on the dimmed backdrop itself.
    const onBackdropMove = (e: TouchEvent) => {
      if (!sheet.contains(e.target as Node)) e.preventDefault();
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    backdrop.addEventListener("touchmove", onBackdropMove, { passive: false });
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
      backdrop.removeEventListener("touchmove", onBackdropMove);
    };
  }, []);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={() => { if (!closing) onClose(); }}
    >
      <div
        ref={sheetRef}
        className={`bg-surface border border-white/10 w-full sm:max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 cursor-grab">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        {children}
      </div>
    </div>
  );
}
