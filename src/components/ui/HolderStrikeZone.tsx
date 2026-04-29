"use client";

import { useRef, useState, useEffect } from "react";

export interface ShortSnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
}

interface HolderStrikeZoneProps {
  markers?: ShortSnapMarker[];
  onSnap?: (marker: ShortSnapMarker) => void;
  nextNum?: number;
  chartMode?: "simple" | "detailed";
  missMode?: "simple" | "detailed";
}

// Strike zone — small box at bottom-right near the holder's hands
const ZONE = { top: 45, bottom: 78, left: 42, right: 76 };

function isInZone(xPct: number, yPct: number): boolean {
  return xPct >= ZONE.left && xPct <= ZONE.right && yPct >= ZONE.top && yPct <= ZONE.bottom;
}

function loadSnapSettings(): { chartMode: "simple" | "detailed"; missMode: "simple" | "detailed" } {
  try {
    const raw = localStorage.getItem("snapSettings");
    if (raw) {
      const p = JSON.parse(raw);
      return { chartMode: p.chartMode === "detailed" ? "detailed" : "simple", missMode: p.missMode === "detailed" ? "detailed" : "simple" };
    }
  } catch {}
  return { chartMode: "simple", missMode: "simple" };
}

export function HolderStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode, missMode }: HolderStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Load from settings if not passed as props
  const [settings] = useState(() => loadSnapSettings());
  const isDetailedStrike = (chartMode ?? settings.chartMode) === "detailed";
  const isDetailedMiss = (missMode ?? settings.missMode) === "detailed";

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSnap || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone = isInZone(xPct, yPct);
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone });
  };

  return (
    <div className="flex justify-center">
      <div
        ref={containerRef}
        onClick={handleClick}
        className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none overflow-hidden flex items-end"
        style={{ width: 300, height: 260, background: "#000000", padding: 0 }}
      >
        {/* Holder image — left side, scaled up */}
        <img
          src="/holder-silhouette.png?v=7"
          alt="Holder"
          className="pointer-events-none select-none"
          style={{ height: "130%", width: "auto", objectFit: "contain", marginLeft: -20, position: "absolute", bottom: -60, left: 0 }}
          draggable={false}
        />

        {/* Detailed miss lines — zone edges extended to outer box */}
        {isDetailedMiss && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1={ZONE.left} y1="0" x2={ZONE.left} y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.left} y1={ZONE.bottom} x2={ZONE.left} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.right} y1="0" x2={ZONE.right} y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.right} y1={ZONE.bottom} x2={ZONE.right} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1="0" y1={ZONE.top} x2={ZONE.left} y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.right} y1={ZONE.top} x2="100" y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1="0" y1={ZONE.bottom} x2={ZONE.left} y2={ZONE.bottom} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.right} y1={ZONE.bottom} x2="100" y2={ZONE.bottom} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
          </svg>
        )}

        {/* Strike zone box overlay */}
        <div
          className="absolute border-2 border-red-500 rounded pointer-events-none"
          style={{
            top: `${ZONE.top}%`,
            left: `${ZONE.left}%`,
            width: `${ZONE.right - ZONE.left}%`,
            height: `${ZONE.bottom - ZONE.top}%`,
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            ...(isDetailedStrike ? {
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gridTemplateRows: "1fr 1fr 1fr",
            } : {}),
          }}
        >
          {isDetailedStrike && Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border pointer-events-none" style={{ borderColor: "rgba(239, 68, 68, 0.35)" }} />
          ))}
        </div>

        {/* Snap markers */}
        {markers.map((m) => (
          <div
            key={m.num}
            className="absolute pointer-events-none flex items-center justify-center"
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              transform: "translate(-50%, -50%)",
              width: 26,
              height: 26,
              borderRadius: "50%",
              backgroundColor: m.inZone ? "rgba(0, 212, 160, 0.85)" : "rgba(239, 68, 68, 0.85)",
              border: `2px solid ${m.inZone ? "#00d4a0" : "#ef4444"}`,
            }}
          >
            <span className="text-[10px] font-black text-white leading-none">{m.num}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
