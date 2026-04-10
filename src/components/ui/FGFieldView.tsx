"use client";

import React, { useEffect, useState } from "react";
import type { FGKick, FGPosition } from "@/types";

interface Props {
  kicks: FGKick[];
  currentKick?: { dist: number; pos?: string; result?: string } | null;
}

const W = 480;
const H = 620;
const BOTTOM_Y = H - 16;
const TOP_Y = 30;
const NEAR_HALF_W = 210;
const FAR_HALF_W = 70;
const CENTER_X = W / 2;
const MAX_DIST = 55;
const ENDZONE_DEPTH = 10;
const GOAL_LINE_DIST = ENDZONE_DEPTH;

function proj(dist: number, lat: number): { x: number; y: number } {
  const t = 1 - Math.max(0, Math.min(1, dist / MAX_DIST));
  const y = BOTTOM_Y - t * (BOTTOM_Y - TOP_Y);
  const halfW = NEAR_HALF_W - t * (NEAR_HALF_W - FAR_HALF_W);
  const normLat = (lat - 26.5) / 53;
  return { x: CENTER_X + normLat * halfW * 2, y };
}

const HASH_LEFT = 18.5; const HASH_RIGHT = 34.5;
const POS_LAT: Record<FGPosition, number> = { LH: HASH_LEFT, LM: 22, M: 26.5, RM: 31, RH: HASH_RIGHT };
function posLat(pos: string | undefined): number { return POS_LAT[pos as FGPosition] ?? 26.5; }

function resultEndLat(result: string): number {
  switch (result) { case "YC": return 26.5; case "YL": return 25; case "YR": return 28; case "XL": return 20; case "XR": return 33; case "XS": return 26.5; default: return 26.5; }
}
function isShort(result: string): boolean { return result === "XS"; }
function kickerDist(fgDist: number): number { return Math.max(12, Math.min(fgDist, MAX_DIST)); }

function renderKick(key: string | number, kick: { dist: number; pos?: string; result?: string }, opacity: number) {
  const distance = kick.dist || 0;
  if (distance <= 0) return null;
  const isMake = typeof kick.result === "string" && kick.result.startsWith("Y");
  const short = isShort(kick.result || "");
  const startDist = kickerDist(distance);
  const startLat = posLat(kick.pos);
  const start = proj(startDist, startLat);
  const endDist = short ? (startDist + GOAL_LINE_DIST) / 2 : 5;
  const endLat = resultEndLat(kick.result || "");
  const end = proj(endDist, endLat);
  const midDist = (startDist + endDist) / 2;
  const midLat = (startLat + endLat) / 2;
  const mid = proj(midDist, midLat);
  const arcLift = 40 + (distance / 60) * 60;
  mid.y -= arcLift;
  const color = isMake ? "#22c55e" : "#ef4444";
  const d = `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`;
  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={6} opacity={opacity * 0.15} strokeLinecap="round" filter="url(#fgBlur)" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} opacity={opacity} strokeLinecap="round" />
      <circle cx={start.x} cy={start.y} r={5} fill="#3b82f6" stroke="white" strokeWidth={1.5} opacity={opacity} />
      {!short && <circle cx={end.x} cy={end.y} r={4} fill={color} stroke="white" strokeWidth={1} opacity={opacity * 0.8} />}
    </g>
  );
}

