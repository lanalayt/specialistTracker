"use client";

import React from "react";
import type { KickoffEntry } from "@/types";

/**
 * Horizontal pseudo-3D kickoff field view.
 * Same perspective as PuntFieldView: viewer on the near sideline looking
 * across the field. Kicker tees from own 35 (left). Ball arcs right across
 * the field with hang-time lift. Return line travels backward from the
 * landing spot.
 */

interface Props {
  kicks: KickoffEntry[];
  currentKick?: {
    los?: number;
    landingYL?: number;
    distance?: number;
    hangTime?: number;
  } | null;
}

const W = 780;
const H = 360;
const PAD_X = 30;
const TOP_Y = 90;
const BOTTOM_Y = 320;

function project(fieldX: number, fieldY: number): { x: number; y: number } {
  const yT = Math.max(0, Math.min(1, fieldY / 53));
  const y = TOP_Y + yT * (BOTTOM_Y - TOP_Y);
  const nearScale = 1;
  const farScale = 0.88;
  const scale = farScale + yT * (nearScale - farScale);
  const centerX = W / 2;
  const halfWidth = (W - 2 * PAD_X) / 2 * scale;
  const xT = (fieldX - 50) / 50;
  const x = centerX + xT * halfWidth;
  return { x, y };
}

function hangLift(hangTime: number | undefined): number {
  const h = Math.max(0.5, Math.min(hangTime ?? 3, 6));
  return 20 + (h / 6) * 90;
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
  const fy = 26.5;
  const startGround = project(los, fy);
  const endGround = project(landing, fy);
  const midFX = (los + landing) / 2;
  const midGround = project(midFX, fy);
  const lift = hangLift(hangTime);
  const cpY = ((startGround.y + endGround.y) / 2) - 2 * lift;
  const d = `M ${startGround.x} ${startGround.y} Q ${midGround.x} ${cpY} ${endGround.x} ${endGround.y}`;

  let returnLine: React.ReactNode = null;
  if ((returnYards ?? 0) > 0) {
    const retFX = Math.max(los, landing - (returnYards ?? 0));
    const retEnd = project(retFX, fy);
    returnLine = (
      <line
        x1={endGround.x}
        y1={endGround.y}
        x2={retEnd.x}
        y2={retEnd.y}
        stroke="#f43f5e"
        strokeWidth={2}
        strokeDasharray="4,3"
        opacity={opacity}
      />
    );
  }

  const apexShadow = <circle cx={midGround.x} cy={midGround.y} r={2} fill="rgba(0,0,0,0.3)" opacity={opacity} />;

  return (
    <g key={key}>
      {apexShadow}
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} opacity={opacity} strokeLinecap="round" />
      <circle cx={startGround.x} cy={startGround.y} r={4} fill="#60a5fa" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      <circle cx={endGround.x} cy={endGround.y} r={4} fill="#ef4444" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      {returnLine}
    </g>
  );
}

export function KickoffFieldView({ kicks, currentKick }: Props) {
  const yardLines: React.ReactNode[] = [];
  for (let fx = 0; fx <= 100; fx += 10) {
    const far = project(fx, 0);
    const near = project(fx, 53);
    const isGoal = fx === 0 || fx === 100;
    const isMid = fx === 50;
    yardLines.push(
      <line
        key={`yl-${fx}`}
        x1={far.x}
        y1={far.y}
        x2={near.x}
        y2={near.y}
        stroke={isGoal ? "rgba(255,255,255,0.55)" : isMid ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)"}
        strokeWidth={isGoal ? 2 : isMid ? 1.5 : 1}
      />
    );
    const display = fx <= 50 ? fx : 100 - fx;
    if (fx > 0 && fx < 100) {
      yardLines.push(
        <text
          key={`yt-${fx}`}
          x={near.x}
          y={near.y + 14}
          textAnchor="middle"
          fontSize={10}
          fill="rgba(255,255,255,0.5)"
          fontWeight={isMid ? "bold" : "normal"}
        >
          {display}
        </text>
      );
    }
  }

  // Default tee marker at own 35
  const teeProj = project(35, 26.5);

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Field View — Kickoffs</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> Tee</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#f59e0b]" /> Flight</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Land</span>
          <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-[#f43f5e]" /> Return</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 360 }}>
        <defs>
          <linearGradient id="ko-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1120" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="ko-turf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={TOP_Y} fill="url(#ko-sky)" />
        {(() => {
          const tl = project(0, 0);
          const tr = project(100, 0);
          const br = project(100, 53);
          const bl = project(0, 53);
          return (
            <polygon
              points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
              fill="url(#ko-turf)"
            />
          );
        })()}
        {/* Sidelines + goal lines */}
        {(() => {
          const tl = project(0, 0);
          const tr = project(100, 0);
          const bl = project(0, 53);
          const br = project(100, 53);
          return (
            <>
              <line x1={tl.x} y1={tl.y} x2={tr.x} y2={tr.y} stroke="white" strokeWidth={2} />
              <line x1={bl.x} y1={bl.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={2} />
              <line x1={tl.x} y1={tl.y} x2={bl.x} y2={bl.y} stroke="white" strokeWidth={2} />
              <line x1={tr.x} y1={tr.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={2} />
            </>
          );
        })()}
        {yardLines}

        {/* Default tee indicator when empty */}
        {kicks.length === 0 && !currentKick && (
          <g>
            <circle cx={teeProj.x} cy={teeProj.y} r={4} fill="#60a5fa" opacity={0.7} />
            <text x={teeProj.x} y={teeProj.y - 10} textAnchor="middle" fontSize={9} fill="#60a5fa" opacity={0.8}>Tee (35)</text>
          </g>
        )}

        {/* Past kicks */}
        {kicks.map((k, i) => {
          const los = k.los ?? 35;
          const landing = k.landingYL ?? (los + (k.distance || 0));
          if (landing <= los) return null;
          return renderArc(i, los, landing, k.hangTime, k.returnYards, 0.65);
        })}

        {/* Current preview */}
        {currentKick && (() => {
          const los = currentKick.los ?? 35;
          const landing = currentKick.landingYL ?? (los + (currentKick.distance ?? 0));
          if (landing <= los) return null;
          return renderArc("preview", los, landing, currentKick.hangTime, 0, 1, "#fbbf24", 3);
        })()}
      </svg>
      {kicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{kicks.length} kickoff{kicks.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
