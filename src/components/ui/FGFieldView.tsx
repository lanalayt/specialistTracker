"use client";

import React from "react";
import type { FGKick } from "@/types";

/**
 * Side-view FG kicking field visualization.
 * Shows each kick as an arc from the kick spot toward the goalpost at the
 * far right. Arc height is proportional to hang time (or distance if hang
 * time is missing).
 *
 * Made kicks are rendered green; missed kicks red.
 */

interface Props {
  kicks: FGKick[];
  currentKick?: {
    dist: number;
    hangTime?: number;
    result?: string;
  } | null;
}

const W = 720;
const H = 300;
const PAD_X = 32;
const GROUND_Y = 240;
const SKY_TOP = 12;
const FIELD_BOTTOM = 280;

function fieldXToPx(fieldX: number): number {
  return PAD_X + (fieldX / 100) * (W - 2 * PAD_X);
}

// Arc height from distance + hang time
function arcHeight(distance: number, hangTime: number | undefined): number {
  const maxH = GROUND_Y - SKY_TOP - 20;
  if (hangTime && hangTime > 0) {
    return Math.min((hangTime / 6) * maxH, maxH);
  }
  // Fall back to distance-based estimate
  return Math.min((distance / 60) * maxH * 0.85, maxH);
}

// Convert FG distance into a LOS field position (0..100).
// The kicker is ~7 yards behind the LOS, and the goalpost is 10 yards beyond
// the goal line (back of end zone). So LOS = goal line - (distance - 17).
// In our 0..100 system with 100 = opponent goal line:
//   kickSpot = 100 - distance + 10 (end zone depth adjustment for display)
// We'll keep it simple and just use 100 - distance for start X so the
// farther kicks start further away from the goalpost.
function distanceToKickSpot(distance: number): number {
  return Math.max(0, Math.min(100, 100 - distance));
}

const GOAL_POST_X_FIELD = 100; // far right
const CROSSBAR_HEIGHT = 80; // pixels above ground — visual only

function renderArc(
  key: string | number,
  kick: { dist: number; hangTime?: number; result?: string },
  opacity: number
) {
  const distance = kick.dist || 0;
  if (distance <= 0) return null;
  const startFieldX = distanceToKickSpot(distance);
  const startX = fieldXToPx(startFieldX);
  const endX = fieldXToPx(GOAL_POST_X_FIELD);
  const midX = (startX + endX) / 2;
  const h = arcHeight(distance, kick.hangTime);
  const controlY = GROUND_Y - 2 * h;
  const d = `M ${startX} ${GROUND_Y} Q ${midX} ${controlY} ${endX} ${GROUND_Y - CROSSBAR_HEIGHT * 0.4}`;

  const isMake = typeof kick.result === "string" && kick.result.startsWith("Y");
  const color = isMake ? "#34d399" : "#ef4444";

  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} opacity={opacity} strokeLinecap="round" />
      <circle cx={startX} cy={GROUND_Y} r={4} fill="#60a5fa" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
    </g>
  );
}

export function FGFieldView({ kicks, currentKick }: Props) {
  const yardLines: React.ReactNode[] = [];
  for (let yl = 0; yl <= 100; yl += 10) {
    const x = fieldXToPx(yl);
    const isMidfield = yl === 50;
    const isGoalLine = yl === 0 || yl === 100;
    yardLines.push(
      <line
        key={`gl-${yl}`}
        x1={x}
        y1={SKY_TOP}
        x2={x}
        y2={GROUND_Y}
        stroke={isGoalLine ? "rgba(255,255,255,0.55)" : isMidfield ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)"}
        strokeWidth={isGoalLine ? 2 : isMidfield ? 1.5 : 1}
        strokeDasharray={isGoalLine || isMidfield ? undefined : "2,3"}
      />
    );
    const display = yl <= 50 ? yl : 100 - yl;
    if (yl > 0 && yl < 100) {
      yardLines.push(
        <text key={`tl-${yl}`} x={x} y={FIELD_BOTTOM} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.5)" fontWeight={isMidfield ? "bold" : "normal"}>
          {display}
        </text>
      );
    }
  }

  // Goalpost at the far right
  const postX = fieldXToPx(100);
  const crossbarY = GROUND_Y - CROSSBAR_HEIGHT;
  const uprightTopY = crossbarY - 70;

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Field View — FG</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> Spot</span>
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-[#34d399]" /> Made</span>
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-[#ef4444]" /> Miss</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 320 }}>
        <defs>
          <linearGradient id="fg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1120" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="fg-turf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#166534" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={GROUND_Y} fill="url(#fg-sky)" />
        <rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} fill="url(#fg-turf)" />
        {/* End zones */}
        <rect x={fieldXToPx(100)} y={GROUND_Y} width={W - fieldXToPx(100)} height={H - GROUND_Y} fill="rgba(239,68,68,0.15)" />
        {yardLines}
        <line x1={0} y1={GROUND_Y} x2={W} y2={GROUND_Y} stroke="white" strokeWidth={2} />

        {/* Goalpost */}
        <g>
          {/* Base */}
          <line x1={postX} y1={GROUND_Y} x2={postX} y2={crossbarY} stroke="#fbbf24" strokeWidth={3} />
          {/* Crossbar */}
          <line x1={postX - 18} y1={crossbarY} x2={postX + 18} y2={crossbarY} stroke="#fbbf24" strokeWidth={4} />
          {/* Uprights */}
          <line x1={postX - 18} y1={crossbarY} x2={postX - 18} y2={uprightTopY} stroke="#fbbf24" strokeWidth={3} />
          <line x1={postX + 18} y1={crossbarY} x2={postX + 18} y2={uprightTopY} stroke="#fbbf24" strokeWidth={3} />
        </g>

        {/* Past kicks */}
        {kicks.map((k, i) => {
          if (k.isPAT) return null; // PATs not shown on field
          return renderArc(i, { dist: k.dist, hangTime: undefined, result: k.result }, 0.6);
        })}

        {/* Current kick preview */}
        {currentKick && currentKick.dist > 0 &&
          renderArc("preview", currentKick, 1)
        }
      </svg>
      {kicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{kicks.filter((k) => !k.isPAT).length} kick{kicks.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
