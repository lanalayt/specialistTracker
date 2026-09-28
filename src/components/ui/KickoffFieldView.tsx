"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentTheme } from "@/lib/themeColors";
import { koNetYards } from "@/lib/stats";
import type { KickoffEntry, KickoffHash } from "@/types";

interface Props {
  kicks: KickoffEntry[];
  currentKick?: { los?: number; landingYL?: number; distance?: number; hangTime?: number } | null;
  // When provided, the landing dot on each kick becomes draggable — up/down
  // only, snapping to the nearest hash — and this fires with the patch to
  // apply once the coach lets go. Omit to keep the view read-only (tap only).
  onMove?: (kick: KickoffEntry, patch: Partial<KickoffEntry>) => void;
}

const W = 780;
const H = 380;
const PAD_X = 20;
const TOP_Y = 100;
const BOTTOM_Y = 340;
// Playing surface runs -10 (back of left end zone) to 110 (back of right end zone).
// The drawn area extends past both back lines so kickoffs that carry out of the end
// zone keep going instead of piling up on the goal line: from the own 35, 70 yds
// lands mid end zone (105), 75 at the back line (110), 80 five yds out the back (115).
const GOAL_MIN = 0;
const GOAL_MAX = 100;
const BACK_MIN = -10;
const BACK_MAX = 110;
const FIELD_MIN = -20;
const FIELD_MAX = 120;
const FIELD_RANGE = FIELD_MAX - FIELD_MIN;

function proj(fieldX: number, fieldY: number): { x: number; y: number } {
  const yT = Math.max(0, Math.min(1, fieldY / 53));
  const y = TOP_Y + yT * (BOTTOM_Y - TOP_Y);
  const scale = 0.88 + yT * 0.12;
  const halfWidth = (W - 2 * PAD_X) / 2 * scale;
  const xT = ((fieldX - (FIELD_MIN + FIELD_MAX) / 2) / (FIELD_RANGE / 2));
  return { x: W / 2 + xT * halfWidth, y };
}

// Inverse of proj()'s Y mapping — screen Y back to lateral field position
// (0-53), used while dragging the landing dot.
function screenYToFieldY(y: number): number {
  const yT = Math.max(0, Math.min(1, (y - TOP_Y) / (BOTTOM_Y - TOP_Y)));
  return yT * 53;
}

const KO_HASH_Y: Record<KickoffHash, number> = { LH: 18, LM: 22, M: 26.5, RM: 31, RH: 35 };
function koHashToFieldY(hash: string | undefined): number {
  return KO_HASH_Y[hash as KickoffHash] ?? 26.5;
}
// Snap a raw lateral field position to whichever hash it's closest to.
function nearestHash(fieldY: number): KickoffHash {
  let best: KickoffHash = "M";
  let bestDist = Infinity;
  (Object.keys(KO_HASH_Y) as KickoffHash[]).forEach((h) => {
    const d = Math.abs(KO_HASH_Y[h] - fieldY);
    if (d < bestDist) { bestDist = d; best = h; }
  });
  return best;
}

// Keep an absurd distance inside the drawn area; real kickoffs stay well short of this.
function clampToField(fieldX: number): number { return Math.max(FIELD_MIN, Math.min(FIELD_MAX, fieldX)); }

// Landing spot is fully determined by the tee and the distance kicked, so prefer
// that over a stored landingYL (older sessions saved it capped at the goal line).
function landingSpot(k: { los?: number; landingYL?: number; distance?: number }): number {
  const los = k.los ?? 35;
  if ((k.distance ?? 0) > 0) return los + (k.distance as number);
  return k.landingYL ?? los;
}

function hangLift(ht: number | undefined): number { const h = Math.max(0.5, Math.min(ht ?? 3, 6)); return 20 + (h / 6) * 100; }

