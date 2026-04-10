"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { KickoffEntry } from "@/types";

interface Props {
  kicks: KickoffEntry[];
  currentKick?: { los?: number; landingYL?: number; distance?: number; hangTime?: number } | null;
}

const W = 780;
const H = 380;
const PAD_X = 20;
const TOP_Y = 100;
const BOTTOM_Y = 340;
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

function hangLift(ht: number | undefined): number { const h = Math.max(0.5, Math.min(ht ?? 3, 6)); return 20 + (h / 6) * 100; }

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
  const [ezColor, setEzColor] = useState("#991b1b");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  useEffect(() => {
    try { const r = localStorage.getItem("st_theme"); if (r) { const t = JSON.parse(r); if (t.primary) setEzColor(t.primary); } } catch {}
  }, []);
  const handleArcTap = useCallback((idx: number) => {
    setSelectedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  const stripes: React.ReactNode[] = [];
  for (let fx = 0; fx < 100; fx += 5) {
    const isDark = Math.floor(fx / 5) % 2 === 0;
    const tl = proj(fx, 0); const tr = proj(fx + 5, 0); const bl = proj(fx, 53); const br = proj(fx + 5, 53);
    stripes.push(<polygon key={`s-${fx}`} points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={isDark ? "#14532d" : "#166534"} />);
  }

  const leftEZ = (() => {
    const tl = proj(-10, 0); const tr = proj(0, 0); const br = proj(0, 53); const bl = proj(-10, 53);
    return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={ezColor} opacity={0.3} />;
  })();
  const rightEZ = (() => {
    const tl = proj(100, 0); const tr = proj(110, 0); const br = proj(110, 53); const bl = proj(100, 53);
    return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={ezColor} opacity={0.3} />;
  })();

  const yardLines: React.ReactNode[] = [];
  for (let fx = 0; fx <= 100; fx += 10) {
    const far = proj(fx, 0); const near = proj(fx, 53);
    const isGoal = fx === 0 || fx === 100; const isMid = fx === 50;
    yardLines.push(<line key={`yl-${fx}`} x1={far.x} y1={far.y} x2={near.x} y2={near.y}
      stroke={isGoal ? "rgba(255,255,255,0.7)" : isMid ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
      strokeWidth={isGoal ? 2.5 : isMid ? 2 : 1} />);
    const display = fx <= 50 ? fx : 100 - fx;
    if (fx > 0 && fx < 100 && fx % 10 === 0) {
      const topPos = proj(fx, 10);
      const botPos = proj(fx, 43);
      const fs = 14 + (botPos.y - TOP_Y) / (BOTTOM_Y - TOP_Y) * 4;
      const fsTop = 10;
      const arrowDir = fx <= 50 ? -1 : 1;
      const arrowOffsetX = arrowDir * 12;
      [{ p: botPos, size: fs, k: "b" }, { p: topPos, size: fsTop, k: "t" }].forEach(({ p, size, k }) => {
        yardLines.push(
          <text key={`yn-${fx}-${k}`} x={p.x} y={p.y + size * 0.35} textAnchor="middle" fontSize={size}
            fontWeight="900" fill="rgba(255,255,255,0.2)" fontFamily="'Arial Black', sans-serif"
            letterSpacing="2" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}>{display}</text>
        );
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
            <stop offset="0%" stopColor="#020617" /><stop offset="40%" stopColor="#0f172a" /><stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="koBlur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <rect x={0} y={0} width={W} height={TOP_Y} fill="url(#ko-sky)" />
        <circle cx={W * 0.2} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        <circle cx={W * 0.8} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        {(() => { const tl = proj(-10, 0); const tr = proj(110, 0); const br = proj(110, 53); const bl = proj(-10, 53);
          return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill="#14532d" />; })()}
        {leftEZ}{rightEZ}
        {stripes}
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
        {/* Goalposts at very back of each end zone — big and facing downfield */}
        {[-9, 109].map((fx) => {
          const pc = proj(fx, 26.5); const pl = proj(fx, 15); const pr = proj(fx, 38);
          const cbY = pc.y; const utY = cbY - 35;
          return (
            <g key={`post-${fx}`}>
              <line x1={pl.x} y1={cbY} x2={pr.x} y2={cbY} stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" opacity={0.8} />
              <line x1={pl.x} y1={cbY} x2={pl.x} y2={utY} stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
              <line x1={pr.x} y1={cbY} x2={pr.x} y2={utY} stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
              <line x1={pc.x} y1={cbY} x2={pc.x} y2={cbY + 5} stroke="#fbbf24" strokeWidth={3} opacity={0.6} />
            </g>
          );
        })}
        {kicks.map((k, i) => {
          const los = k.los ?? 35; const landing = k.landingYL ?? (los + (k.distance || 0));
          if (landing <= los) return null;
          const isSelected = selectedIdx === i;
          const arc = renderArc(i, los, landing, k.hangTime, k.returnYards, isSelected ? 1 : 0.7, isSelected ? "#fbbf24" : "#f59e0b", isSelected ? 3.5 : 2.5);
          if (!arc) return null;
          const fy = 26.5;
          const s = proj(los, fy); const e = proj(landing, fy); const m = proj((los + landing) / 2, fy);
          const cpY = ((s.y + e.y) / 2) - 2 * hangLift(k.hangTime);
          const hitD = `M ${s.x} ${s.y} Q ${m.x} ${cpY} ${e.x} ${e.y}`;
          return (
            <g key={`tap-${i}`} onClick={() => handleArcTap(i)} style={{ cursor: "pointer" }}>
              <path d={hitD} fill="none" stroke="transparent" strokeWidth={16} />
              {arc}
            </g>
          );
        })}
        {currentKick && (() => {
          const los = currentKick.los ?? 35; const landing = currentKick.landingYL ?? (los + (currentKick.distance ?? 0));
          if (landing <= los) return null;
          return renderArc("preview", los, landing, currentKick.hangTime, 0, 1, "#fbbf24", 3.5);
        })()}
        {/* Tooltip for selected kickoff */}
        {selectedIdx != null && kicks[selectedIdx] && (() => {
          const k = kicks[selectedIdx];
          const los = k.los ?? 35; const landing = k.landingYL ?? (los + (k.distance || 0));
          if (landing <= los) return null;
          const fy = 26.5;
          const sP = proj(los, fy); const eP = proj(landing, fy);
          const tx = Math.max(80, Math.min(W - 80, (sP.x + eP.x) / 2));
          const ty = Math.max(55, Math.min(H - 60, (sP.y + eP.y) / 2));
          const dist = k.distance || (landing - los);
          return (
            <g>
              <rect x={tx - 75} y={ty - 28} width={150} height={36} rx={6} fill="rgba(0,0,0,0.9)" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
              <text x={tx} y={ty - 12} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#e2e8f0">{k.athlete} · #{k.kickNum ?? selectedIdx + 1}</text>
              <text x={tx} y={ty + 1} textAnchor="middle" fontSize={9} fill="#94a3b8">
                {dist > 0 ? `${dist}yd` : "—"} · {k.hangTime > 0 ? `${k.hangTime.toFixed(2)}s HT` : "—"}{k.returnYards ? ` · ${k.returnYards}yd ret` : ""}
              </text>
            </g>
          );
        })()}
      </svg>
      {kicks.length > 0 && <p className="text-[10px] text-muted text-right mt-1.5">{kicks.length} kickoff{kicks.length !== 1 ? "s" : ""} {selectedIdx != null ? "· tap arc to deselect" : "· tap an arc for details"}</p>}
    </div>
  );
}
