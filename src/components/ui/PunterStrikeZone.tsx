"use client";

import { useRef } from "react";

export interface SnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
  zoneCell?: string; // e.g. "TL", "TC", "TR", "ML", "MC", "MR", "BL", "BC", "BR"
}

interface PunterStrikeZoneProps {
  markers?: SnapMarker[];
  onSnap?: (marker: SnapMarker) => void;
  nextNum?: number;
  chartMode?: "simple" | "detailed";
}

// Strike zone bounds — LOCKED, do not change
const ZONE = { top: 34, bottom: 72, left: 25, right: 75 };

// Grid cell labels: row (T/M/B) + col (L/C/R)
const CELL_ROWS = ["T", "M", "B"];
const CELL_COLS = ["L", "C", "R"];

// Arrow symbols for each cell direction
const CELL_ARROWS: Record<string, string> = {
  TL: "↖", TC: "↑", TR: "↗",
  ML: "←", MC: "✓", MR: "→",
  BL: "↙", BC: "↓", BR: "↘",
};

function isInZone(xPct: number, yPct: number): boolean {
  return xPct >= ZONE.left && xPct <= ZONE.right && yPct >= ZONE.top && yPct <= ZONE.bottom;
}

function getZoneCell(xPct: number, yPct: number): string | undefined {
  if (!isInZone(xPct, yPct)) return undefined;
  const zoneW = ZONE.right - ZONE.left;
  const zoneH = ZONE.bottom - ZONE.top;
  const relX = (xPct - ZONE.left) / zoneW;
  const relY = (yPct - ZONE.top) / zoneH;
  const col = relX < 1 / 3 ? 0 : relX < 2 / 3 ? 1 : 2;
  const row = relY < 1 / 3 ? 0 : relY < 2 / 3 ? 1 : 2;
  return CELL_ROWS[row] + CELL_COLS[col];
}

export function PunterStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode = "simple" }: PunterStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDetailed = chartMode === "detailed";

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSnap || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone = isInZone(xPct, yPct);
    const zoneCell = isDetailed && inZone ? getZoneCell(xPct, yPct) : undefined;
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone, zoneCell });
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

        {/* Strike zone box overlay */}
        <div
          className="absolute border-2 border-red-500 rounded pointer-events-none"
          style={{
            top: `${ZONE.top}%`,
            left: `${ZONE.left}%`,
            width: `${ZONE.right - ZONE.left}%`,
            height: `${ZONE.bottom - ZONE.top}%`,
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            ...(isDetailed ? {
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gridTemplateRows: "1fr 1fr 1fr",
            } : {}),
          }}
        >
          {isDetailed && Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="border pointer-events-none"
              style={{ borderColor: "rgba(239, 68, 68, 0.35)" }}
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
              width: isDetailed && m.inZone ? 28 : 24,
              height: isDetailed && m.inZone ? 28 : 24,
              borderRadius: "50%",
              backgroundColor: m.inZone ? "rgba(0, 212, 160, 0.85)" : "rgba(239, 68, 68, 0.85)",
              border: `2px solid ${m.inZone ? "#00d4a0" : "#ef4444"}`,
            }}
          >
            {isDetailed && m.inZone && m.zoneCell ? (
              <span className="text-[10px] font-black text-white leading-none">
                {CELL_ARROWS[m.zoneCell] ?? "✓"}
              </span>
            ) : (
              <span className="text-[10px] font-black text-white leading-none">{m.num}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
