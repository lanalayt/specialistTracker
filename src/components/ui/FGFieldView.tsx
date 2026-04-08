"use client";

import React from "react";
import type { FGKick, FGPosition } from "@/types";

/**
 * Top-down (north-south) FG field view.
 * The kicker looks "upfield" toward the goalpost at the top. Each kick is
 * drawn as a line from the hash spot at the bottom up to a point near the
 * goalposts — offset left/right by the result (YL/YC/YR/XL/XR) and capped
 * short by XS misses. Made kicks render green, misses red.
 */

interface Props {
  kicks: FGKick[];
  currentKick?: {
    dist: number;
    pos?: string;
    result?: string;
  } | null;
}

const W = 420;
const H = 520;
const FIELD_LEFT = 60;
const FIELD_RIGHT = W - 60;
const FIELD_WIDTH = FIELD_RIGHT - FIELD_LEFT;
const FIELD_CENTER_X = (FIELD_LEFT + FIELD_RIGHT) / 2;

const GOALPOST_Y = 60;
const KICKER_MIN_Y = 130; // shortest kick ≈ 20 yd
const KICKER_MAX_Y = H - 30; // longest kick ≈ 65 yd

// Uprights width (visual only)
const UPRIGHT_HALF_W = 36;
const LEFT_UPRIGHT_X = FIELD_CENTER_X - UPRIGHT_HALF_W;
const RIGHT_UPRIGHT_X = FIELD_CENTER_X + UPRIGHT_HALF_W;

// Hash position → X offset from center (-1..1 relative)
const HASH_OFFSET: Record<FGPosition, number> = {
  LH: -0.65,
  LM: -0.30,
  M: 0,
  RM: 0.30,
  RH: 0.65,
};

function hashX(pos: string | undefined): number {
  const offset = HASH_OFFSET[(pos as FGPosition)] ?? 0;
  return FIELD_CENTER_X + offset * (FIELD_WIDTH / 2 - 20);
}

// Distance (yards) → Y position of kicker
function distanceToY(distance: number): number {
  const minDist = 20;
  const maxDist = 65;
  const clamped = Math.max(minDist, Math.min(distance, maxDist));
  const t = (clamped - minDist) / (maxDist - minDist);
  return KICKER_MIN_Y + t * (KICKER_MAX_Y - KICKER_MIN_Y);
}

// Result → landing offset from center. Positive = right, negative = left.
function resultOffsetX(result: string): number {
  if (!result) return 0;
  switch (result) {
    case "YC": return 0;
    case "YL": return -16;
    case "YR": return 16;
    case "XL": return -(UPRIGHT_HALF_W + 24);
    case "XR": return UPRIGHT_HALF_W + 24;
    case "XS": return 0;
    default: return 0;
  }
}

// Is this a short miss? Then the ball lands before reaching the goalpost
function isShort(result: string): boolean {
  return result === "XS";
}

