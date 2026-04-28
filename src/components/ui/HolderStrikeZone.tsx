"use client";

import { useRef } from "react";

export interface ShortSnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
}

interface HolderStrikeZoneProps {
  markers?: ShortSnapMarker[];
  onSnap?: (marker: ShortSnapMarker) => void;
  nextNum?: number;
}

// Strike zone — target area around the hands/chest
const ZONE = { top: 20, bottom: 58, left: 22, right: 72 };

function isInZone(xPct: number, yPct: number): boolean {
  return xPct >= ZONE.left && xPct <= ZONE.right && yPct >= ZONE.top && yPct <= ZONE.bottom;
}

export function HolderStrikeZone({ markers = [], onSnap, nextNum = 1 }: HolderStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSnap || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone = isInZone(xPct, yPct);
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone });
  };

  return (
    <div className="flex justify-center">
      <div
        ref={containerRef}
        onClick={handleClick}
        className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none overflow-hidden flex flex-col items-center"
        style={{ width: 280, background: "#000000", paddingTop: 30, paddingBottom: 10 }}
      >
        {/* Holder outline sketch — kneeling, facing camera, right hand reaching for incoming snap */}
        <svg viewBox="0 0 240 340" className="pointer-events-none select-none" style={{ height: 320, width: "auto" }}>
          {/* All strokes white/light grey on black background — outline sketch style */}

          {/* ── HEAD / HELMET ── */}
          {/* Helmet shell */}
          <ellipse cx="120" cy="42" rx="26" ry="28" fill="none" stroke="#ccc" strokeWidth="2"/>
          {/* Facemask */}
          <path d="M100 50 Q110 62 120 64 Q130 62 140 50" fill="none" stroke="#999" strokeWidth="1.8"/>
          <path d="M103 55 Q115 64 120 65 Q125 64 137 55" fill="none" stroke="#999" strokeWidth="1.2"/>
          <line x1="110" y1="50" x2="108" y2="60" stroke="#999" strokeWidth="1"/>
          <line x1="120" y1="48" x2="120" y2="64" stroke="#999" strokeWidth="1"/>
          <line x1="130" y1="50" x2="132" y2="60" stroke="#999" strokeWidth="1"/>
          {/* Helmet stripe */}
          <path d="M120 14 L120 42" fill="none" stroke="#666" strokeWidth="2"/>
          {/* Ear holes */}
          <ellipse cx="94" cy="44" rx="3" ry="5" fill="none" stroke="#888" strokeWidth="1"/>
          <ellipse cx="146" cy="44" rx="3" ry="5" fill="none" stroke="#888" strokeWidth="1"/>

          {/* ── NECK ── */}
          <path d="M108 68 L108 78 Q120 82 132 78 L132 68" fill="none" stroke="#bbb" strokeWidth="1.5"/>

          {/* ── SHOULDER PADS ── */}
          <path d="M60 82 Q68 72 90 70 L90 90 Q72 90 60 82Z" fill="none" stroke="#ccc" strokeWidth="1.5"/>
          <path d="M180 82 Q172 72 150 70 L150 90 Q168 90 180 82Z" fill="none" stroke="#ccc" strokeWidth="1.5"/>

          {/* ── TORSO / JERSEY ── */}
          {/* Slightly crouched/leaning forward */}
          <path d="M90 78 Q88 95 85 115 L82 155 Q82 168 86 178 L90 188 Q105 195 120 195 Q135 195 148 188 L152 178 Q156 168 156 155 L153 115 Q150 95 148 78" fill="none" stroke="#ccc" strokeWidth="1.8"/>
          {/* Jersey seam */}
          <line x1="120" y1="82" x2="120" y2="190" stroke="#555" strokeWidth="0.6"/>
          {/* Collar */}
          <path d="M100 76 Q120 82 140 76" fill="none" stroke="#999" strokeWidth="1.2"/>

          {/* ── RIGHT ARM — reaching out toward snap, hand open ── */}
          {/* Upper arm */}
          <path d="M150 90 Q158 100 164 115" fill="none" stroke="#ccc" strokeWidth="3" strokeLinecap="round"/>
          {/* Forearm extending forward/down */}
          <path d="M164 115 Q172 130 178 142" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Right hand — open, fingers spread, reaching for ball */}
          <path d="M178 142 L182 148" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round"/>
          {/* Thumb */}
          <path d="M176 144 L170 140" fill="none" stroke="#ccc" strokeWidth="1.8" strokeLinecap="round"/>
          {/* Index */}
          <path d="M178 143 L184 136" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Middle */}
          <path d="M180 145 L188 140" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Ring */}
          <path d="M181 148 L190 145" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Pinky */}
          <path d="M182 150 L190 150" fill="none" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round"/>
          {/* Palm outline */}
          <path d="M175 140 Q180 145 182 152" fill="none" stroke="#aaa" strokeWidth="1"/>

          {/* ── LEFT ARM — down, fingers touching ground for balance ── */}
          {/* Upper arm */}
          <path d="M60 82 Q52 100 48 120" fill="none" stroke="#ccc" strokeWidth="3" strokeLinecap="round"/>
          {/* Forearm going down */}
          <path d="M48 120 Q44 145 42 165" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Left hand — fingers down on ground */}
          <path d="M42 165 L38 175" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round"/>
          <path d="M40 168 L35 176" fill="none" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M42 167 L40 177" fill="none" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M44 168 L44 177" fill="none" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round"/>
          <path d="M46 167 L48 175" fill="none" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round"/>

          {/* ── BELT ── */}
          <path d="M86 186 L152 186" fill="none" stroke="#999" strokeWidth="2"/>
          <rect x="116" y="184" width="8" height="6" rx="1" fill="none" stroke="#aaa" strokeWidth="1"/>

          {/* ── LEGS — kneeling ── */}
          {/* Left thigh — going down and slightly forward */}
          <path d="M90 192 Q86 210 82 228 Q78 242 80 252" fill="none" stroke="#ccc" strokeWidth="2.5"/>
          {/* Left shin — tucked under */}
          <path d="M80 252 Q76 262 74 272 L70 280" fill="none" stroke="#ccc" strokeWidth="2"/>
          {/* Left knee */}
          <ellipse cx="80" cy="252" rx="10" ry="8" fill="none" stroke="#aaa" strokeWidth="1.2"/>

          {/* Right thigh */}
          <path d="M148 192 Q152 210 156 228 Q160 242 158 252" fill="none" stroke="#ccc" strokeWidth="2.5"/>
          {/* Right shin — tucked under */}
          <path d="M158 252 Q162 262 164 272 L168 280" fill="none" stroke="#ccc" strokeWidth="2"/>
          {/* Right knee */}
          <ellipse cx="158" cy="252" rx="10" ry="8" fill="none" stroke="#aaa" strokeWidth="1.2"/>

          {/* ── CLEATS ── */}
          <path d="M66 278 Q64 284 68 288 L78 288 Q82 284 80 278" fill="none" stroke="#999" strokeWidth="1.2"/>
          <path d="M164 278 Q162 284 166 288 L176 288 Q180 284 178 278" fill="none" stroke="#999" strokeWidth="1.2"/>

          {/* ── GROUND LINE ── */}
          <line x1="25" y1="290" x2="215" y2="290" stroke="#444" strokeWidth="0.8" strokeDasharray="4 3"/>
        </svg>

        {/* Strike zone box */}
        <div
          className="absolute border-2 border-red-500 rounded pointer-events-none"
          style={{
            top: `${ZONE.top}%`,
            left: `${ZONE.left}%`,
            width: `${ZONE.right - ZONE.left}%`,
            height: `${ZONE.bottom - ZONE.top}%`,
            backgroundColor: "rgba(239, 68, 68, 0.06)",
          }}
        />

        {/* Snap markers */}
        {markers.map((m) => (
          <div
            key={m.num}
            className="absolute pointer-events-none flex items-center justify-center"
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              transform: "translate(-50%, -50%)",
              width: 26,
              height: 26,
              borderRadius: "50%",
              backgroundColor: m.inZone ? "rgba(0, 212, 160, 0.85)" : "rgba(239, 68, 68, 0.85)",
              border: `2px solid ${m.inZone ? "#00d4a0" : "#ef4444"}`,
            }}
          >
            <span className="text-[10px] font-black text-white leading-none">{m.num}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
