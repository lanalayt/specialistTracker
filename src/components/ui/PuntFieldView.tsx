"use client";

import React from "react";
import type { PuntEntry } from "@/types";

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
const H = 380;
const PAD_X = 30;
const TOP_Y = 100;
const BOTTOM_Y = 340;

function proj(fieldX: number, fieldY: number): { x: number; y: number } {
  const yT = Math.max(0, Math.min(1, fieldY / 53));
  const y = TOP_Y + yT * (BOTTOM_Y - TOP_Y);
  const scale = 0.88 + yT * 0.12;
  const centerX = W / 2;
  const halfWidth = (W - 2 * PAD_X) / 2 * scale;
  const xT = (fieldX - 50) / 50;
  const x = centerX + xT * halfWidth;
  return { x, y };
}

function hashToFieldY(hash: string | undefined): number {
  switch (hash) {
    case "LH": return 18; case "LM": return 22; case "M": return 26.5; case "RM": return 31; case "RH": return 35;
    default: return 26.5;
  }
}

function hangLift(hangTime: number | undefined): number {
  const h = Math.max(0.5, Math.min(hangTime ?? 3, 6));
  return 20 + (h / 6) * 100;
}

function renderArc(
  key: string | number, los: number, landing: number, hangTime: number | undefined,
  returnYards: number | undefined, fairCatch: boolean, hash: string | undefined,
  opacity: number, strokeColor = "#06b6d4", strokeWidth = 2.5
) {
  if (landing <= los) return null;
  const fy = hashToFieldY(hash);
  const startGround = proj(los, fy);
  const endGround = proj(landing, fy);
  const midFX = (los + landing) / 2;
  const midGround = proj(midFX, fy);
  const lift = hangLift(hangTime);
  const cpY = ((startGround.y + endGround.y) / 2) - 2 * lift;
  const d = `M ${startGround.x} ${startGround.y} Q ${midGround.x} ${cpY} ${endGround.x} ${endGround.y}`;

  let returnLine: React.ReactNode = null;
  if (!fairCatch && (returnYards ?? 0) > 0) {
    const retFX = Math.max(los, landing - (returnYards ?? 0));
    const retEnd = proj(retFX, fy);
    returnLine = <line x1={endGround.x} y1={endGround.y} x2={retEnd.x} y2={retEnd.y} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,3" opacity={opacity} />;
  }
  const fcMarker = fairCatch ? <text x={endGround.x} y={endGround.y - 10} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#a78bfa" opacity={opacity}>FC</text> : null;

  return (
    <g key={key}>
      {/* Glow */}
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={strokeWidth + 4} opacity={opacity * 0.15} strokeLinecap="round" filter="url(#arcBlur)" />
      {/* Arc */}
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} opacity={opacity} strokeLinecap="round" />
      {/* Markers */}
      <circle cx={startGround.x} cy={startGround.y} r={5} fill="#3b82f6" stroke="white" strokeWidth={1.5} opacity={opacity} />
      <circle cx={endGround.x} cy={endGround.y} r={5} fill="#ef4444" stroke="white" strokeWidth={1.5} opacity={opacity} />
      {returnLine}
      {fcMarker}
    </g>
  );
}

export function PuntFieldView({ punts, currentPunt }: Props) {
  // Turf stripes (alternating light/dark green every 5 yards)
  const turfStripes: React.ReactNode[] = [];
  for (let fx = 0; fx < 100; fx += 5) {
    const isDark = Math.floor(fx / 5) % 2 === 0;
    const tl = proj(fx, 0); const tr = proj(fx + 5, 0);
    const bl = proj(fx, 53); const br = proj(fx + 5, 53);
    turfStripes.push(
      <polygon key={`ts-${fx}`} points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
        fill={isDark ? "#14532d" : "#166534"} />
    );
  }

  // Yard lines
  const yardLines: React.ReactNode[] = [];
  for (let fx = 0; fx <= 100; fx += 10) {
    const far = proj(fx, 0); const near = proj(fx, 53);
    const isGoal = fx === 0 || fx === 100; const isMid = fx === 50;
    yardLines.push(<line key={`yl-${fx}`} x1={far.x} y1={far.y} x2={near.x} y2={near.y}
      stroke={isGoal ? "rgba(255,255,255,0.7)" : isMid ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
      strokeWidth={isGoal ? 2.5 : isMid ? 2 : 1} />);
    const display = fx <= 50 ? fx : 100 - fx;
    if (fx > 0 && fx < 100 && fx % 10 === 0) {
      const numPos = proj(fx, 45);
      yardLines.push(<text key={`yn-${fx}`} x={numPos.x} y={numPos.y + 2} textAnchor="middle" fontSize={11}
        fontWeight="800" fill="rgba(255,255,255,0.25)" letterSpacing="1">{display}</text>);
    }
  }

  return (
    <div className="card-2 p-3 bg-gradient-to-b from-slate-900 to-surface-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Punt Chart</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] border border-white/40" /> LOS</span>
          <span className="flex items-center gap-1"><span className="w-5 h-[3px] rounded bg-[#06b6d4]" /> Flight</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-white/40" /> Land</span>
          <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-[#f59e0b]" /> Return</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg overflow-hidden" style={{ maxHeight: 380 }}>
        <defs>
          <linearGradient id="pv-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020617" />
            <stop offset="40%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="arcBlur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {/* Sky */}
        <rect x={0} y={0} width={W} height={TOP_Y} fill="url(#pv-sky)" />
        {/* Stadium lights glow */}
        <circle cx={W * 0.2} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        <circle cx={W * 0.8} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        {/* Turf */}
        {turfStripes}
        {/* Sidelines */}
        {(() => {
          const tl = proj(0, 0); const tr = proj(100, 0); const bl = proj(0, 53); const br = proj(100, 53);
          return (<>
            <line x1={tl.x} y1={tl.y} x2={tr.x} y2={tr.y} stroke="white" strokeWidth={3} />
            <line x1={bl.x} y1={bl.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={3} />
            <line x1={tl.x} y1={tl.y} x2={bl.x} y2={bl.y} stroke="white" strokeWidth={3} />
            <line x1={tr.x} y1={tr.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={3} />
          </>);
        })()}
        {yardLines}
        {/* Arcs */}
        {punts.map((p, i) => {
          if (p.los == null || p.landingYL == null) return null;
          return renderArc(i, p.los, p.landingYL, p.hangTime, p.returnYards, !!p.fairCatch, p.hash, 0.7);
        })}
        {currentPunt && currentPunt.landingYL > currentPunt.los &&
          renderArc("preview", currentPunt.los, currentPunt.landingYL, currentPunt.hangTime, 0, false, currentPunt.hash, 1, "#22d3ee", 3.5)}
      </svg>
      {punts.length > 0 && <p className="text-[10px] text-muted text-right mt-1.5">{punts.length} punt{punts.length !== 1 ? "s" : ""}</p>}
    </div>
  );
}