function renderKick(
  key: string | number,
  kick: { dist: number; pos?: string; result?: string },
  opacity: number
) {
  const distance = kick.dist || 0;
  if (distance <= 0) return null;
  const startX = hashX(kick.pos);
  const startY = distanceToY(distance);
  const endX = FIELD_CENTER_X + resultOffsetX(kick.result || "");
  // XS misses land short — halfway between kicker and goal line
  const endY = isShort(kick.result || "")
    ? (startY + GOALPOST_Y) / 2
    : GOALPOST_Y - 14;

  const isMake = typeof kick.result === "string" && kick.result.startsWith("Y");
  const color = isMake ? "#34d399" : "#ef4444";

  return (
    <g key={key}>
      {/* Flight path */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={2}
        opacity={opacity}
        strokeLinecap="round"
      />
      {/* Kick spot (blue dot at bottom) */}
      <circle cx={startX} cy={startY} r={3.5} fill="#60a5fa" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      {/* Landing / end marker */}
      <circle cx={endX} cy={endY} r={3.5} fill={color} stroke="#0f172a" strokeWidth={1} opacity={opacity} />
    </g>
  );
}

export function FGFieldView({ kicks, currentKick }: Props) {
  // Yard line markers (horizontal stripes) — 10-yard increments
  const yardLines: React.ReactNode[] = [];
  for (let yd = 20; yd <= 60; yd += 10) {
    const y = distanceToY(yd);
    yardLines.push(
      <line
        key={`yl-${yd}`}
        x1={FIELD_LEFT}
        y1={y}
        x2={FIELD_RIGHT}
        y2={y}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={1}
        strokeDasharray="3,3"
      />
    );
    yardLines.push(
      <text
        key={`yt-${yd}`}
        x={FIELD_LEFT - 6}
        y={y + 3}
        textAnchor="end"
        fontSize={9}
        fill="rgba(255,255,255,0.4)"
      >
        {yd}
      </text>
    );
  }

  const fgKicks = kicks.filter((k) => !k.isPAT);

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Field View — FG</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> Kicker</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#34d399]" /> Made</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#ef4444]" /> Miss</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mx-auto" style={{ maxHeight: 520 }}>
        <defs>
          <linearGradient id="fg-turf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#166534" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>
        </defs>
        {/* Field background */}
        <rect x={0} y={0} width={W} height={H} fill="url(#fg-turf)" />
        {/* Sidelines */}
        <line x1={FIELD_LEFT} y1={0} x2={FIELD_LEFT} y2={H} stroke="white" strokeWidth={2} />
        <line x1={FIELD_RIGHT} y1={0} x2={FIELD_RIGHT} y2={H} stroke="white" strokeWidth={2} />
        {/* End zone highlight above goal line */}
        <rect x={FIELD_LEFT} y={0} width={FIELD_WIDTH} height={GOALPOST_Y} fill="rgba(239,68,68,0.12)" />
        {/* Goal line */}
        <line x1={FIELD_LEFT} y1={GOALPOST_Y} x2={FIELD_RIGHT} y2={GOALPOST_Y} stroke="white" strokeWidth={2} />
        {/* Yard lines */}
        {yardLines}

        {/* Goalpost — top-down view: base at center, two uprights extending up-and-out */}
        <g>
          {/* Crossbar */}
          <line x1={LEFT_UPRIGHT_X} y1={GOALPOST_Y} x2={RIGHT_UPRIGHT_X} y2={GOALPOST_Y} stroke="#fbbf24" strokeWidth={4} />
          {/* Left upright (visual: a small vertical mark up from the crossbar) */}
          <line x1={LEFT_UPRIGHT_X} y1={GOALPOST_Y} x2={LEFT_UPRIGHT_X} y2={GOALPOST_Y - 30} stroke="#fbbf24" strokeWidth={4} />
          {/* Right upright */}
          <line x1={RIGHT_UPRIGHT_X} y1={GOALPOST_Y} x2={RIGHT_UPRIGHT_X} y2={GOALPOST_Y - 30} stroke="#fbbf24" strokeWidth={4} />
          {/* Base post coming up from the crossbar center going down (from kicker's POV) */}
          <line x1={FIELD_CENTER_X} y1={GOALPOST_Y} x2={FIELD_CENTER_X} y2={GOALPOST_Y + 10} stroke="#fbbf24" strokeWidth={3} />
        </g>

        {/* Hash marks (vertical reference on ground) */}
        {(["LH", "LM", "M", "RM", "RH"] as FGPosition[]).map((p) => {
          const x = hashX(p);
          return (
            <g key={`h-${p}`}>
              <line x1={x} y1={GOALPOST_Y + 20} x2={x} y2={H - 20} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="2,5" />
              <text x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.4)">{p}</text>
            </g>
          );
        })}

        {/* Past kicks */}
        {fgKicks.map((k, i) => renderKick(i, { dist: k.dist, pos: k.pos, result: k.result }, 0.7))}

        {/* Current kick preview */}
        {currentKick && currentKick.dist > 0 && renderKick("preview", currentKick, 1)}
      </svg>
      {fgKicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{fgKicks.length} kick{fgKicks.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
