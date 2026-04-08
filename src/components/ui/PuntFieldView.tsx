"use client";

import React from "react";
import type { PuntEntry } from "@/types";

/**
 * Pseudo-3D punt field visualization.
 * Renders a football field in perspective, with ball flight arcs from
 * LOS to landing, then return paths to final spot.
 *
 * Coordinate system (logical field):
 *   fieldX: 0..100  → yard line 0 (punting team goal) to 100 (opponent goal)
 *   fieldY: 0..53   → sideline to sideline (53.3 yards wide, rounded)
 *
 * Perspective transform: closer rows (low fieldX) are larger, far rows
 * (high fieldX) recede into the distance (smaller, higher on screen).
 */

interface Props {
  punts: PuntEntry[];
  currentPunt?: {
    los: number;
    landingYL: number;
    hash: string;
    direction?: 0 | 0.5 | 1;
  } | null;
}

// SVG canvas
const W = 600;
const H = 360;

// Perspective parameters
const HORIZON_Y = 50;      // top of field on screen
const BOTTOM_Y = H - 20;   // bottom of field on screen (closest to viewer)
const NEAR_WIDTH = W - 40; // field width at the bottom
const FAR_WIDTH = 160;     // field width at the top (receded)

function project(fieldX: number, fieldY: number): { x: number; y: number } {
  // fieldX 0..100: 0 = near (bottom), 100 = far (top)
  const t = Math.max(0, Math.min(1, fieldX / 100));
  const y = BOTTOM_Y - t * (BOTTOM_Y - HORIZON_Y);
  const widthAtY = NEAR_WIDTH - t * (NEAR_WIDTH - FAR_WIDTH);
  // fieldY 0..53, center at 26.5
  const centerX = W / 2;
  const normY = (fieldY - 26.5) / 53; // -0.5 .. 0.5
  const x = centerX + normY * widthAtY;
  return { x, y };
}

// hashMark → fieldY
function hashToY(hash: string): number {
  switch (hash) {
    case "LH": return 18;   // left hash
    case "LM": return 22;
    case "M": return 26.5;  // middle
    case "RM": return 31;
    case "RH": return 35;   // right hash
    default: return 26.5;
  }
}

// Direction (-1, 0, +1) applied as lateral drift for the ball path
function directionDrift(dir: 0 | 0.5 | 1 | undefined): number {
  // 1 = on target (no drift), 0.5 = slight drift, 0 = big drift
  if (dir == null) return 0;
  if (dir === 1) return 0;
  if (dir === 0.5) return 4;
  return 8;
}

