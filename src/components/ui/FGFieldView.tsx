"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentTheme } from "@/lib/themeColors";
import type { FGKick, FGPosition, FGResult } from "@/types";

interface Props {
  kicks: FGKick[];
  currentKick?: { dist: number; pos?: string; result?: string } | null;
  // When provided, the end dot on a make/miss-with-direction kick (YC/YL/YR/
  // XL/XR — not XS/XB/X, which have no real lateral position to drag) becomes
  // draggable left/right, constrained to the kick's own make-or-miss side of
  // the uprights, and this fires with the patch to apply once the coach lets
  // go. Omit to keep the view read-only (tap only).
  onMove?: (kick: FGKick, patch: Partial<FGKick>) => void;
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

// Inverse of proj()'s X mapping at a fixed dist — screen x back to lateral
// field position, used while dragging the end dot (whose dist never changes).
function screenXToLat(x: number, dist: number): number {
  const t = 1 - Math.max(0, Math.min(1, dist / MAX_DIST));
  const halfW = NEAR_HALF_W - t * (NEAR_HALF_W - FAR_HALF_W);
  const normLat = (x - CENTER_X) / (halfW * 2);
  return normLat * 53 + 26.5;
}

const HASH_L = 18.5;
const HASH_R = 34.5;
const POS_LAT: Record<FGPosition, number> = { LH: HASH_L, LM: 22, M: 26.5, RM: 31, RH: HASH_R };
function posLat(pos: string | undefined): number { return POS_LAT[pos as FGPosition] ?? 26.5; }

// Made kicks end between the uprights ABOVE the crossbar
// Missed L/R end outside the uprights, XS ends short
function resultEndLat(r: string): number {
  switch (r) { case "YC": return 26.5; case "YL": return 21; case "YR": return 32; case "XL": return 12; case "XR": return 41; default: return 26.5; }
}
// FG distance = LOS-to-goal + 10yd end zone + 7yd snap
// The ball is KICKED from 7yd behind the LOS, so:
//   kick spot = LOS + 7 = (fgDist - 10) yards from goal line
//   field position from back of EZ = EZ_DEPTH + (fgDist - 10)
// Example: 45yd FG → kicked from the 35 yard line
function kickerDist(fgDist: number): number {
  return Math.max(EZ_DEPTH + 1, Math.min(EZ_DEPTH + (fgDist - 10), MAX_DIST - 2));
}

// Uprights — wide lateral spread so they're visible even at far perspective
// Position at dist=0 (very back of end zone)
const UPRIGHT_LAT_L = 15;
const UPRIGHT_LAT_R = 38;
const UPRIGHT_L = proj(0, UPRIGHT_LAT_L);
const UPRIGHT_R = proj(0, UPRIGHT_LAT_R);
const POST_CENTER = proj(0, 26.5);
const CROSSBAR_Y = POST_CENTER.y;
const UPRIGHT_TOP_Y = CROSSBAR_Y - 110; // very tall uprights

// Results that carry a real lateral (left/center/right) position and can be
// dragged — XS (short) never reached the goal line, and XB/X (blocked/
// unspecified miss) aren't inherently about direction, so none of those get
// a drag handle.
const DRAGGABLE_RESULTS = new Set(["YC", "YL", "YR", "XL", "XR"]);

// Snap a raw lateral drag position to the nearest valid result — restricted
// to makes or misses depending on the kick's own current result, so a drag
// can never turn a miss into a make (or vice versa).
function nearestResult(lat: number, isMake: boolean): FGResult {
  const candidates: [FGResult, number][] = isMake
    ? [["YL", 21], ["YC", 26.5], ["YR", 32]]
    : [["XL", 12], ["XR", 41]];
  let best = candidates[0][0];
  let bestDist = Infinity;
  candidates.forEach(([name, val]) => {
    const d = Math.abs(val - lat);
    if (d < bestDist) { bestDist = d; best = name; }
  });
  return best;
}

function renderKick(key: string | number, kick: { dist: number; pos?: string; result?: string }, opacity: number, endLatOverride?: number) {
  const distance = kick.dist || 0;
  if (distance <= 0) return null;
  const isMake = typeof kick.result === "string" && kick.result.startsWith("Y");
  const isShort = kick.result === "XS";
  const startDist = kickerDist(distance);
  const startLat = posLat(kick.pos);
  const start = proj(startDist, startLat);

  // End point: makes go to the uprights (dist=0) and above crossbar
  // Misses go to dist=0 but laterally outside the uprights (or short)
  const endLat = endLatOverride ?? resultEndLat(kick.result || "");
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
  return { node: (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={7} opacity={opacity * 0.12} strokeLinecap="round" filter="url(#fgBlur)" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} opacity={opacity} strokeLinecap="round" />
      <circle cx={start.x} cy={start.y} r={5} fill="#3b82f6" stroke="white" strokeWidth={1.5} opacity={opacity} />
      {!isShort && <circle cx={end.x} cy={end.y} r={4} fill={color} stroke="white" strokeWidth={1} opacity={opacity * 0.8} />}
    </g>
  ), end, isShort };
}

