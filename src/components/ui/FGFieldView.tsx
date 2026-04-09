"use client";

import React, { useEffect, useState } from "react";
import type { FGKick, FGPosition } from "@/types";

/**
 * Focused pseudo-3D FG field view.
 * Shows only the relevant portion: ~35 yard line down to the end zone.
 * Includes painted yard numbers, hash marks, colored end zone with team
 * name, pylons, and a goalpost. Made kicks arc through the uprights.
 */

interface Props {
  kicks: FGKick[];
  currentKick?: {
    dist: number;
    pos?: string;
    result?: string;
  } | null;
}

const W = 480;
const H = 600;

// Perspective: bottom = close (wide), top = far (narrow)
const BOTTOM_Y = H - 16;
const TOP_Y = 30;
const NEAR_HALF_W = 210;  // half-width at bottom
const FAR_HALF_W = 70;    // half-width at top
const CENTER_X = W / 2;

// Field range: we show from 0 (back of end zone) to MAX_DIST yards out
const MAX_DIST = 55; // covers up to ~55 yard FG
const ENDZONE_DEPTH = 10;
const GOAL_LINE_DIST = ENDZONE_DEPTH; // goal line is 10 yards from back

// Project a point on the field to screen coordinates
// dist = yards from back of end zone (0 = back, 10 = goal line, 20 = 10yd line...)
// lat = lateral position 0..53 (sideline to sideline)
function proj(dist: number, lat: number): { x: number; y: number } {
  const t = 1 - Math.max(0, Math.min(1, dist / MAX_DIST)); // 0=bottom, 1=top
  const y = BOTTOM_Y - t * (BOTTOM_Y - TOP_Y);
  const halfW = NEAR_HALF_W - t * (NEAR_HALF_W - FAR_HALF_W);
  const normLat = (lat - 26.5) / 53; // -0.5 to 0.5
  const x = CENTER_X + normLat * halfW * 2;
  return { x, y };
}

// Hash positions (fieldY units)
const HASH_LEFT = 18.5;
const HASH_RIGHT = 34.5;

// Position → lateral
const POS_LAT: Record<FGPosition, number> = {
  LH: HASH_LEFT,
  LM: 22,
  M: 26.5,
  RM: 31,
  RH: HASH_RIGHT,
};

function posLat(pos: string | undefined): number {
  return POS_LAT[pos as FGPosition] ?? 26.5;
}

// Result → how far the ball ends up laterally from center at the uprights
function resultEndLat(result: string): number {
  switch (result) {
    case "YC": return 26.5;
    case "YL": return 25;
    case "YR": return 28;
    case "XL": return 20;   // wide left — outside uprights
    case "XR": return 33;   // wide right
    case "XS": return 26.5; // short
    default: return 26.5;
  }
}

// Kick dist → how many yards from back of end zone the kicker stands
// FG distance = 7 (snap) + LOS-to-goal + 10 (end zone) ... simplified:
// the kicker is (distance - 10) yards from the goal line, so distance from back of EZ = distance
function kickerDist(fgDist: number): number {
  return Math.max(12, Math.min(fgDist, MAX_DIST));
}

function renderKick(
  key: string | number,
  kick: { dist: number; pos?: string; result?: string },
  opacity: number
) {
  const distance = kick.dist || 0;
  if (distance <= 0) return null;

  const isMake = typeof kick.result === "string" && kick.result.startsWith("Y");
  const isShort = kick.result === "XS";

  // Start: kicker position
  const startDist = kickerDist(distance);
  const startLat = posLat(kick.pos);
  const start = proj(startDist, startLat);

  // End: for makes, land PAST the crossbar (between uprights, dist ~5)
  // For misses: outside uprights or short
  const endDist = isShort ? (startDist + GOAL_LINE_DIST) / 2 : 5;
  const endLat = resultEndLat(kick.result || "");
  const end = proj(endDist, endLat);

  // Arc control point — higher arc for longer kicks
  const midDist = (startDist + endDist) / 2;
  const midLat = (startLat + endLat) / 2;
  const mid = proj(midDist, midLat);
  const arcLift = 40 + (distance / 60) * 60;
  mid.y -= arcLift;

  const color = isMake ? "#22c55e" : "#ef4444";
  const d = `M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`;

  return (
    <g key={key}>
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} opacity={opacity} strokeLinecap="round" />
      <circle cx={start.x} cy={start.y} r={4} fill="#60a5fa" stroke="#0f172a" strokeWidth={1} opacity={opacity} />
      {!isShort && (
        <circle cx={end.x} cy={end.y} r={3} fill={color} opacity={opacity * 0.7} />
      )}
    </g>
  );
}

