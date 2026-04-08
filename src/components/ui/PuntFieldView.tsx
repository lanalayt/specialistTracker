"use client";

import React from "react";
import type { PuntEntry } from "@/types";

/**
 * Horizontal pseudo-3D punt field view.
 *
 * The viewer stands just off the near sideline, looking across the field.
 * The field runs LEFT (own goal line) to RIGHT (opponent goal line). The
 * far sideline recedes into the distance (top of the SVG, narrower); the
 * near sideline is in the foreground (bottom, wider). Ball arcs travel
 * left-to-right and curve UP into the sky based on hang time.
 *
 * Logical coordinate system:
 *   fieldX: 0..100 → own goal to opponent goal (left to right on screen)
 *   fieldY: 0..53  → far sideline (0, top) to near sideline (53, bottom)
 *   ball height: vertical lift above ground plane (higher hang = higher)
 */

interface Props {
  punts: PuntEntry[];
  currentPunt?: {
    los: number;
    landingYL: number;
    hangTime?: number;
    hash?: string;
  } | null;
}

const W = 780;
const H = 360;
const PAD_X = 30;
const TOP_Y = 90;     // far sideline top edge
const BOTTOM_Y = 320; // near sideline bottom edge
const SKY_TOP = 10;

// Perspective: the field width (right–left extent) is slightly narrower at
// the top (far sideline) because it's farther away. Shrink laterally along Y.
function project(fieldX: number, fieldY: number): { x: number; y: number } {
  // fieldY 0 = far (top), 53 = near (bottom)
  const yT = Math.max(0, Math.min(1, fieldY / 53));
  const y = TOP_Y + yT * (BOTTOM_Y - TOP_Y);
  // Width at top (far) is 88% of width at bottom
  const nearScale = 1;
  const farScale = 0.88;
  const scale = farScale + yT * (nearScale - farScale);
  const centerX = W / 2;
  const halfWidth = (W - 2 * PAD_X) / 2 * scale;
  const xT = (fieldX - 50) / 50; // -1..1
  const x = centerX + xT * halfWidth;
  return { x, y };
}

// Hash row → fieldY (near-to-far)
function hashToFieldY(hash: string | undefined): number {
  switch (hash) {
    case "LH": return 18;
    case "LM": return 22;
    case "M": return 26.5;
    case "RM": return 31;
    case "RH": return 35;
    default: return 26.5;
  }
}

// Arc lift (pixel height) from hang time
function hangLift(hangTime: number | undefined): number {
  const h = Math.max(0.5, Math.min(hangTime ?? 3, 6));
  return 20 + (h / 6) * 90; // 20–110 px lift at apex
}

function renderArc(
  key: string | number,
  los: number,
  landing: number,
  hangTime: number | undefined,
  returnYards: number | undefined,
  fairCatch: boolean,
  hash: string | undefined,
  opacity: number,
  strokeColor = "#06b6d4",
  strokeWidth = 2
) {
  if (landing <= los) return null;
  const fy = hashToFieldY(hash);
  const startGround = project(los, fy);
  const endGround = project(landing, fy);
  const midFX = (los + landing) / 2;
  const midGround = project(midFX, fy);
  const lift = hangLift(hangTime);
  const apex = { x: midGround.x, y: midGround.y - lift };
  // Control point for Q bezier — 2× apex lift from baseline
  const cpY = ((startGround.y + endGround.y) / 2) - 2 * lift;
  const d = `M ${startGround.x} ${startGround.y} Q ${midGround.x} ${cpY} ${endGround.x} ${endGround.y}`;

  // Return line (ground)
  let returnLine: React.ReactNode = null;
  if (!fairCatch && (returnYards ?? 0) > 0) {
    const retFX = Math.max(los, landing - (returnYards ?? 0));
    const retEnd = project(retFX, fy);
    returnLine = (
      <line
        x1={endGround.x}
        y1={endGround.y}
        x2={retEnd.x}
        y2={retEnd.y}
        stroke="#f59e0b"
        strokeWidth={2}
        strokeDasharray="4,3"
        opacity={opacity}
      />
    );
  }

  const fcMarker = fairCatch ? (
    <text
      x={endGround.x}
      y={endGround.y - 8}
      textAnchor="middle"
      fontSize={9}
      fontWeight="bold"
      fill="#a78bfa"
      opacity={opacity}
    >
      FC
    </text>
  ) : null;

  // Dropshadow on ground (visual cue that ball arcs above the field)
  const apexShadow = <circle cx={apex.x} cy={midGround.y} r={2} fill="rgba(0,0,0,0.3)" opacity={opacity} />;

  return (
    <g key={key}>
      {apexShadow}
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} opacity={opacity} strokeLinecap="round" />
      <circle cx={startGround.x} cy={startGround.y} r={4} fill="#60a5fa" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      <circle cx={endGround.x} cy={endGround.y} r={4} fill="#ef4444" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      {returnLine}
      {fcMarker}
    </g>
  );
}

export function PuntFieldView({ punts, currentPunt }: Props) {
  // Yard lines every 10
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
    // yard label on the near sideline
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

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Field View — Punts</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> LOS</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#06b6d4]" /> Flight</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Land</span>
          <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-[#f59e0b]" /> Return</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 360 }}>
        <defs>
          <linearGradient id="pv-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1120" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="pv-turf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>
        </defs>
        {/* Sky */}
        <rect x={0} y={0} width={W} height={TOP_Y} fill="url(#pv-sky)" />
        {/* Turf trapezoid */}
        {(() => {
          const tl = project(0, 0);
          const tr = project(100, 0);
          const br = project(100, 53);
          const bl = project(0, 53);
          return (
            <polygon
              points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
              fill="url(#pv-turf)"
            />
          );
        })()}
        {/* End zones */}
        {(() => {
          const tl = project(0, 0);
          const bl = project(0, 53);
          const lines = [
            { fromFX: 0, toFX: 0 },
          ];
          return lines.map((_, i) => (
            <line key={i} x1={tl.x} y1={tl.y} x2={bl.x} y2={bl.y} stroke="white" strokeWidth={2} />
          ));
        })()}
        {/* Sidelines */}
        {(() => {
          const tl = project(0, 0);
          const tr = project(100, 0);
          const bl = project(0, 53);
          const br = project(100, 53);
          return (
            <>
              <line x1={tl.x} y1={tl.y} x2={tr.x} y2={tr.y} stroke="white" strokeWidth={2} />
              <line x1={bl.x} y1={bl.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={2} />
              {/* Goal lines (thick at both ends) */}
              <line x1={tl.x} y1={tl.y} x2={bl.x} y2={bl.y} stroke="white" strokeWidth={2} />
              <line x1={tr.x} y1={tr.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={2} />
            </>
          );
        })()}
        {yardLines}

        {/* Past punts */}
        {punts.map((p, i) => {
          if (p.los == null || p.landingYL == null) return null;
          return renderArc(
            i,
            p.los,
            p.landingYL,
            p.hangTime,
            p.returnYards,
            !!p.fairCatch,
            p.hash,
            0.65
          );
        })}

        {/* Current punt preview */}
        {currentPunt && currentPunt.landingYL > currentPunt.los &&
          renderArc(
            "preview",
            currentPunt.los,
            currentPunt.landingYL,
            currentPunt.hangTime,
            0,
            false,
            currentPunt.hash,
            1,
            "#22d3ee",
            3
          )
        }
      </svg>
      {punts.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{punts.length} punt{punts.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
