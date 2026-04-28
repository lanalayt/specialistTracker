"use client";

import { useRef } from "react";

export interface SnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
  zoneCell?: string;
  missCell?: string;
}

interface PunterStrikeZoneProps {
  markers?: SnapMarker[];
  onSnap?: (marker: SnapMarker) => void;
  nextNum?: number;
  chartMode?: "simple" | "detailed";
  missMode?: "simple" | "detailed";
}

// Strike zone bounds — LOCKED, do not change
const ZONE = { top: 34, bottom: 72, left: 25, right: 75 };

const CELL_ROWS = ["T", "M", "B"];
const CELL_COLS = ["L", "C", "R"];

const CELL_ARROWS: Record<string, string> = {
  TL: "↖", TC: "↑", TR: "↗",
  ML: "←", MC: "✓", MR: "→",
  BL: "↙", BC: "↓", BR: "↘",
};

const MISS_ARROWS: Record<string, string> = {
  HIGH_L: "↖", HIGH: "↑", HIGH_R: "↗",
  LEFT: "←", RIGHT: "→",
  LOW_L: "↙", LOW: "↓", LOW_R: "↘",
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

function getMissCell(xPct: number, yPct: number): string {
  // Diagonal lines from strike zone corners to outer box corners divide
  // the miss area into 8 regions: HIGH_L, HIGH, HIGH_R, LEFT, RIGHT, LOW_L, LOW, LOW_R
  const isAbove = yPct < ZONE.top;
  const isBelow = yPct > ZONE.bottom;
  const isLeft = xPct < ZONE.left;
  const isRight = xPct > ZONE.right;

  if (isAbove && isLeft) return "HIGH_L";
  if (isAbove && isRight) return "HIGH_R";
  if (isBelow && isLeft) return "LOW_L";
  if (isBelow && isRight) return "LOW_R";

  if (isAbove) {
    // Between top-left and top-right corners — check diagonal slopes
    const relX = (xPct - ZONE.left) / (ZONE.right - ZONE.left);
    const relY = (ZONE.top - yPct) / ZONE.top; // how far above
    if (relX < 0.33) return "HIGH_L";
    if (relX > 0.67) return "HIGH_R";
    return "HIGH";
  }
  if (isBelow) {
    const relX = (xPct - ZONE.left) / (ZONE.right - ZONE.left);
    if (relX < 0.33) return "LOW_L";
    if (relX > 0.67) return "LOW_R";
    return "LOW";
  }
  if (isLeft) return "LEFT";
  if (isRight) return "RIGHT";
  return "HIGH";
}

export function PunterStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode = "simple", missMode = "simple" }: PunterStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDetailedStrike = chartMode === "detailed";
  const isDetailedMiss = missMode === "detailed";

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSnap || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone = isInZone(xPct, yPct);
    const zoneCell = isDetailedStrike && inZone ? getZoneCell(xPct, yPct) : undefined;
    const missCell = isDetailedMiss && !inZone ? getMissCell(xPct, yPct) : undefined;
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone, zoneCell, missCell });
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

        {/* Detailed miss lines — diagonals from zone corners + extensions of zone edges to outer box */}
        {isDetailedMiss && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Top-left corner diagonal to outer box top-left */}
            <line x1={ZONE.left} y1={ZONE.top} x2="0" y2="0" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            {/* Top-right corner diagonal to outer box top-right */}
            <line x1={ZONE.right} y1={ZONE.top} x2="100" y2="0" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            {/* Bottom-left corner diagonal to outer box bottom-left */}
            <line x1={ZONE.left} y1={ZONE.bottom} x2="0" y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            {/* Bottom-right corner diagonal to outer box bottom-right */}
            <line x1={ZONE.right} y1={ZONE.bottom} x2="100" y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            {/* Extend zone left edge up and down */}
            <line x1={ZONE.left} y1="0" x2={ZONE.left} y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.left} y1={ZONE.bottom} x2={ZONE.left} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            {/* Extend zone right edge up and down */}
            <line x1={ZONE.right} y1="0" x2={ZONE.right} y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.right} y1={ZONE.bottom} x2={ZONE.right} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            {/* Extend zone top edge left and right */}
            <line x1="0" y1={ZONE.top} x2={ZONE.left} y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={ZONE.right} y1={ZONE.top} x2="100" y2={ZONE.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            {/* Extend zone bottom edge left and right */}
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
            <div
              key={i}
              className="border pointer-events-none"
              style={{ borderColor: "rgba(239, 68, 68, 0.35)" }}
            />
          ))}
        </div>

        {/* Snap markers */}
        {markers.map((m) => {
          const isDetailedHit = isDetailedStrike && m.inZone && m.zoneCell;
          const isDetailedMissHit = isDetailedMiss && !m.inZone && m.missCell;
          let symbol: string;
          if (isDetailedHit) {
            symbol = CELL_ARROWS[m.zoneCell!] ?? "✓";
          } else if (isDetailedMissHit) {
            symbol = MISS_ARROWS[m.missCell!] ?? "✗";
          } else {
            symbol = String(m.num);
          }

          return (
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
              <span className="text-[10px] font-black text-white leading-none">{symbol}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