export function FGFieldView({ kicks, currentKick }: Props) {
  // Load team/school name for the end zone
  const [ezName, setEzName] = useState("END ZONE");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("st_team_v1");
      if (raw) {
        const t = JSON.parse(raw);
        if (t.school) setEzName(t.school.toUpperCase());
        else if (t.name) setEzName(t.name.toUpperCase());
      }
    } catch {}
  }, []);

  // Load theme accent for end zone color
  const [ezColor, setEzColor] = useState("#991b1b");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("st_theme");
      if (raw) {
        const t = JSON.parse(raw);
        if (t.primary) setEzColor(t.primary);
      }
    } catch {}
  }, []);

  // Yard lines (every 5 yards from goal line outward)
  const yardLineEls: React.ReactNode[] = [];
  for (let yd = 0; yd <= 45; yd += 5) {
    const dist = GOAL_LINE_DIST + yd;
    if (dist > MAX_DIST) break;
    const left = proj(dist, 0);
    const right = proj(dist, 53);
    const isGoalLine = yd === 0;
    const isMajor = yd % 10 === 0;
    yardLineEls.push(
      <line
        key={`yl-${yd}`}
        x1={left.x} y1={left.y} x2={right.x} y2={right.y}
        stroke={isGoalLine ? "white" : "rgba(255,255,255,0.3)"}
        strokeWidth={isGoalLine ? 3 : isMajor ? 1.5 : 0.8}
      />
    );
    // Yard number text (painted on field) — only every 10
    if (isMajor && yd > 0 && yd <= 40) {
      const numLeft = proj(dist, 12);
      const numRight = proj(dist, 41);
      const fontSize = 11 - (dist / MAX_DIST) * 3;
      [numLeft, numRight].forEach((p, i) => {
        yardLineEls.push(
          <text
            key={`yn-${yd}-${i}`}
            x={p.x} y={p.y + 1}
            textAnchor="middle"
            fontSize={fontSize}
            fontWeight="bold"
            fill="rgba(255,255,255,0.35)"
          >
            {yd}
          </text>
        );
      });
    }
  }

  // Hash marks (small ticks at each yard line on the hash positions)
  const hashEls: React.ReactNode[] = [];
  for (let yd = 1; yd <= 45; yd++) {
    const dist = GOAL_LINE_DIST + yd;
    if (dist > MAX_DIST) break;
    [HASH_LEFT, HASH_RIGHT].forEach((lat) => {
      const a = proj(dist, lat - 0.3);
      const b = proj(dist, lat + 0.3);
      hashEls.push(
        <line
          key={`h-${yd}-${lat}`}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1}
        />
      );
    });
  }

  // End zone corners for pylons
  const pylonPositions = [
    proj(GOAL_LINE_DIST, 0),
    proj(GOAL_LINE_DIST, 53),
    proj(0, 0),
    proj(0, 53),
  ];

  // Goalpost — positioned at back of end zone
  const postDist = 2; // uprights ~2 yards from back
  const postCenter = proj(postDist, 26.5);
  const postL = proj(postDist, 24);
  const postR = proj(postDist, 29);
  const crossbarScreenY = postCenter.y;
  const uprightTopY = crossbarScreenY - 50;

  const fgKicks = kicks.filter((k) => !k.isPAT);

  return (
    <div className="card-2 p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">Field View — FG</p>
        <div className="flex items-center gap-3 text-[10px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#60a5fa]" /> Spot</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#22c55e]" /> Made</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-[#ef4444]" /> Miss</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mx-auto" style={{ maxHeight: 600 }}>
        <defs>
          <linearGradient id="fg-turf2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>
        </defs>

        {/* Sky above the uprights */}
        <rect x={0} y={0} width={W} height={uprightTopY} fill="#0b1120" />

        {/* Field turf */}
        {(() => {
          const tl = proj(MAX_DIST, 0);
          const tr = proj(MAX_DIST, 53);
          const br = proj(0, 53);
          const bl = proj(0, 0);
          return <polygon points={`${bl.x},${bl.y} ${br.x},${br.y} ${tr.x},${tr.y} ${tl.x},${tl.y}`} fill="url(#fg-turf2)" />;
        })()}

        {/* End zone fill */}
        {(() => {
          const gl = proj(GOAL_LINE_DIST, 0);
          const gr = proj(GOAL_LINE_DIST, 53);
          const br = proj(0, 53);
          const bl = proj(0, 0);
          return <polygon points={`${bl.x},${bl.y} ${br.x},${br.y} ${gr.x},${gr.y} ${gl.x},${gl.y}`} fill={ezColor} opacity={0.35} />;
        })()}

        {/* End zone text */}
        {(() => {
          const mid = proj(GOAL_LINE_DIST / 2, 26.5);
          const fontSize = 14;
          return (
            <text
              x={mid.x} y={mid.y + 4}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight="900"
              letterSpacing="6"
              fill="white"
              opacity={0.5}
            >
              {ezName}
            </text>
          );
        })()}

        {/* Sidelines */}
        {(() => {
          const bl = proj(MAX_DIST, 0);
          const tl = proj(0, 0);
          const br = proj(MAX_DIST, 53);
          const tr = proj(0, 53);
          return (
            <>
              <line x1={bl.x} y1={bl.y} x2={tl.x} y2={tl.y} stroke="white" strokeWidth={2} />
              <line x1={br.x} y1={br.y} x2={tr.x} y2={tr.y} stroke="white" strokeWidth={2} />
            </>
          );
        })()}

        {/* Back of end zone line */}
        {(() => {
          const l = proj(0, 0);
          const r = proj(0, 53);
          return <line x1={l.x} y1={l.y} x2={r.x} y2={r.y} stroke="white" strokeWidth={2} />;
        })()}

        {yardLineEls}
        {hashEls}

        {/* Pylons — orange squares at end zone corners */}
        {pylonPositions.map((p, i) => (
          <rect key={`pylon-${i}`} x={p.x - 3} y={p.y - 3} width={6} height={6} fill="#f97316" stroke="#ea580c" strokeWidth={1} rx={1} />
        ))}

        {/* Goalpost */}
        <g>
          {/* Base post */}
          <line x1={postCenter.x} y1={crossbarScreenY} x2={postCenter.x} y2={crossbarScreenY + 12} stroke="#fbbf24" strokeWidth={3} />
          {/* Crossbar */}
          <line x1={postL.x} y1={crossbarScreenY} x2={postR.x} y2={crossbarScreenY} stroke="#fbbf24" strokeWidth={4} strokeLinecap="round" />
          {/* Left upright */}
          <line x1={postL.x} y1={crossbarScreenY} x2={postL.x} y2={uprightTopY} stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" />
          {/* Right upright */}
          <line x1={postR.x} y1={crossbarScreenY} x2={postR.x} y2={uprightTopY} stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" />
        </g>

        {/* Kicks */}
        {fgKicks.map((k, i) => renderKick(i, { dist: k.dist, pos: k.pos, result: k.result }, 0.7))}
        {currentKick && currentKick.dist > 0 && renderKick("preview", currentKick, 1)}
      </svg>
      {fgKicks.length > 0 && (
        <p className="text-[10px] text-muted text-right mt-1">{fgKicks.length} kick{fgKicks.length !== 1 ? "s" : ""} shown</p>
      )}
    </div>
  );
}