export function PuntFieldView({ punts, currentPunt }: Props) {
  // Build yard line markers every 10 yards
  const yardLines: React.ReactNode[] = [];
  for (let yl = 0; yl <= 100; yl += 10) {
    const left = project(yl, 0);
    const right = project(yl, 53);
    yardLines.push(
      <line
        key={`yl-${yl}`}
        x1={left.x}
        y1={left.y}
        x2={right.x}
        y2={right.y}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={yl === 50 ? 2 : 1}
      />
    );
    // yard number label (e.g., 10, 20, ..., 50, 40 (opp), ...)
    const display = yl <= 50 ? yl : 100 - yl;
    if (yl > 0 && yl < 100 && yl % 10 === 0) {
      const mid = project(yl, 10);
      yardLines.push(
        <text
          key={`t-${yl}`}
          x={mid.x}
          y={mid.y - 2}
          textAnchor="middle"
          fontSize={10 - (yl / 100) * 3}
          fill="rgba(255,255,255,0.5)"
          fontWeight="bold"
        >
          {display}
        </text>
      );
    }
  }

  // Hash marks
  const hashMarks: React.ReactNode[] = [];
  for (let yl = 5; yl <= 95; yl += 5) {
    [18, 35].forEach((hy) => {
      const a = project(yl, hy);
      const b = project(yl, hy + 0.8);
      hashMarks.push(
        <line
          key={`h-${yl}-${hy}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1}
        />
      );
    });
  }

  // Render a ball-flight arc from (losX, hashY) to (landingX, landingHashY)
  // using a quadratic bezier with an apex peak.
  function renderPuntArc(p: PuntEntry, i: number, opacity = 0.7) {
    const los = p.los ?? 0;
    const landing = p.landingYL ?? 0;
    if (landing <= los) return null;
    const startY = hashToY(p.hash);
    const drift = directionDrift(p.directionalAccuracy);
    // drift sign based on hash (toward sideline)
    const driftSign = startY < 26.5 ? -1 : startY > 26.5 ? 1 : 0;
    const endY = startY + drift * driftSign;
    const start = project(los, startY);
    const end = project(landing, endY);
    // Apex at midpoint, raised based on hang time (proxy for height)
    const midFieldX = (los + landing) / 2;
    const midFieldY = (startY + endY) / 2;
    const apex = project(midFieldX, midFieldY);
    const hangT = Math.max(0.5, Math.min(p.hangTime || 3, 6));
    const arcHeight = 30 + hangT * 8;
    apex.y -= arcHeight;

    const arc = `M ${start.x} ${start.y} Q ${apex.x} ${apex.y} ${end.x} ${end.y}`;

    // Return path: straight line from landing back toward los by returnYards
    let returnLine = null;
    if ((p.returnYards ?? 0) > 0) {
      const retX = Math.max(los, landing - (p.returnYards ?? 0));
      const retEnd = project(retX, endY);
      returnLine = (
        <line
          x1={end.x}
          y1={end.y}
          x2={retEnd.x}
          y2={retEnd.y}
          stroke="#f59e0b"
          strokeWidth={1.5}
          strokeDasharray="3,2"
          opacity={opacity}
        />
      );
    }

    return (
      <g key={i}>
        {/* LOS marker */}
        <circle cx={start.x} cy={start.y} r={3} fill="#60a5fa" opacity={opacity} />
        {/* Flight arc */}
        <path d={arc} fill="none" stroke="#06b6d4" strokeWidth={2} opacity={opacity} />
        {/* Landing marker */}
        <circle cx={end.x} cy={end.y} r={3} fill="#ef4444" opacity={opacity} />
        {/* Return */}
        {returnLine}
      </g>
    );
  }

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Game Field View</p>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> LOS
          </span>
          <span className="flex items-center gap-1">
            <span className="w-6 h-0.5 bg-[#06b6d4]" /> Flight
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Land
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-[#f59e0b] border-dashed" style={{ borderTopStyle: "dashed" }} /> Return
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 360 }}>
        {/* Sky/backdrop */}
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1120" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={HORIZON_Y} fill="url(#sky)" />
        {/* Turf polygon */}
        {(() => {
          const tl = project(100, 0);
          const tr = project(100, 53);
          const br = project(0, 53);
          const bl = project(0, 0);
          return (
            <polygon
              points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
              fill="url(#turf)"
            />
          );
        })()}
        {/* Sidelines */}
        {(() => {
          const a = project(0, 0);
          const b = project(100, 0);
          const c = project(100, 53);
          const d = project(0, 53);
          return (
            <>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="white" strokeWidth={2} />
              <line x1={d.x} y1={d.y} x2={c.x} y2={c.y} stroke="white" strokeWidth={2} />
            </>
          );
        })()}
        {yardLines}
        {hashMarks}

        {/* Past punts (dimmer) */}
        {punts.map((p, i) => renderPuntArc(p, i, 0.55))}

        {/* Current punt preview (bright) */}
        {currentPunt && currentPunt.landingYL > currentPunt.los && (() => {
          const previewPunt: PuntEntry = {
            athleteId: "",
            athlete: "",
            type: "",
            hash: currentPunt.hash as PuntEntry["hash"],
            yards: 0,
            hangTime: 3.5,
            opTime: 0,
            landingZones: [],
            directionalAccuracy: (currentPunt.direction ?? 1) as 0 | 0.5 | 1,
            los: currentPunt.los,
            landingYL: currentPunt.landingYL,
          };
          return renderPuntArc(previewPunt, -1, 1);
        })()}
      </svg>
      {punts.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{punts.length} punt{punts.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
