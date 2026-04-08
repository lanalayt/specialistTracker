"use client";

import React from "react";
import type { FGKick, FGPosition } from "@/types";

/**
 * Vertical pseudo-3D FG field view.
 * The viewer stands behind the kicker looking downfield toward the
 * goalposts. The field widens toward the bottom (close to viewer) and
 * narrows toward the top (receding distance). Each kick is an arc from
 * the kick spot at the bottom up into the end zone.
 *
 * Coordinate system (logical):
 *   fieldX: 0..100  → kick spot (0, near) to goal line (100, far)
 *   fieldY: 0..53   → sideline to sideline
 */

interface Props {
  kicks: FGKick[];
  currentKick?: {
    dist: number;
    pos?: string;
    result?: string;
  } | null;
}

const W = 520;
const H = 560;
const HORIZON_Y = 40;
const BOTTOM_Y = H - 20;
const NEAR_WIDTH = W - 60;
const FAR_WIDTH = 160;

function project(fieldX: number, fieldY: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, fieldX / 100));
  const y = BOTTOM_Y - t * (BOTTOM_Y - HORIZON_Y);
  const widthAtY = NEAR_WIDTH - t * (NEAR_WIDTH - FAR_WIDTH);
  const centerX = W / 2;
  const normY = (fieldY - 26.5) / 53;
  const x = centerX + normY * widthAtY;
  return { x, y };
}

// Hash position → fieldY
const HASH_Y: Record<FGPosition, number> = {
  LH: 18,
  LM: 22,
  M: 26.5,
  RM: 31,
  RH: 35,
};
function hashY(pos: string | undefined): number {
  return HASH_Y[pos as FGPosition] ?? 26.5;
}

// Result → lateral offset at the goalpost (in fieldY units)
function resultLateralOffset(result: string): number {
  switch (result) {
    case "YC": return 0;
    case "YL": return -1.5;
    case "YR": return 1.5;
    case "XL": return -5;
    case "XR": return 5;
    case "XS": return 0;
    default: return 0;
  }
}

function isShort(result: string): boolean {
  return result === "XS";
}

// Kick starts at fieldX = 100 - distance (so longer kicks start farther from goal)
function kickStartFieldX(distance: number): number {
  const clamped = Math.max(15, Math.min(distance, 65));
  return Math.max(0, 100 - clamped);
}

function renderKick(
  key: string | number,
  kick: { dist: number; pos?: string; result?: string },
  opacity: number
) {
  const distance = kick.dist || 0;
  if (distance <= 0) return null;
  const startFX = kickStartFieldX(distance);
  const startFY = hashY(kick.pos);
  const start = project(startFX, startFY);

  const isMake = typeof kick.result === "string" && kick.result.startsWith("Y");
  const short = isShort(kick.result || "");
  const endFX = short ? (startFX + 100) / 2 : 100; // XS lands halfway
  const endFY = 26.5 + resultLateralOffset(kick.result || "");
  const end = project(endFX, endFY);

  // Arc peak in the middle
  const midFX = (startFX + endFX) / 2;
  const midFY = (startFY + endFY) / 2;
  const apex = project(midFX, midFY);
  apex.y -= 60; // arc height

  const color = isMake ? "#34d399" : "#ef4444";
  const d = `M ${start.x} ${start.y} Q ${apex.x} ${apex.y} ${end.x} ${end.y}`;

  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} opacity={opacity} strokeLinecap="round" />
      <circle cx={start.x} cy={start.y} r={4} fill="#60a5fa" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      <circle cx={end.x} cy={end.y} r={4} fill={color} stroke="#0f172a" strokeWidth={1} opacity={opacity} />
    </g>
  );
}

export function FGFieldView({ kicks, currentKick }: Props) {
  const yardLines: React.ReactNode[] = [];
  // Yard lines every 10 yards (distance from goal)
  for (let fx = 0; fx <= 100; fx += 10) {
    const left = project(fx, 0);
    const right = project(fx, 53);
    const isGoal = fx === 100;
    yardLines.push(
      <line
        key={`yl-${fx}`}
        x1={left.x}
        y1={left.y}
        x2={right.x}
        y2={right.y}
        stroke={isGoal ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)"}
        strokeWidth={isGoal ? 2 : 1}
      />
    );
  }

  // Hash marks (dotted vertical lines down the field)
  const hashMarks: React.ReactNode[] = [];
  for (let fx = 5; fx <= 95; fx += 5) {
    [18, 35].forEach((hy) => {
      const a = project(fx, hy);
      const b = project(fx, hy + 0.8);
      hashMarks.push(
        <line
          key={`hm-${fx}-${hy}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />
      );
    });
  }

  // Goalpost at the far end
  const postBase = project(100, 26.5);
  const postLeft = project(100, 24.1);
  const postRight = project(100, 28.9);
  const crossbarY = postBase.y - 18;

  const fgKicks = kicks.filter((k) => !k.isPAT);

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Field View — FG</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> Spot</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#34d399]" /> Made</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#ef4444]" /> Miss</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mx-auto" style={{ maxHeight: 560 }}>
        <defs>
          <linearGradient id="fg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1120" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="fg-turf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>
        </defs>
        {/* Sky */}
        <rect x={0} y={0} width={W} height={HORIZON_Y} fill="url(#fg-sky)" />
        {/* Turf polygon */}
        {(() => {
          const tl = project(100, 0);
          const tr = project(100, 53);
          const br = project(0, 53);
          const bl = project(0, 0);
          return (
            <polygon
              points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
              fill="url(#fg-turf)"
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

        {/* Goalpost (in perspective) */}
        <g>
          <line x1={postBase.x} y1={postBase.y} x2={postBase.x} y2={crossbarY} stroke="#fbbf24" strokeWidth={3} />
          <line x1={postLeft.x} y1={crossbarY} x2={postRight.x} y2={crossbarY} stroke="#fbbf24" strokeWidth={4} />
          <line x1={postLeft.x} y1={crossbarY} x2={postLeft.x} y2={crossbarY - 42} stroke="#fbbf24" strokeWidth={3} />
          <line x1={postRight.x} y1={crossbarY} x2={postRight.x} y2={crossbarY - 42} stroke="#fbbf24" strokeWidth={3} />
        </g>

        {/* Past kicks */}
        {fgKicks.map((k, i) => renderKick(i, { dist: k.dist, pos: k.pos, result: k.result }, 0.65))}

        {/* Current kick preview */}
        {currentKick && currentKick.dist > 0 && renderKick("preview", currentKick, 1)}
      </svg>
      {fgKicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{fgKicks.length} kick{fgKicks.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