// Yards the return traveled back from the landing spot, derived from where the
// return ended (returnToYL, the receiving team's own yard line) rather than a
// raw yards-gained number.
function returnRunYds(k: { los?: number; landingYL?: number; distance?: number; returnToYL?: number }): number {
  if (k.returnToYL == null) return 0;
  const landing = landingSpot(k);
  const endSpot = 100 - k.returnToYL;
  return Math.max(0, landing - endSpot);
}

function renderArc(key: string | number, los: number, landingRaw: number, fy: number, ht: number | undefined, retYds: number | undefined, opacity: number, color = "#f59e0b", sw = 2.5) {
  const landing = clampToField(landingRaw);
  if (landing <= los) return null;
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

export function KickoffFieldView({ kicks, currentKick, onMove }: Props) {
  const [ezColor, setEzColor] = useState("#991b1b");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragFieldY, setDragFieldY] = useState<number>(26.5);
  useEffect(() => {
    const t = getCurrentTheme(); if (t.primary) setEzColor(t.primary);
  }, []);
  const handleArcTap = useCallback((idx: number) => {
    setSelectedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  const toFieldY = useCallback((clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return 26.5;
    const rect = svg.getBoundingClientRect();
    const scaleY = H / rect.height;
    return screenYToFieldY((clientY - rect.top) * scaleY);
  }, []);

  // Distinguishes a tap (show the tooltip, as before) from an actual drag
  // (reposition) — a pointer that never moves more than a few px is a tap.
  const dragStartClientY = useRef(0);
  const DRAG_THRESHOLD = 4;
  // Touch/pen must be pressed-and-held before a drag engages, so a normal
  // tap (or a scroll gesture that happens to start on a dot) isn't mistaken
  // for a reposition. Mouse still drags immediately on click, as before.
  const LONG_PRESS_MS = 350;
  const PRESS_CANCEL_PX = 10;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef({ x: 0, y: 0 });
  const pendingIdx = useRef<number | null>(null);

  const armDrag = useCallback((idx: number, el: Element, pointerId: number, clientY: number) => {
    el.setPointerCapture?.(pointerId);
    dragStartClientY.current = clientY;
    setDragIdx(idx);
    setDragFieldY(koHashToFieldY(kicks[idx]?.hash));
  }, [kicks]);

  const handleDragStart = useCallback((idx: number, e: React.PointerEvent) => {
    if (!onMove) return;
    e.stopPropagation();
    if (e.pointerType === "mouse") {
      armDrag(idx, e.target as Element, e.pointerId, e.clientY);
      return;
    }
    const el = e.target as Element;
    const pointerId = e.pointerId;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pendingIdx.current = idx;
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      armDrag(idx, el, pointerId, pressStart.current.y);
    }, LONG_PRESS_MS);
  }, [onMove, armDrag]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (pressTimer.current != null) {
      const dx = e.clientX - pressStart.current.x;
      const dy = e.clientY - pressStart.current.y;
      if (Math.hypot(dx, dy) > PRESS_CANCEL_PX) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
        pendingIdx.current = null;
      }
      return;
    }
    if (dragIdx == null) return;
    setDragFieldY(toFieldY(e.clientY));
  }, [dragIdx, toFieldY]);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (pressTimer.current != null) {
      // Released before the hold finished — treat it as a plain tap.
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      const idx = pendingIdx.current;
      pendingIdx.current = null;
      if (idx != null) handleArcTap(idx);
      return;
    }
    if (dragIdx == null) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const idx = dragIdx;
    const k = kicks[idx];
    const moved = Math.abs(e.clientY - dragStartClientY.current) >= DRAG_THRESHOLD;
    setDragIdx(null);
    if (!moved) { handleArcTap(idx); return; }
    const hash = nearestHash(toFieldY(e.clientY));
    if (k && onMove && hash !== k.hash) onMove(k, { hash });
  }, [dragIdx, kicks, onMove, toFieldY, handleArcTap]);

  const stripes: React.ReactNode[] = [];
  for (let fx = 0; fx < 100; fx += 5) {
    const isDark = Math.floor(fx / 5) % 2 === 0;
    const tl = proj(fx, 0); const tr = proj(fx + 5, 0); const bl = proj(fx, 53); const br = proj(fx + 5, 53);
    stripes.push(<polygon key={`s-${fx}`} points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={isDark ? "#14532d" : "#166534"} />);
  }

  const leftEZ = (() => {
    const tl = proj(BACK_MIN, 0); const tr = proj(GOAL_MIN, 0); const br = proj(GOAL_MIN, 53); const bl = proj(BACK_MIN, 53);
    return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={ezColor} opacity={0.3} />;
  })();
  const rightEZ = (() => {
    const tl = proj(GOAL_MAX, 0); const tr = proj(BACK_MAX, 0); const br = proj(BACK_MAX, 53); const bl = proj(GOAL_MAX, 53);
    return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={ezColor} opacity={0.3} />;
  })();

  // Faint 5-yard ticks on the apron past each back line, so a kick that carries
  // out of the end zone still reads at a glance (115 = 5 yds out the back).
  const overrunLines: React.ReactNode[] = [];
  for (const fx of [BACK_MIN - 5, BACK_MIN - 10, BACK_MAX + 5, BACK_MAX + 10]) {
    const far = proj(fx, 0); const near = proj(fx, 53);
    overrunLines.push(<line key={`ov-${fx}`} x1={far.x} y1={far.y} x2={near.x} y2={near.y}
      stroke="rgba(255,255,255,0.09)" strokeWidth={1} strokeDasharray="4,5" />);
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
      const topPos = proj(fx, 10);
      const botPos = proj(fx, 43);
      const fs = 14 + (botPos.y - TOP_Y) / (BOTTOM_Y - TOP_Y) * 4;
      const fsTop = 10;
      const arrowDir = fx <= 50 ? -1 : 1;
      const arrowOffsetX = arrowDir * 16;
      const arrowGapPx = 4; // clearance so the arrow never touches the number
      [{ p: botPos, size: fs, k: "b" }, { p: topPos, size: fsTop, k: "t" }].forEach(({ p, size, k }) => {
        yardLines.push(
          <text key={`yn-${fx}-${k}`} x={p.x} y={p.y + size * 0.35} textAnchor="middle" fontSize={size}
            fontWeight="900" fill="rgba(255,255,255,0.2)" fontFamily="'Arial Black', sans-serif"
            letterSpacing="2" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}>{display}</text>
        );
        // Arrow — mirrored by arrowDir so it actually points left on the
        // left half of the field, offset clear of the digits.
        if (display !== 50) {
          const ax = p.x + arrowOffsetX * (size / 14) + arrowDir * arrowGapPx;
          const ay = p.y + size * 0.15;
          const as = size * 0.25;
          const tipX = ax + as * arrowDir;
          const baseX = ax - as * arrowDir;
          yardLines.push(
            <polygon key={`ya-${fx}-${k}`}
              points={`${baseX},${ay - as} ${tipX},${ay} ${baseX},${ay + as}`}
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
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-lg overflow-hidden"
        style={{ maxHeight: 380, touchAction: dragIdx != null ? "none" : undefined }}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <defs>
          <linearGradient id="ko-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020617" /><stop offset="40%" stopColor="#0f172a" /><stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="koBlur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <rect x={0} y={0} width={W} height={TOP_Y} fill="url(#ko-sky)" />
        <circle cx={W * 0.2} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        <circle cx={W * 0.8} cy={10} r={60} fill="rgba(255,255,255,0.02)" />
        {/* Apron beyond the back of each end zone — where a long kick keeps carrying */}
        {(() => { const tl = proj(FIELD_MIN, 0); const tr = proj(FIELD_MAX, 0); const br = proj(FIELD_MAX, 53); const bl = proj(FIELD_MIN, 53);
          return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill="#0b1220" />; })()}
        {(() => { const tl = proj(BACK_MIN, 0); const tr = proj(BACK_MAX, 0); const br = proj(BACK_MAX, 53); const bl = proj(BACK_MIN, 53);
          return <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill="#14532d" />; })()}
        {overrunLines}
        {leftEZ}{rightEZ}
        {stripes}
        {(() => { const tl = proj(BACK_MIN, 0); const tr = proj(BACK_MAX, 0); const bl = proj(BACK_MIN, 53); const br = proj(BACK_MAX, 53);
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
            const a = proj(yd, lat - 0.45); const b = proj(yd, lat + 0.45);
            return <line key={`h-${yd}-${lat}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.4)" strokeWidth={1.4} />;
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
          const los = k.los ?? 35; const landing = clampToField(landingSpot(k));
          if (landing <= los) return null;
          const isSelected = selectedIdx === i;
          const isDragging = dragIdx === i;
          const fy = isDragging ? dragFieldY : koHashToFieldY(k.hash);
          const arc = renderArc(i, los, landing, fy, k.hangTime, returnRunYds(k), isSelected || isDragging ? 1 : 0.7, isSelected || isDragging ? "#fbbf24" : "#f59e0b", isSelected || isDragging ? 3.5 : 2.5);
          if (!arc) return null;
          const s = proj(los, fy); const e = proj(landing, fy); const m = proj((los + landing) / 2, fy);
          const cpY = ((s.y + e.y) / 2) - 2 * hangLift(k.hangTime);
          const hitD = `M ${s.x} ${s.y} Q ${m.x} ${cpY} ${e.x} ${e.y}`;
          return (
            <g key={`tap-${i}`}>
              <g onClick={() => handleArcTap(i)} style={{ cursor: "pointer" }}>
                <path d={hitD} fill="none" stroke="transparent" strokeWidth={16} />
                {arc}
              </g>
              {onMove && (
                <circle
                  cx={e.x} cy={e.y} r={12} fill="transparent"
                  style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
                  onPointerDown={(ev) => handleDragStart(i, ev)}
                />
              )}
            </g>
          );
        })}
        {currentKick && (() => {
          const los = currentKick.los ?? 35; const landing = clampToField(landingSpot(currentKick));
          if (landing <= los) return null;
          return renderArc("preview", los, landing, 26.5, currentKick.hangTime, 0, 1, "#fbbf24", 3.5);
        })()}
        {/* Tooltip for selected kickoff */}
        {selectedIdx != null && dragIdx == null && kicks[selectedIdx] && (() => {
          const k = kicks[selectedIdx];
          const los = k.los ?? 35; const landing = clampToField(landingSpot(k));
          if (landing <= los) return null;
          const fy = koHashToFieldY(k.hash);
          const sP = proj(los, fy); const eP = proj(landing, fy);
          const tx = Math.max(80, Math.min(W - 80, (sP.x + eP.x) / 2));
          const ty = Math.max(55, Math.min(H - 60, (sP.y + eP.y) / 2));
          const dist = k.distance || (landingSpot(k) - los);
          const net = koNetYards(k);
          return (
            <g>
              <rect x={tx - 75} y={ty - 28} width={150} height={36} rx={6} fill="rgba(0,0,0,0.9)" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
              <text x={tx} y={ty - 12} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#e2e8f0">{k.athlete} · #{k.kickNum ?? selectedIdx + 1}</text>
              <text x={tx} y={ty + 1} textAnchor="middle" fontSize={9} fill="#94a3b8">
                {dist > 0 ? `${dist}yd` : "—"} · {k.hangTime > 0 ? `${k.hangTime.toFixed(2)}s HT` : "—"}{net != null ? ` · ${net}yd net` : ""}
              </text>
            </g>
          );
        })()}
      </svg>
      {kicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1.5">
          {kicks.length} kickoff{kicks.length !== 1 ? "s" : ""} {selectedIdx != null ? "· tap arc to deselect" : "· tap an arc for details"}{onMove ? " · click-drag (or press & hold) the landing dot to fix its hash" : ""}
        </p>
      )}
    </div>
  );
}
