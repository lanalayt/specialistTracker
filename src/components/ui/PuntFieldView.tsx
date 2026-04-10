"use client";

import React, { useEffect, useState } from "react";
import type { PuntEntry } from "@/types";

interface Props {
  punts: PuntEntry[];
  currentPunt?: { los: number; landingYL: number; hangTime?: number; hash?: string } | null;
}

const W = 780;
const H = 380;
const PAD_X = 20;
const TOP_Y = 100;
const BOTTOM_Y = 340;
// Field range includes end zones: -10 to 110
const FIELD_MIN = -10;
const FIELD_MAX = 110;
const FIELD_RANGE = FIELD_MAX - FIELD_MIN;

function proj(fieldX: number, fieldY: number): { x: number; y: number } {
  const yT = Math.max(0, Math.min(1, fieldY / 53));
  const y = TOP_Y + yT * (BOTTOM_Y - TOP_Y);
  const scale = 0.88 + yT * 0.12;
  const halfWidth = (W - 2 * PAD_X) / 2 * scale;
  const xT = ((fieldX - (FIELD_MIN + FIELD_MAX) / 2) / (FIELD_RANGE / 2));
  return { x: W / 2 + xT * halfWidth, y };
}

function hashToFieldY(hash: string | undefined): number {
  switch (hash) { case "LH": return 18; case "LM": return 22; case "M": return 26.5; case "RM": return 31; case "RH": return 35; default: return 26.5; }
}
function hangLift(ht: number | undefined): number { const h = Math.max(0.5, Math.min(ht ?? 3, 6)); return 20 + (h / 6) * 100; }

function renderArc(key: string | number, los: number, landing: number, ht: number | undefined, retYds: number | undefined, fc: boolean, hash: string | undefined, opacity: number, color = "#06b6d4", sw = 2.5) {
  if (landing <= los) return null;
  const fy = hashToFieldY(hash);
  const s = proj(los, fy); const e = proj(landing, fy); const m = proj((los + landing) / 2, fy);
  const lift = hangLift(ht);
  const cpY = ((s.y + e.y) / 2) - 2 * lift;
  const d = `M ${s.x} ${s.y} Q ${m.x} ${cpY} ${e.x} ${e.y}`;
  let ret: React.ReactNode = null;
  if (!fc && (retYds ?? 0) > 0) {
    const re = proj(Math.max(los, landing - (retYds ?? 0)), fy);
    ret = <line x1={e.x} y1={e.y} x2={re.x} y2={re.y} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5,3" opacity={opacity} />;
  }
  const fcM = fc ? <text x={e.x} y={e.y - 10} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#a78bfa" opacity={opacity}>FC</text> : null;
  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={sw + 4} opacity={opacity * 0.15} strokeLinecap="round" filter="url(#pvBlur)" />
      <path d={d} fill="none" stroke={color} strokeWidth={sw} opacity={opacity} strokeLinecap="round" />
      <circle cx={s.x} cy={s.y} r={5} fill="#3b82f6" stroke="white" strokeWidth={1.5} opacity={opacity} />
      <circle cx={e.x} cy={e.y} r={5} fill="#ef4444" stroke="white" strokeWidth={1.5} opacity={opacity} />
      {ret}{fcM}
    </g>
  );
}

