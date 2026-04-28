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

// Strike zone — the holder's target area (hands/chest region)
const ZONE = { top: 30, bottom: 65, left: 25, right: 75 };

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
        style={{ width: 280, background: "#000000", paddingTop: 40, paddingBottom: 10 }}
      >
        {/* Holder SVG — front-facing, kneeling, left hand down, right hand open toward camera */}
        <svg viewBox="0 0 200 360" className="pointer-events-none select-none" style={{ height: 340, width: "auto" }}>
          <defs>
            <linearGradient id="hBodyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e8e8e8" />
              <stop offset="100%" stopColor="#c0c0c0" />
            </linearGradient>
          </defs>

          {/* ── HELMET ── */}
          <ellipse cx="100" cy="38" rx="22" ry="24" fill="#d4d4d4" />
          {/* Facemask */}
          <path d="M82 46 Q90 56 100 58 Q110 56 118 46" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
          <path d="M85 50 Q95 58 100 59 Q105 58 115 50" fill="none" stroke="#888" strokeWidth="1.5"/>
          <line x1="92" y1="46" x2="91" y2="54" stroke="#888" strokeWidth="1.2"/>
          <line x1="100" y1="44" x2="100" y2="58" stroke="#888" strokeWidth="1.2"/>
          <line x1="108" y1="46" x2="109" y2="54" stroke="#888" strokeWidth="1.2"/>
          {/* Helmet stripe */}
          <path d="M100 14 L100 38" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5"/>
          {/* Ear holes */}
          <ellipse cx="78" cy="40" rx="2.5" ry="4" fill="#999"/>
          <ellipse cx="122" cy="40" rx="2.5" ry="4" fill="#999"/>

          {/* ── NECK ── */}
          <rect x="92" y="60" width="16" height="10" rx="3" fill="#d0d0d0"/>

          {/* ── SHOULDER PADS ── */}
          <path d="M50 72 Q55 64 75 62 L75 82 Q60 82 50 72Z" fill="#ccc" stroke="#aaa" strokeWidth="0.5"/>
          <path d="M150 72 Q145 64 125 62 L125 82 Q140 82 150 72Z" fill="#ccc" stroke="#aaa" strokeWidth="0.5"/>
          <path d="M52 72 Q55 66 75 62" fill="none" stroke="#ddd" strokeWidth="1"/>
          <path d="M148 72 Q145 66 125 62" fill="none" stroke="#ddd" strokeWidth="1"/>

          {/* ── JERSEY / TORSO ── */}
          <path d="M75 68 L75 82 Q74 90 72 105 L68 160 Q68 172 72 182 L74 192 Q88 200 100 200 Q112 200 126 192 L128 182 Q132 172 132 160 L128 105 Q126 90 125 82 L125 68 Q112 76 100 76 Q88 76 75 68Z" fill="url(#hBodyFill)" stroke="#aaa" strokeWidth="0.5"/>
          {/* Jersey seam */}
          <line x1="100" y1="78" x2="100" y2="196" stroke="#bbb" strokeWidth="0.4"/>
          {/* Collar */}
          <path d="M85 68 Q100 74 115 68" fill="none" stroke="#ccc" strokeWidth="1"/>
          {/* Number */}
          <text x="100" y="145" textAnchor="middle" fill="rgba(0,0,0,0.08)" fontSize="36" fontWeight="900" fontFamily="sans-serif">7</text>

          {/* ── LEFT ARM — down, touching ground ── */}
          <path d="M50 72 Q42 100 38 130 Q35 155 38 175 L40 185" fill="none" stroke="#d4d4d4" strokeWidth="13" strokeLinecap="round"/>
          {/* Left hand — flat on ground */}
          <ellipse cx="40" cy="190" rx="8" ry="5" fill="#d4d4d4" stroke="#bbb" strokeWidth="0.5"/>
          {/* Fingers */}
          <line x1="33" y1="189" x2="33" y2="193" stroke="#bbb" strokeWidth="0.8"/>
          <line x1="36" y1="190" x2="36" y2="195" stroke="#bbb" strokeWidth="0.8"/>
          <line x1="40" y1="190" x2="40" y2="196" stroke="#bbb" strokeWidth="0.8"/>
          <line x1="44" y1="190" x2="44" y2="195" stroke="#bbb" strokeWidth="0.8"/>

          {/* ── RIGHT ARM — extended forward, hand open toward viewer ── */}
          <path d="M150 72 Q156 95 158 115 Q160 130 158 142" fill="none" stroke="#d4d4d4" strokeWidth="13" strokeLinecap="round"/>
          {/* Right hand — open, facing forward (circle to show palm) */}
          <circle cx="158" cy="150" r="12" fill="#d4d4d4" stroke="#bbb" strokeWidth="0.8"/>
          {/* Palm lines */}
          <path d="M152 148 Q158 152 164 148" fill="none" stroke="#bbb" strokeWidth="0.6"/>
          <path d="M153 152 Q158 155 163 152" fill="none" stroke="#bbb" strokeWidth="0.5"/>
          {/* Fingers spread */}
          <line x1="150" y1="142" x2="147" y2="136" stroke="#d4d4d4" strokeWidth="3" strokeLinecap="round"/>
          <line x1="154" y1="140" x2="152" y2="133" stroke="#d4d4d4" strokeWidth="3" strokeLinecap="round"/>
          <line x1="158" y1="138" x2="158" y2="131" stroke="#d4d4d4" strokeWidth="3" strokeLinecap="round"/>
          <line x1="162" y1="140" x2="164" y2="133" stroke="#d4d4d4" strokeWidth="3" strokeLinecap="round"/>
          <line x1="166" y1="142" x2="169" y2="136" stroke="#d4d4d4" strokeWidth="3" strokeLinecap="round"/>

          {/* ── BELT ── */}
          <rect x="70" y="190" width="60" height="6" rx="2" fill="#999" stroke="#888" strokeWidth="0.5"/>
          <rect x="96" y="189" width="8" height="8" rx="1.5" fill="#bbb" stroke="#999" strokeWidth="0.5"/>

          {/* ── KNEELING LEGS ── */}
          {/* Left leg — kneeling, shin tucked under */}
          <path d="M74 196 Q72 210 70 225 Q68 240 72 250 L80 255 Q88 250 88 240 Q88 225 86 210 L86 196" fill="#d0d0d0" stroke="#aaa" strokeWidth="0.5"/>
          {/* Right leg — kneeling */}
          <path d="M114 196 Q116 210 118 225 Q120 240 116 250 L108 255 Q100 250 100 240 Q100 225 102 210 L102 196" fill="#d0d0d0" stroke="#aaa" strokeWidth="0.5"/>
          {/* Knee pads */}
          <ellipse cx="79" cy="248" rx="10" ry="8" fill="#bbb" stroke="#999" strokeWidth="0.5"/>
          <ellipse cx="109" cy="248" rx="10" ry="8" fill="#bbb" stroke="#999" strokeWidth="0.5"/>

          {/* ── FEET/CLEATS (tucked under) ── */}
          <path d="M68 252 Q66 260 70 264 L88 264 Q92 260 90 252" fill="#999" stroke="#888" strokeWidth="0.5"/>
          <path d="M98 252 Q96 260 100 264 L118 264 Q122 260 120 252" fill="#999" stroke="#888" strokeWidth="0.5"/>
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
