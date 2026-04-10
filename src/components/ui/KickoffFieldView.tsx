"use client";

import React from "react";
import type { KickoffEntry } from "@/types";

interface Props {
  kicks: KickoffEntry[];
  currentKick?: { los?: number; landingYL?: number; distance?: number; hangTime?: number } | null;
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
  const halfWidth = (W - 2 * PAD_X) / 2 * scale;
  const xT = (fieldX - 50) / 50;
  return { x: W / 2 + xT * halfWidth, y };
}

function hangLift(ht: number | undefined): number {
  const h = Math.max(0.5, Math.min(ht ?? 3, 6));
  return 20 + (h / 6) * 100;
}

function renderArc(key: string | number, los: number, landing: number, ht: number | undefined, retYds: number | undefined, opacity: number, color = "#f59e0b", sw = 2.5) {
  if (landing <= los) return null;
  const fy = 26.5;
  const s = proj(los, fy); const e = proj(landing, fy); const m = proj((los + landing) / 2, fy);
  const lift = hangLift(ht);
  const cpY = ((s.y + e.y) / 2) - 2 * lift;
  const d = `M ${s.x} ${s.y} Q ${m.x} ${cpY} ${e.x} ${e.y}`;
  let ret: React.ReactNode = null;
  if ((retYds ?? 0) > 0) {
    const re = proj(Math.max(los, landing - (retYds ?? 0)), fy);
    ret = <line x1={e.x} y1={e.y} x2={re.x} y2={re.y} stroke="#f43f5e" strokeWidth={2} strokeDasharray="5,3" opacity={opacity} />;
  }
  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={sw + 4} opacity={opacity * 0.15} strokeLinecap="round" filter="url(#koBlur)" />
      <path d={d} fill="none" stroke={color} strokeWidth={sw} opacity={opacity} strokeLinecap="round" />
      <circle cx={s.x} cy={s.y} r={5} fill="#3b82f6" stroke="white" strokeWidth={1.5} opacity={opacity} />
      <circle cx={e.x} cy={e.y} r={5} fill="#ef4444" stroke="white" strokeWidth={1.5} opacity={opacity} />
      {ret}
    </g>
  );
}

export function KickoffFieldView({ kicks, currentKick }: Props) {
  const turfStripes: React.ReactNode[] = [];
  for (let fx = 0; fx < 100; fx += 5) {
    const isDark = Math.floor(fx / 5) % 2 === 0;
    const tl = proj(fx, 0); const tr = proj(fx + 5, 0); const bl = proj(fx, 53); const br = proj(fx + 5, 53);
    turfStripes.push(<polygon key={`ts-${fx}`} points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={isDark ? "#14532d" : "#166534"} />);
  }
  const yardLines: React.ReactNode[] = [];
  for (let fx = 0; fx <= 100; fx += 10) {
    const far = proj(fx, 0); const near = proj(fx, 53);
    const isGoal = fx === 0 || fx === 100; const isMid = fx === 50;
    yardLines.push(<line key={`yl-${fx}`} x1={far.x} y1={far.y} x2={near.x} y2={near.y}
      stroke={isGoal ? "rgba(255,255,255,0.7)" : isMid ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
      strokeWidth={isGoal ? 2.5 : isMid ? 2 : 1} />);
    const display = fx <= 50 ? fx : 100 - fx;
    if (fx > 0 && fx < 100 && fx % 10 === 0) {
      const p = proj(fx, 45);
      yardLines.push(<text key={`yn-${fx}`} x={p.x} y={p.y + 2} textAnchor="middle" fontSize={11} fontWeight="800" fill="rgba(255,255,255,0.25)" letterSpacing="1">{display}</text>);
    }
  }

  return (
    <div className="card-2 p-3 bg-gradient-to-b from-slate-900 to-surface-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Kickoff Chart</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] border border-white/40" /> Tee</span>
          <span className="flex items-center gap-1"><span className="w-5 h-[3px] rounded bg-[#f59e0b]" /> Flight</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-white/40" /> Land</span>
          <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-[#f43f5e]" /> Return</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg overflow-hidden" style={{ maxHeight: 380 }}>
        <defs>
          <linearGradient id="ko-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020617" />
            <stop offset="40%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="koBlur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <rect x={0} y={0} width={W} height={TOP_Y} fill="url(#ko-sky)" />
        <circle cx={W * 0.2} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        <circle cx={W * 0.8} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        {turfStripes}
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
        {kicks.map((k, i) => {
          const los = k.los ?? 35; const landing = k.landingYL ?? (los + (k.distance || 0));
          if (landing <= los) return null;
          return renderArc(i, los, landing, k.hangTime, k.returnYards, 0.7);
        })}
        {currentKick && (() => {
          const los = currentKick.los ?? 35; const landing = currentKick.landingYL ?? (los + (currentKick.distance ?? 0));
          if (landing <= los) return null;
          return renderArc("preview", los, landing, currentKick.hangTime, 0, 1, "#fbbf24", 3.5);
        })()}
      </svg>
      {kicks.length > 0 && <p className="text-[10px] text-muted text-right mt-1.5">{kicks.length} kickoff{kicks.length !== 1 ? "s" : ""}</p>}
    </div>
  );
}
