"use client";

import { useRef } from "react";

export interface SnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
  zoneCell?: string; // e.g. "TL", "TC", "TR", "ML", "MC", "MR", "BL", "BC", "BR"
  missCell?: string; // e.g. "HIGH_L", "HIGH", "HIGH_R", "LEFT", "RIGHT", "LOW_L", "LOW", "LOW_R"
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

// Grid cell labels for strikes
const CELL_ROWS = ["T", "M", "B"];
const CELL_COLS = ["L", "C", "R"];

// Arrow symbols for strike cells
const CELL_ARROWS: Record<string, string> = {
  TL: "↖", TC: "↑", TR: "↗",
  ML: "←", MC: "✓", MR: "→",
  BL: "↙", BC: "↓", BR: "↘",
};

// Arrow symbols for miss cells (outside zone)
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
  const midX = (ZONE.left + ZONE.right) / 2;
  const isLeft = xPct < ZONE.left;
  const isRight = xPct > ZONE.right;
  const isHigh = yPct < ZONE.top;
  const isLow = yPct > ZONE.bottom;

  if (isHigh && isLeft) return "HIGH_L";
  if (isHigh && isRight) return "HIGH_R";
  if (isHigh) return "HIGH";
  if (isLow && isLeft) return "LOW_L";
  if (isLow && isRight) return "LOW_R";
  if (isLow) return "LOW";
  if (isLeft) return "LEFT";
  if (isRight) return "RIGHT";
  // Shouldn't get here if not in zone, but fallback
  return xPct < midX ? "LEFT" : "RIGHT";
}

export function PunterStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode = "simple", missMode = "simple" }: PunterStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDetailedStrike = chartMode === "detailed";
  const isDetailedMiss = missMode === "detailed";
  const showGrid = isDetailedStrike || isDetailedMiss;

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

  // Outer grid extends one cell-width outside the strike zone on each side
  const zoneW = ZONE.right - ZONE.left;
  const zoneH = ZONE.bottom - ZONE.top;
  const cellW = zoneW / 3;
  const cellH = zoneH / 3;
  const outerGrid = {
    top: ZONE.top - cellH,
    left: ZONE.left - cellW,
    width: zoneW + cellW * 2,
    height: zoneH + cellH * 2,
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

        {/* Extended outer grid (detailed miss mode) */}
        {isDetailedMiss && (
          <div
            className="absolute pointer-events-none"
            style={{
              top: `${outerGrid.top}%`,
              left: `${outerGrid.left}%`,
              width: `${outerGrid.width}%`,
              height: `${outerGrid.height}%`,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
              gridTemplateRows: "1fr 1fr 1fr 1fr 1fr",
            }}
          >
            {Array.from({ length: 25 }).map((_, i) => {
              const row = Math.floor(i / 5);
              const col = i % 5;
              // Inner 3x3 (rows 1-3, cols 1-3) is the strike zone — skip those, they're drawn separately
              const isInner = row >= 1 && row <= 3 && col >= 1 && col <= 3;
              if (isInner) return <div key={i} />;
              return (
                <div
                  key={i}
                  className="border pointer-events-none"
                  style={{ borderColor: "rgba(239, 68, 68, 0.2)" }}
                />
              );
            })}
          </div>
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
