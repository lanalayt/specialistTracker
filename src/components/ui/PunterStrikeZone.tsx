"use client";

import { useRef } from "react";

export interface SnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
}

interface PunterStrikeZoneProps {
  markers?: SnapMarker[];
  onSnap?: (marker: SnapMarker) => void;
  nextNum?: number;
}

// Strike zone bounds as percentages of the outer container
// Nipple to knee on the player image, one ball-width outside body
const ZONE = { top: 34, bottom: 72, left: 25, right: 75 };

function isInZone(xPct: number, yPct: number): boolean {
  return xPct >= ZONE.left && xPct <= ZONE.right && yPct >= ZONE.top && yPct <= ZONE.bottom;
}

export function PunterStrikeZone({ markers = [], onSnap, nextNum = 1 }: PunterStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
        className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none overflow-hidden flex flex-col items-center"
        style={{ width: 280, background: "#000000", paddingTop: 50, paddingBottom: 10 }}
      >
        {/* Player image */}
        <img
          src="/punter-silhouette.png"
          alt="Punter"
          className="pointer-events-none select-none"
          style={{ height: 360, width: "auto", objectFit: "contain", filter: "invert(1) brightness(0.9)" }}
          draggable={false}
        />

        {/* Strike zone box overlay with 3x3 grid */}
        <div
          className="absolute border-2 border-red-500 rounded pointer-events-none"
          style={{
            top: `${ZONE.top}%`,
            left: `${ZONE.left}%`,
            width: `${ZONE.right - ZONE.left}%`,
            height: `${ZONE.bottom - ZONE.top}%`,
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gridTemplateRows: "1fr 1fr 1fr",
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="border pointer-events-none"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            />
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
              width: 24,
              height: 24,
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
