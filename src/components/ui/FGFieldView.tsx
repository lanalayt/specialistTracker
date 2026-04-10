"use client";

import React, { useEffect, useState } from "react";
import type { FGKick, FGPosition } from "@/types";

interface Props {
  kicks: FGKick[];
  currentKick?: { dist: number; pos?: string; result?: string } | null;
}

const W = 520;
const H = 480;
const BOTTOM_Y = H - 14;
const TOP_Y = 60;
const NEAR_HALF_W = 240;
const FAR_HALF_W = 55;
const CENTER_X = W / 2;
const MAX_DIST = 60;
const EZ_DEPTH = 4; // thin end zone in perspective (visually compressed)
const GOAL_LINE_DIST = EZ_DEPTH;

function proj(dist: number, lat: number): { x: number; y: number } {
  const t = 1 - Math.max(0, Math.min(1, dist / MAX_DIST));
  const y = BOTTOM_Y - t * (BOTTOM_Y - TOP_Y);
  const halfW = NEAR_HALF_W - t * (NEAR_HALF_W - FAR_HALF_W);
  const normLat = (lat - 26.5) / 53;
  return { x: CENTER_X + normLat * halfW * 2, y };
}

const HASH_L = 18.5;
const HASH_R = 34.5;
const POS_LAT: Record<FGPosition, number> = { LH: HASH_L, LM: 22, M: 26.5, RM: 31, RH: HASH_R };
function posLat(pos: string | undefined): number { return POS_LAT[pos as FGPosition] ?? 26.5; }

// Made kicks end between the uprights ABOVE the crossbar
// Missed L/R end outside the uprights, XS ends short
function resultEndLat(r: string): number {
  switch (r) { case "YC": return 26.5; case "YL": return 23; case "YR": return 30; case "XL": return 16; case "XR": return 37; default: return 26.5; }
}
function kickerDist(d: number): number { return Math.max(8, Math.min(d, MAX_DIST - 2)); }

// Uprights screen position (at dist=0)
const UPRIGHT_L = proj(0, 20);
const UPRIGHT_R = proj(0, 33);
const POST_CENTER = proj(0, 26.5);
const CROSSBAR_Y = POST_CENTER.y;
const UPRIGHT_TOP_Y = CROSSBAR_Y - 90; // tall uprights

function renderKick(key: string | number, kick: { dist: number; pos?: string; result?: string }, opacity: number) {
  const distance = kick.dist || 0;
  if (distance <= 0) return null;
  const isMake = typeof kick.result === "string" && kick.result.startsWith("Y");
  const isShort = kick.result === "XS";
  const startDist = kickerDist(distance);
  const startLat = posLat(kick.pos);
  const start = proj(startDist, startLat);

  // End point: makes go to the uprights (dist=0) and above crossbar
  // Misses go to dist=0 but laterally outside the uprights (or short)
  const endLat = resultEndLat(kick.result || "");
  let end: { x: number; y: number };
  if (isShort) {
    end = proj((startDist + GOAL_LINE_DIST) / 2, endLat);
  } else {
    end = proj(0, endLat);
    if (isMake) {
      // Push the endpoint ABOVE the crossbar (between uprights)
      end.y = CROSSBAR_Y - 25;
    }
  }

  const midDist = isShort ? (startDist + (startDist + GOAL_LINE_DIST) / 2) / 2 : startDist / 2;
  const midLat = (startLat + endLat) / 2;
  const mid = proj(midDist, midLat);
  const arcLift = 30 + (distance / 60) * 50;
  mid.y -= arcLift;

  const color = isMake ? "#22c55e" : "#ef4444";
  const d = `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`;
  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={7} opacity={opacity * 0.12} strokeLinecap="round" filter="url(#fgBlur)" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} opacity={opacity} strokeLinecap="round" />
      <circle cx={start.x} cy={start.y} r={5} fill="#3b82f6" stroke="white" strokeWidth={1.5} opacity={opacity} />
      {!isShort && <circle cx={end.x} cy={end.y} r={4} fill={color} stroke="white" strokeWidth={1} opacity={opacity * 0.8} />}
    </g>
  );
}