const RESULT_LABELS: Record<string, string> = { YC: "Made (C)", YL: "Made (L)", YR: "Made (R)", XL: "Miss L", XR: "Miss R", XS: "Short" };

export function FGFieldView({ kicks, currentKick, onMove }: Props) {
  const [ezColor, setEzColor] = useState("#991b1b");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragLat, setDragLat] = useState<number>(26.5);
  const fgKicks = kicks.filter((k) => !k.isPAT);
  useEffect(() => {
    const t = getCurrentTheme(); if (t.primary) setEzColor(t.primary);
  }, []);
  const handleKickTap = useCallback((idx: number) => {
    setSelectedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  const toFieldLat = useCallback((clientX: number): number => {
    const svg = svgRef.current;
    if (!svg) return 26.5;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    return screenXToLat((clientX - rect.left) * scaleX, 0);
  }, []);

  // Distinguishes a tap (show the tooltip, as before) from an actual drag
  // (reposition) — a pointer that never moves more than a few px is a tap.
  const dragStartClientX = useRef(0);
  const DRAG_THRESHOLD = 4;
  // Touch/pen must be pressed-and-held before a drag engages, so a normal
  // tap (or a scroll gesture that happens to start on a dot) isn't mistaken
  // for a reposition. Mouse still drags immediately on click, as before.
  const LONG_PRESS_MS = 350;
  const PRESS_CANCEL_PX = 10;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef({ x: 0, y: 0 });
  const pendingIdx = useRef<number | null>(null);

  const armDrag = useCallback((idx: number, el: Element, pointerId: number, clientX: number) => {
    const k = fgKicks[idx];
    if (!k) return;
    el.setPointerCapture?.(pointerId);
    dragStartClientX.current = clientX;
    setDragIdx(idx);
    setDragLat(resultEndLat(k.result));
  }, [fgKicks]);

  const handleDragStart = useCallback((idx: number, e: React.PointerEvent) => {
    if (!onMove) return;
    const k = fgKicks[idx];
    if (!k || !DRAGGABLE_RESULTS.has(k.result)) return;
    e.stopPropagation();
    if (e.pointerType === "mouse") {
      armDrag(idx, e.target as Element, e.pointerId, e.clientX);
      return;
    }
    const el = e.target as Element;
    const pointerId = e.pointerId;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pendingIdx.current = idx;
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      armDrag(idx, el, pointerId, pressStart.current.x);
    }, LONG_PRESS_MS);
  }, [onMove, fgKicks, armDrag]);

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
    const k = fgKicks[dragIdx];
    if (!k) return;
    const isMake = typeof k.result === "string" && k.result.startsWith("Y");
    const raw = toFieldLat(e.clientX);
    // Clamp the live drag itself to the correct side of the uprights, so the
    // dot can never visually rest inside them for a miss, or outside for a
    // make, even mid-drag.
    const clamped = isMake
      ? Math.max(UPRIGHT_LAT_L, Math.min(UPRIGHT_LAT_R, raw))
      : (raw < 26.5 ? Math.min(raw, UPRIGHT_LAT_L) : Math.max(raw, UPRIGHT_LAT_R));
    setDragLat(clamped);
  }, [dragIdx, fgKicks, toFieldLat]);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (pressTimer.current != null) {
      // Released before the hold finished — treat it as a plain tap.
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      const idx = pendingIdx.current;
      pendingIdx.current = null;
      if (idx != null) handleKickTap(idx);
      return;
    }
    if (dragIdx == null) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const idx = dragIdx;
    const k = fgKicks[idx];
    const moved = Math.abs(e.clientX - dragStartClientX.current) >= DRAG_THRESHOLD;
    setDragIdx(null);
    if (!k) return;
    if (!moved) { handleKickTap(idx); return; }
    const isMake = typeof k.result === "string" && k.result.startsWith("Y");
    const result = nearestResult(dragLat, isMake);
    if (result !== k.result) onMove?.(k, { result });
  }, [dragIdx, fgKicks, dragLat, onMove, handleKickTap]);

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
      // Numbers between sideline and hash — straddling the yard line, facing sideline
      const nL = proj(dist, 9); const nR = proj(dist, 44);
      const scale = 1 - (dist / MAX_DIST) * 0.5;
      const fs = Math.max(8, 16 * scale);
      [{ p: nL, k: "l" }, { p: nR, k: "r" }].forEach(({ p, k }) => {
        yardEls.push(
          <text key={`yn-${yd}-${k}`} x={p.x} y={p.y + fs * 0.35} textAnchor="middle" fontSize={fs}
            fontWeight="900" fill="rgba(255,255,255,0.2)" fontFamily="'Arial Black', sans-serif"
            letterSpacing="2" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}>{yd}</text>
        );
        if (yd < 50) {
          const ay = p.y + fs * 0.15;
          const as = fs * 0.2;
          yardEls.push(
            <polygon key={`ya-${yd}-${k}`}
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
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full mx-auto rounded-lg overflow-hidden"
        style={{ maxHeight: 500, touchAction: dragIdx != null ? "none" : undefined }}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
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
        {fgKicks.map((k, i) => {
          const isSelected = selectedIdx === i;
          const isDragging = dragIdx === i;
          const rendered = renderKick(i, { dist: k.dist, pos: k.pos, result: k.result }, isSelected || isDragging ? 1 : 0.75, isDragging ? dragLat : undefined);
          if (!rendered) return null;
          const { node: arc, end } = rendered;
          const canDrag = !!onMove && DRAGGABLE_RESULTS.has(k.result);
          // Hit area for tap (uses the actual, non-dragged path so it lines up with what's drawn)
          const startDist = kickerDist(k.dist);
          const startLat = posLat(k.pos);
          const start = proj(startDist, startLat);
          const endLat = isDragging ? dragLat : resultEndLat(k.result || "");
          const isShort = k.result === "XS";
          const isMake = typeof k.result === "string" && k.result.startsWith("Y");
          let hitEnd = isShort ? proj((startDist + GOAL_LINE_DIST) / 2, endLat) : proj(0, endLat);
          if (isMake && !isShort) hitEnd = { ...hitEnd, y: CROSSBAR_Y - 25 };
          const midDist = isShort ? (startDist + (startDist + GOAL_LINE_DIST) / 2) / 2 : startDist / 2;
          const mid = proj(midDist, (startLat + endLat) / 2);
          mid.y -= 30 + (k.dist / 60) * 50;
          const hitD = `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${hitEnd.x} ${hitEnd.y}`;
          return (
            <g key={`tap-${i}`}>
              <g onClick={() => handleKickTap(i)} style={{ cursor: "pointer" }}>
                <path d={hitD} fill="none" stroke="transparent" strokeWidth={16} />
                {arc}
              </g>
              {canDrag && (
                <circle
                  cx={end.x} cy={end.y} r={12} fill="transparent"
                  style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
                  onPointerDown={(ev) => handleDragStart(i, ev)}
                />
              )}
            </g>
          );
        })}
        {currentKick && currentKick.dist > 0 && renderKick("preview", currentKick, 1)?.node}
        {/* Tooltip for selected kick */}
        {selectedIdx != null && dragIdx == null && fgKicks[selectedIdx] && (() => {
          const k = fgKicks[selectedIdx];
          const startDist = kickerDist(k.dist);
          const start = proj(startDist, posLat(k.pos));
          const end = proj(0, posLat(k.pos));
          const tx = Math.max(80, Math.min(W - 80, (start.x + end.x) / 2));
          const ty = Math.max(55, Math.min(H - 60, (start.y + end.y) / 2));
          const isMake = typeof k.result === "string" && k.result.startsWith("Y");
          return (
            <g>
              <rect x={tx - 65} y={ty - 28} width={130} height={36} rx={6} fill="rgba(0,0,0,0.85)" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              <text x={tx} y={ty - 12} textAnchor="middle" fontSize={10} fontWeight="bold" fill={isMake ? "#22c55e" : "#ef4444"}>{k.athlete} · {k.dist}yd · {RESULT_LABELS[k.result] ?? k.result}</text>
              <text x={tx} y={ty + 1} textAnchor="middle" fontSize={9} fill="#94a3b8">Pos: {k.pos ?? "M"}{k.score != null ? ` · Score: ${k.score}` : ""}</text>
            </g>
          );
        })()}
      </svg>
      {fgKicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1.5">
          {fgKicks.length} kick{fgKicks.length !== 1 ? "s" : ""} {selectedIdx != null ? "· tap arc to deselect" : "· tap an arc for details"}{onMove ? " · click-drag (or press & hold) a make/miss dot to fix it" : ""}
        </p>
      )}
    </div>
  );
}