export function PuntFieldView({ punts, currentPunt }: Props) {
  const [ezColor, setEzColor] = useState("#991b1b");
  useEffect(() => {
    try { const r = localStorage.getItem("st_theme"); if (r) { const t = JSON.parse(r); if (t.primary) setEzColor(t.primary); } } catch {}
  }, []);

  // Turf stripes (playing field only: 0-100)
  const stripes: React.ReactNode[] = [];
  for (let fx = 0; fx < 100; fx += 5) {
    const isDark = Math.floor(fx / 5) % 2 === 0;
    const tl = proj(fx, 0); const tr = proj(fx + 5, 0); const bl = proj(fx, 53); const br = proj(fx + 5, 53);
    stripes.push(<polygon key={`s-${fx}`} points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={isDark ? "#14532d" : "#166534"} />);
  }

  // End zones
  const leftEZ = (() => {
    const tl = proj(-10, 0); const tr = proj(0, 0); const br = proj(0, 53); const bl = proj(-10, 53);
    return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={ezColor} opacity={0.3} />;
  })();
  const rightEZ = (() => {
    const tl = proj(100, 0); const tr = proj(110, 0); const br = proj(110, 53); const bl = proj(100, 53);
    return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={ezColor} opacity={0.3} />;
  })();

  // Yard lines + field numbers
  const yardLines: React.ReactNode[] = [];
  for (let fx = 0; fx <= 100; fx += 10) {
    const far = proj(fx, 0); const near = proj(fx, 53);
    const isGoal = fx === 0 || fx === 100; const isMid = fx === 50;
    yardLines.push(<line key={`yl-${fx}`} x1={far.x} y1={far.y} x2={near.x} y2={near.y}
      stroke={isGoal ? "rgba(255,255,255,0.7)" : isMid ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
      strokeWidth={isGoal ? 2.5 : isMid ? 2 : 1} />);
    const display = fx <= 50 ? fx : 100 - fx;
    if (fx > 0 && fx < 100 && fx % 10 === 0) {
      // Top side numbers (between far sideline and far hash) — upside down on real field
      const topPos = proj(fx, 10);
      // Bottom side numbers (between near hash and near sideline)
      const botPos = proj(fx, 43);
      const fs = 14 + (botPos.y - TOP_Y) / (BOTTOM_Y - TOP_Y) * 4; // bigger near bottom
      const fsTop = 10;
      // Directional arrow: triangle pointing toward nearest end zone
      const arrowDir = fx <= 50 ? -1 : 1; // -1 = left, 1 = right
      const arrowOffsetX = arrowDir * 12;
      [{ p: botPos, size: fs, k: "b" }, { p: topPos, size: fsTop, k: "t" }].forEach(({ p, size, k }) => {
        yardLines.push(
          <text key={`yn-${fx}-${k}`} x={p.x} y={p.y + size * 0.35} textAnchor="middle" fontSize={size}
            fontWeight="900" fill="rgba(255,255,255,0.2)" fontFamily="'Arial Black', sans-serif"
            letterSpacing="2" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}>{display}</text>
        );
        // Arrow
        if (display !== 50) {
          const ax = p.x + arrowOffsetX * (size / 14);
          const ay = p.y + size * 0.15;
          const as = size * 0.25;
          yardLines.push(
            <polygon key={`ya-${fx}-${k}`}
              points={`${ax - as},${ay - as} ${ax + as * arrowDir},${ay} ${ax - as},${ay + as}`}
              fill="rgba(255,255,255,0.15)" />
          );
        }
      });
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
            <stop offset="0%" stopColor="#020617" /><stop offset="40%" stopColor="#0f172a" /><stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="pvBlur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <rect x={0} y={0} width={W} height={TOP_Y} fill="url(#pv-sky)" />
        <circle cx={W * 0.2} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        <circle cx={W * 0.8} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        {/* Field base */}
        {(() => { const tl = proj(-10, 0); const tr = proj(110, 0); const br = proj(110, 53); const bl = proj(-10, 53);
          return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill="#14532d" />; })()}
        {leftEZ}{rightEZ}
        {stripes}
        {/* Sidelines (full field + end zones) */}
        {(() => { const tl = proj(-10, 0); const tr = proj(110, 0); const bl = proj(-10, 53); const br = proj(110, 53);
          return (<>
            <line x1={tl.x} y1={tl.y} x2={tr.x} y2={tr.y} stroke="white" strokeWidth={3} />
            <line x1={bl.x} y1={bl.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={3} />
            <line x1={tl.x} y1={tl.y} x2={bl.x} y2={bl.y} stroke="white" strokeWidth={2} />
            <line x1={tr.x} y1={tr.y} x2={br.x} y2={br.y} stroke="white" strokeWidth={2} />
          </>); })()}
        {yardLines}
        {/* Hash marks */}
        {Array.from({ length: 100 }, (_, yd) => yd + 1).map((yd) => {
          return [18.5, 34.5].map((lat) => {
            const a = proj(yd, lat - 0.3); const b = proj(yd, lat + 0.3);
            return <line key={`h-${yd}-${lat}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} />;
          });
        })}
        {/* Goalposts at back of each end zone */}
        {[-7, 107].map((fx) => {
          const pc = proj(fx, 26.5); const pl = proj(fx, 21); const pr = proj(fx, 32);
          const cbY = pc.y; const utY = cbY - 18;
          return (
            <g key={`post-${fx}`}>
              <line x1={pl.x} y1={cbY} x2={pr.x} y2={cbY} stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
              <line x1={pl.x} y1={cbY} x2={pl.x} y2={utY} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
              <line x1={pr.x} y1={cbY} x2={pr.x} y2={utY} stroke="#fbbf24" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
              <line x1={pc.x} y1={cbY} x2={pc.x} y2={cbY + 4} stroke="#fbbf24" strokeWidth={2} opacity={0.5} />
            </g>
          );
        })}
        {punts.map((p, i) => { if (p.los == null || p.landingYL == null) return null; return renderArc(i, p.los, p.landingYL, p.hangTime, p.returnYards, !!p.fairCatch, p.hash, 0.7); })}
        {currentPunt && currentPunt.landingYL > currentPunt.los && renderArc("preview", currentPunt.los, currentPunt.landingYL, currentPunt.hangTime, 0, false, currentPunt.hash, 1, "#22d3ee", 3.5)}
      </svg>
      {punts.length > 0 && <p className="text-[10px] text-muted text-right mt-1.5">{punts.length} punt{punts.length !== 1 ? "s" : ""}</p>}
    </div>
  );
}