export function FGFieldView({ kicks, currentKick }: Props) {
  const [ezColor, setEzColor] = useState("#991b1b");
  useEffect(() => {
    try { const r = localStorage.getItem("st_theme"); if (r) { const t = JSON.parse(r); if (t.primary) setEzColor(t.primary); } } catch {}
  }, []);

  // Turf stripes
  const stripes: React.ReactNode[] = [];
  for (let yd = 0; yd <= 55; yd += 5) {
    const d1 = GOAL_LINE_DIST + yd; const d2 = d1 + 5;
    if (d1 > MAX_DIST) break;
    const isDark = Math.floor(yd / 5) % 2 === 0;
    const tl = proj(d2, 0); const tr = proj(d2, 53); const br = proj(d1, 53); const bl = proj(d1, 0);
    stripes.push(<polygon key={`s-${yd}`} points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={isDark ? "#15532d" : "#166534"} />);
  }

  // Yard lines + field numbers
  const yardEls: React.ReactNode[] = [];
  for (let yd = 0; yd <= 55; yd += 5) {
    const dist = GOAL_LINE_DIST + yd;
    if (dist > MAX_DIST) break;
    const l = proj(dist, 0); const r = proj(dist, 53);
    const isGL = yd === 0; const is10 = yd % 10 === 0;
    yardEls.push(<line key={`yl-${yd}`} x1={l.x} y1={l.y} x2={r.x} y2={r.y}
      stroke={isGL ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)"} strokeWidth={isGL ? 3 : is10 ? 1.5 : 0.7} />);
    if (is10 && yd > 0 && yd <= 50) {
      // Numbers between hash and sideline on each side — big block style
      const nL = proj(dist, 10); const nR = proj(dist, 43);
      // Scale font with perspective (closer = bigger)
      const scale = 1 - (dist / MAX_DIST) * 0.5;
      const fs = Math.max(10, 18 * scale);
      [nL, nR].forEach((p, j) => {
        yardEls.push(
          <text key={`yn-${yd}-${j}`} x={p.x} y={p.y + fs * 0.35} textAnchor="middle" fontSize={fs}
            fontWeight="900" fill="rgba(255,255,255,0.2)" fontFamily="'Arial Black', sans-serif"
            letterSpacing="2" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}>{yd}</text>
        );
        // Directional arrow pointing toward goal line
        if (yd < 50) {
          const ay = p.y + fs * 0.15;
          const as = fs * 0.2;
          // Arrow points "up" (toward goal line = lower dist = higher on screen)
          yardEls.push(
            <polygon key={`ya-${yd}-${j}`}
              points={`${p.x - as},${ay} ${p.x},${ay - as * 1.5} ${p.x + as},${ay}`}
              fill="rgba(255,255,255,0.12)" />
          );
        }
      });
    }
  }

  // Hash marks
  const hashEls: React.ReactNode[] = [];
  for (let yd = 1; yd <= 55; yd++) {
    const dist = GOAL_LINE_DIST + yd;
    if (dist > MAX_DIST) break;
    [HASH_L, HASH_R].forEach((lat) => {
      const a = proj(dist, lat - 0.3); const b = proj(dist, lat + 0.3);
      hashEls.push(<line key={`h-${yd}-${lat}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />);
    });
  }

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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mx-auto rounded-lg overflow-hidden" style={{ maxHeight: 500 }}>
        <defs>
          <linearGradient id="fg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020617" /><stop offset="50%" stopColor="#0f172a" /><stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="fgBlur"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id="pglow"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        {/* Sky */}
        <rect x={0} y={0} width={W} height={UPRIGHT_TOP_Y + 10} fill="url(#fg-sky)" />
        <circle cx={W * 0.25} cy={12} r={40} fill="rgba(255,255,255,0.03)" />
        <circle cx={W * 0.75} cy={12} r={40} fill="rgba(255,255,255,0.03)" />
        {/* Field base */}
        {(() => { const tl = proj(MAX_DIST, 0); const tr = proj(MAX_DIST, 53); const br = proj(0, 53); const bl = proj(0, 0);
          return <polygon points={`${bl.x},${bl.y} ${br.x},${br.y} ${tr.x},${tr.y} ${tl.x},${tl.y}`} fill="#14532d" />; })()}
        {/* End zone — thin rectangle */}
        {(() => { const gl = proj(GOAL_LINE_DIST, 0); const gr = proj(GOAL_LINE_DIST, 53); const br = proj(0, 53); const bl = proj(0, 0);
          return <polygon points={`${bl.x},${bl.y} ${br.x},${br.y} ${gr.x},${gr.y} ${gl.x},${gl.y}`} fill={ezColor} opacity={0.35} />; })()}
        {stripes}
        {/* Sidelines */}
        {(() => { const a = proj(MAX_DIST, 0); const b = proj(0, 0); const c = proj(MAX_DIST, 53); const d = proj(0, 53);
          return (<><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="white" strokeWidth={3} /><line x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke="white" strokeWidth={3} /></>); })()}
        {(() => { const l = proj(0, 0); const r = proj(0, 53); return <line x1={l.x} y1={l.y} x2={r.x} y2={r.y} stroke="white" strokeWidth={2} />; })()}
        {yardEls}
        {hashEls}
        {pylons.map((p, i) => <rect key={`py-${i}`} x={p.x - 3} y={p.y - 3} width={6} height={6} fill="#f97316" stroke="#ea580c" strokeWidth={1} rx={1.5} />)}

        {/* GOALPOST — big and prominent at dist=0 */}
        {/* Glow */}
        <line x1={UPRIGHT_L.x} y1={CROSSBAR_Y} x2={UPRIGHT_R.x} y2={CROSSBAR_Y} stroke="#fbbf24" strokeWidth={14} opacity={0.1} filter="url(#pglow)" />
        <line x1={UPRIGHT_L.x} y1={CROSSBAR_Y} x2={UPRIGHT_L.x} y2={UPRIGHT_TOP_Y} stroke="#fbbf24" strokeWidth={10} opacity={0.08} filter="url(#pglow)" />
        <line x1={UPRIGHT_R.x} y1={CROSSBAR_Y} x2={UPRIGHT_R.x} y2={UPRIGHT_TOP_Y} stroke="#fbbf24" strokeWidth={10} opacity={0.08} filter="url(#pglow)" />
        {/* Solid post */}
        <line x1={POST_CENTER.x} y1={CROSSBAR_Y} x2={POST_CENTER.x} y2={CROSSBAR_Y + 12} stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" />
        <line x1={UPRIGHT_L.x} y1={CROSSBAR_Y} x2={UPRIGHT_R.x} y2={CROSSBAR_Y} stroke="#fbbf24" strokeWidth={6} strokeLinecap="round" />
        <line x1={UPRIGHT_L.x} y1={CROSSBAR_Y} x2={UPRIGHT_L.x} y2={UPRIGHT_TOP_Y} stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" />
        <line x1={UPRIGHT_R.x} y1={CROSSBAR_Y} x2={UPRIGHT_R.x} y2={UPRIGHT_TOP_Y} stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" />

        {/* Hash labels at bottom */}
        {(["LH", "LM", "M", "RM", "RH"] as FGPosition[]).map((p) => {
          const pt = proj(MAX_DIST - 1, POS_LAT[p]);
          return <text key={`hl-${p}`} x={pt.x} y={pt.y + 3} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.25)" fontWeight="bold">{p}</text>;
        })}

        {/* Kicks rendered AFTER uprights so arcs draw on top */}
        {fgKicks.map((k, i) => renderKick(i, { dist: k.dist, pos: k.pos, result: k.result }, 0.75))}
        {currentKick && currentKick.dist > 0 && renderKick("preview", currentKick, 1)}
      </svg>
      {fgKicks.length > 0 && <p className="text-[10px] text-muted text-right mt-1.5">{fgKicks.length} kick{fgKicks.length !== 1 ? "s" : ""}</p>}
    </div>
  );
}