export function FGFieldView({ kicks, currentKick }: Props) {
  const [ezName, setEzName] = useState("END ZONE");
  const [ezColor, setEzColor] = useState("#991b1b");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("st_team_v1");
      if (raw) { const t = JSON.parse(raw); if (t.school) setEzName(t.school.toUpperCase()); else if (t.name) setEzName(t.name.toUpperCase()); }
    } catch {}
    try {
      const raw = localStorage.getItem("st_theme");
      if (raw) { const t = JSON.parse(raw); if (t.primary) setEzColor(t.primary); }
    } catch {}
  }, []);

  // Turf stripes every 5 yards from goal line outward
  const turfStripes: React.ReactNode[] = [];
  for (let yd = 0; yd <= 45; yd += 5) {
    const d1 = GOAL_LINE_DIST + yd;
    const d2 = GOAL_LINE_DIST + yd + 5;
    if (d1 > MAX_DIST) break;
    const isDark = Math.floor(yd / 5) % 2 === 0;
    const tl = proj(d2, 0); const tr = proj(d2, 53); const br = proj(d1, 53); const bl = proj(d1, 0);
    turfStripes.push(<polygon key={`ts-${yd}`} points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={isDark ? "#14532d" : "#166534"} />);
  }

  const yardLineEls: React.ReactNode[] = [];
  for (let yd = 0; yd <= 45; yd += 5) {
    const dist = GOAL_LINE_DIST + yd;
    if (dist > MAX_DIST) break;
    const left = proj(dist, 0); const right = proj(dist, 53);
    const isGoalLine = yd === 0; const isMajor = yd % 10 === 0;
    yardLineEls.push(<line key={`yl-${yd}`} x1={left.x} y1={left.y} x2={right.x} y2={right.y}
      stroke={isGoalLine ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)"} strokeWidth={isGoalLine ? 3 : isMajor ? 1.5 : 0.8} />);
    if (isMajor && yd > 0 && yd <= 40) {
      const numL = proj(dist, 14); const numR = proj(dist, 39);
      const fs = 12 - (dist / MAX_DIST) * 3;
      [numL, numR].forEach((p, j) => {
        yardLineEls.push(<text key={`yn-${yd}-${j}`} x={p.x} y={p.y + 1} textAnchor="middle" fontSize={fs}
          fontWeight="900" fill="rgba(255,255,255,0.2)" letterSpacing="1">{yd}</text>);
      });
    }
  }

  const postDist = 2;
  const postCenter = proj(postDist, 26.5);
  const postL = proj(postDist, 24); const postR = proj(postDist, 29);
  const crossbarY = postCenter.y;
  const uprightTopY = crossbarY - 55;

  // Pylons
  const pylons = [proj(GOAL_LINE_DIST, 0), proj(GOAL_LINE_DIST, 53), proj(0, 0), proj(0, 53)];
  const fgKicks = kicks.filter((k) => !k.isPAT);

  return (
    <div className="card-2 p-3 bg-gradient-to-b from-slate-900 to-surface-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">FG Chart</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] border border-white/40" /> Spot</span>
          <span className="flex items-center gap-1"><span className="w-5 h-[3px] rounded bg-[#22c55e]" /> Made</span>
          <span className="flex items-center gap-1"><span className="w-5 h-[3px] rounded bg-[#ef4444]" /> Miss</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mx-auto rounded-lg overflow-hidden" style={{ maxHeight: 620 }}>
        <defs>
          <linearGradient id="fg-sky2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020617" />
            <stop offset="50%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="fgBlur"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id="postGlow"><feGaussianBlur stdDeviation="2" /></filter>
        </defs>
        {/* Sky */}
        <rect x={0} y={0} width={W} height={uprightTopY + 10} fill="url(#fg-sky2)" />
        {/* Stadium lights */}
        <circle cx={W * 0.25} cy={15} r={50} fill="rgba(255,255,255,0.03)" />
        <circle cx={W * 0.75} cy={15} r={50} fill="rgba(255,255,255,0.03)" />
        {/* Full field background (behind end zone) */}
        {(() => {
          const tl = proj(MAX_DIST, 0); const tr = proj(MAX_DIST, 53); const br = proj(0, 53); const bl = proj(0, 0);
          return <polygon points={`${bl.x},${bl.y} ${br.x},${br.y} ${tr.x},${tr.y} ${tl.x},${tl.y}`} fill="#14532d" />;
        })()}
        {/* End zone */}
        {(() => {
          const gl = proj(GOAL_LINE_DIST, 0); const gr = proj(GOAL_LINE_DIST, 53); const br = proj(0, 53); const bl = proj(0, 0);
          return (<>
            <polygon points={`${bl.x},${bl.y} ${br.x},${br.y} ${gr.x},${gr.y} ${gl.x},${gl.y}`} fill={ezColor} opacity={0.4} />
            <polygon points={`${bl.x},${bl.y} ${br.x},${br.y} ${gr.x},${gr.y} ${gl.x},${gl.y}`} fill="none" stroke={ezColor} strokeWidth={1} opacity={0.6} />
          </>);
        })()}
        {/* End zone text */}
        {(() => {
          const mid = proj(GOAL_LINE_DIST / 2, 26.5);
          return <text x={mid.x} y={mid.y + 5} textAnchor="middle" fontSize={14} fontWeight="900" letterSpacing="8" fill="white" opacity={0.45}>{ezName}</text>;
        })()}
        {/* Turf stripes */}
        {turfStripes}
        {/* Sidelines */}
        {(() => {
          const bl = proj(MAX_DIST, 0); const tl = proj(0, 0); const br = proj(MAX_DIST, 53); const tr = proj(0, 53);
          return (<>
            <line x1={bl.x} y1={bl.y} x2={tl.x} y2={tl.y} stroke="white" strokeWidth={3} />
            <line x1={br.x} y1={br.y} x2={tr.x} y2={tr.y} stroke="white" strokeWidth={3} />
          </>);
        })()}
        {/* Back line */}
        {(() => { const l = proj(0, 0); const r = proj(0, 53); return <line x1={l.x} y1={l.y} x2={r.x} y2={r.y} stroke="white" strokeWidth={2} />; })()}
        {yardLineEls}
        {/* Pylons */}
        {pylons.map((p, i) => <rect key={`py-${i}`} x={p.x - 3.5} y={p.y - 3.5} width={7} height={7} fill="#f97316" stroke="#ea580c" strokeWidth={1} rx={1.5} />)}
        {/* Goalpost glow */}
        <line x1={postL.x} y1={crossbarY} x2={postR.x} y2={crossbarY} stroke="#fbbf24" strokeWidth={10} opacity={0.15} filter="url(#postGlow)" />
        <line x1={postL.x} y1={crossbarY} x2={postL.x} y2={uprightTopY} stroke="#fbbf24" strokeWidth={8} opacity={0.1} filter="url(#postGlow)" />
        <line x1={postR.x} y1={crossbarY} x2={postR.x} y2={uprightTopY} stroke="#fbbf24" strokeWidth={8} opacity={0.1} filter="url(#postGlow)" />
        {/* Goalpost solid */}
        <line x1={postCenter.x} y1={crossbarY} x2={postCenter.x} y2={crossbarY + 14} stroke="#fbbf24" strokeWidth={3.5} strokeLinecap="round" />
        <line x1={postL.x} y1={crossbarY} x2={postR.x} y2={crossbarY} stroke="#fbbf24" strokeWidth={5} strokeLinecap="round" />
        <line x1={postL.x} y1={crossbarY} x2={postL.x} y2={uprightTopY} stroke="#fbbf24" strokeWidth={3.5} strokeLinecap="round" />
        <line x1={postR.x} y1={crossbarY} x2={postR.x} y2={uprightTopY} stroke="#fbbf24" strokeWidth={3.5} strokeLinecap="round" />
        {/* Hash labels */}
        {(["LH", "LM", "M", "RM", "RH"] as FGPosition[]).map((p) => {
          const x = proj(MAX_DIST - 2, POS_LAT[p]).x;
          const y = proj(MAX_DIST - 2, POS_LAT[p]).y;
          return <text key={`hl-${p}`} x={x} y={y + 3} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.3)" fontWeight="bold">{p}</text>;
        })}
        {/* Kicks */}
        {fgKicks.map((k, i) => renderKick(i, { dist: k.dist, pos: k.pos, result: k.result }, 0.75))}
        {currentKick && currentKick.dist > 0 && renderKick("preview", currentKick, 1)}
      </svg>
      {fgKicks.length > 0 && <p className="text-[10px] text-muted text-right mt-1.5">{fgKicks.length} kick{fgKicks.length !== 1 ? "s" : ""}</p>}
    </div>
  );
}
