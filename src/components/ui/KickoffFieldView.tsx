"use client";

import React from "react";
import type { KickoffEntry } from "@/types";

/**
 * Side-view kickoff field visualization.
 * Renders each kickoff as a quadratic arc from the kicker's spot (own 35 by
 * default, unless los is provided) to the landing yard line.
 * Arc height is proportional to hang time.
 */

interface Props {
  kicks: KickoffEntry[];
  currentKick?: {
    los: number;
    landingYL: number;
    hangTime?: number;
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

function hangToArcHeight(hangTime: number | undefined): number {
  const h = Math.max(0.5, Math.min(hangTime ?? 3, 6));
  const maxH = GROUND_Y - SKY_TOP - 10;
  return Math.min((h / 6) * maxH, maxH);
}

function renderArc(
  key: string | number,
  los: number,
  landing: number,
  hangTime: number | undefined,
  returnYards: number | undefined,
  opacity: number,
  strokeColor = "#f59e0b",
  strokeWidth = 2
) {
  if (landing <= los) return null;
  const startX = fieldXToPx(los);
  const endX = fieldXToPx(landing);
  const midX = (startX + endX) / 2;
  const arcHeight = hangToArcHeight(hangTime);
  const controlY = GROUND_Y - 2 * arcHeight;
  const d = `M ${startX} ${GROUND_Y} Q ${midX} ${controlY} ${endX} ${GROUND_Y}`;

  let returnLine: React.ReactNode = null;
  if ((returnYards ?? 0) > 0) {
    const retEndField = Math.max(los, landing - (returnYards ?? 0));
    const retEndX = fieldXToPx(retEndField);
    returnLine = (
      <line
        x1={endX}
        y1={GROUND_Y}
        x2={retEndX}
        y2={GROUND_Y}
        stroke="#f43f5e"
        strokeWidth={2}
        strokeDasharray="4,3"
        opacity={opacity}
      />
    );
  }

  return (
    <g key={key}>
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} opacity={opacity} strokeLinecap="round" />
      <circle cx={startX} cy={GROUND_Y} r={4} fill="#60a5fa" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      <circle cx={endX} cy={GROUND_Y} r={4} fill="#ef4444" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      {returnLine}
    </g>
  );
}

export function KickoffFieldView({ kicks, currentKick }: Props) {
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

  // Mark the kickoff spot (own 35 by default)
  const kickoffSpotX = fieldXToPx(35);

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Field View — Kickoffs</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> Tee</span>
          <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-[#f59e0b]" /> Flight</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Land</span>
          <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-[#f43f5e]" /> Return</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 320 }}>
        <defs>
          <linearGradient id="ko-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1120" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="ko-turf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#166534" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={GROUND_Y} fill="url(#ko-sky)" />
        <rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} fill="url(#ko-turf)" />
        <rect x={0} y={GROUND_Y} width={fieldXToPx(0) - 0} height={H - GROUND_Y} fill="rgba(239,68,68,0.15)" />
        <rect x={fieldXToPx(100)} y={GROUND_Y} width={W - fieldXToPx(100)} height={H - GROUND_Y} fill="rgba(239,68,68,0.15)" />
        {yardLines}
        <line x1={0} y1={GROUND_Y} x2={W} y2={GROUND_Y} stroke="white" strokeWidth={2} />

        {/* Default kickoff spot indicator (own 35) — only show if no actual kicks yet */}
        {kicks.length === 0 && !currentKick && (
          <g>
            <line x1={kickoffSpotX} y1={GROUND_Y - 6} x2={kickoffSpotX} y2={GROUND_Y + 6} stroke="#60a5fa" strokeWidth={2} opacity={0.6} />
            <text x={kickoffSpotX} y={GROUND_Y - 12} textAnchor="middle" fontSize={9} fill="#60a5fa" opacity={0.6}>Tee</text>
          </g>
        )}

        {/* Past kicks */}
        {kicks.map((k, i) => {
          const los = k.los ?? 35; // default kickoff spot = own 35
          const landing = k.landingYL ?? (los + (k.distance || 0));
          if (landing <= los) return null;
          return renderArc(i, los, landing, k.hangTime, k.returnYards, 0.6);
        })}

        {/* Current kick preview */}
        {currentKick && currentKick.landingYL > currentKick.los &&
          renderArc("preview", currentKick.los, currentKick.landingYL, currentKick.hangTime, 0, 1, "#fbbf24", 3)
        }
      </svg>
      {kicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{kicks.length} kickoff{kicks.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
