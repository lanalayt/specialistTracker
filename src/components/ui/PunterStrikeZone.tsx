"use client";

import { useRef } from "react";

export interface SnapMarker {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  num: number;
  inZone: boolean;
}

interface PunterStrikeZoneProps {
  markers?: SnapMarker[];
  onSnap?: (marker: SnapMarker) => void;
  nextNum?: number;
}

// Strike zone bounds as percentages of the clickable area
const ZONE = { top: 28, bottom: 72, left: 24, right: 76 };

function isInZone(xPct: number, yPct: number): boolean {
  return xPct >= ZONE.left && xPct <= ZONE.right && yPct >= ZONE.top && yPct <= ZONE.bottom;
}

export function PunterStrikeZone({ markers = [], onSnap, nextNum = 1 }: PunterStrikeZoneProps) {
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
      {/* Outer white border box */}
      <div
        ref={containerRef}
        onClick={handleClick}
        className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none"
        style={{ width: 280, height: 520, background: "rgba(30,41,59,0.3)" }}
      >
        {/* Player SVG */}
        <svg
          viewBox="0 0 200 480"
          className="absolute drop-shadow-lg pointer-events-none"
          style={{ top: "10%", left: "50%", transform: "translateX(-50%)", height: "85%", width: "auto" }}
        >
          <defs>
            <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1a1a" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </linearGradient>
          </defs>

          {/* Helmet */}
          <path d="M100 8 C72 8 58 22 56 44 C54 56 58 66 66 72 L68 68 C68 68 78 74 100 74 C122 74 132 68 132 68 L134 72 C142 66 146 56 144 44 C142 22 128 8 100 8Z" fill="#111" />
          <path d="M72 56 C72 56 80 68 100 68 C120 68 128 56 128 56" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M76 62 C76 62 86 70 100 70 C114 70 124 62 124 62" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round"/>
          <line x1="84" y1="56" x2="82" y2="66" stroke="#ccc" strokeWidth="1.5"/>
          <line x1="100" y1="54" x2="100" y2="70" stroke="#ccc" strokeWidth="1.5"/>
          <line x1="116" y1="56" x2="118" y2="66" stroke="#ccc" strokeWidth="1.5"/>
          <path d="M100 10 C100 10 90 12 86 20" fill="none" stroke="#333" strokeWidth="1.5"/>

          {/* Neck */}
          <path d="M88 72 L88 82 Q100 86 112 82 L112 72" fill="#111"/>

          {/* Shoulder pads */}
          <path d="M40 84 C42 76 56 72 72 74 L72 96 C60 96 48 92 40 84Z" fill="#111" stroke="#222" strokeWidth="0.5"/>
          <path d="M160 84 C158 76 144 72 128 74 L128 96 C140 96 152 92 160 84Z" fill="#111" stroke="#222" strokeWidth="0.5"/>
          <path d="M42 84 C44 78 56 74 72 74" fill="none" stroke="#333" strokeWidth="1.2"/>
          <path d="M158 84 C156 78 144 74 128 74" fill="none" stroke="#333" strokeWidth="1.2"/>
          <path d="M46 92 Q60 104 72 96" fill="none" stroke="#333" strokeWidth="0.8"/>
          <path d="M154 92 Q140 104 128 96" fill="none" stroke="#333" strokeWidth="0.8"/>

          {/* Jersey */}
          <path d="M72 82 L72 96 Q72 100 68 110 L64 180 Q64 196 68 210 L70 220 Q84 228 100 228 Q116 228 130 220 L132 210 Q136 196 136 180 L132 110 Q128 100 128 96 L128 82 Q114 90 100 90 Q86 90 72 82Z" fill="url(#bodyFill)" stroke="#222" strokeWidth="0.5"/>
          <line x1="100" y1="92" x2="100" y2="224" stroke="#222" strokeWidth="0.5"/>
          <path d="M70 220 Q100 230 130 220" fill="none" stroke="#333" strokeWidth="0.8"/>
          <path d="M82 82 Q100 88 118 82" fill="none" stroke="#333" strokeWidth="1.2"/>

          {/* Arms */}
          <path d="M46 92 Q40 120 38 148 Q36 166 40 180 L44 184 Q50 170 50 148 Q52 120 56 96" fill="#111" stroke="#222" strokeWidth="0.5"/>
          <path d="M154 92 Q160 120 162 148 Q164 166 160 180 L156 184 Q150 170 150 148 Q148 120 144 96" fill="#111" stroke="#222" strokeWidth="0.5"/>

          {/* Hands */}
          <path d="M38 178 Q34 186 36 190 Q38 194 44 192 Q48 190 48 184 L44 178Z" fill="#111"/>
          <path d="M162 178 Q166 186 164 190 Q162 194 156 192 Q152 190 152 184 L156 178Z" fill="#111"/>

          {/* Belt */}
          <rect x="66" y="218" width="68" height="8" rx="2" fill="#0a0a0a" stroke="#333" strokeWidth="0.8"/>
          <rect x="96" y="217" width="8" height="10" rx="1.5" fill="#333" stroke="#444" strokeWidth="0.5"/>

          {/* Legs */}
          <path d="M70 226 Q68 250 66 280 Q64 310 64 340 L60 360 Q60 368 68 368 L82 368 Q86 368 86 362 L84 340 Q84 310 86 280 Q88 250 90 226Z" fill="url(#bodyFill)" stroke="#222" strokeWidth="0.5"/>
          <path d="M110 226 Q112 250 114 280 Q116 310 116 340 L120 360 Q120 368 112 368 L98 368 Q94 368 94 362 L96 340 Q96 310 94 280 Q92 250 90 226Z" fill="url(#bodyFill)" stroke="#222" strokeWidth="0.5"/>

          {/* Knee pads */}
          <path d="M66 296 Q64 304 66 316 Q72 322 82 316 Q84 304 82 296 Q74 290 66 296Z" fill="#151515" stroke="#333" strokeWidth="0.8"/>
          <path d="M118 296 Q120 304 118 316 Q112 322 102 316 Q100 304 102 296 Q110 290 118 296Z" fill="#151515" stroke="#333" strokeWidth="0.8"/>

          {/* Socks */}
          <rect x="60" y="354" width="26" height="14" rx="2" fill="#0a0a0a" stroke="#222" strokeWidth="0.5"/>
          <rect x="94" y="354" width="26" height="14" rx="2" fill="#0a0a0a" stroke="#222" strokeWidth="0.5"/>

          {/* Cleats */}
          <path d="M56 366 Q54 372 58 378 L86 378 Q90 374 88 366" fill="#0a0a0a" stroke="#222" strokeWidth="0.5"/>
          <path d="M92 366 Q90 372 94 378 L122 378 Q126 374 124 366" fill="#0a0a0a" stroke="#222" strokeWidth="0.5"/>
        </svg>

        {/* Strike zone box overlay */}
        <div
          className="absolute border-2 border-dashed border-accent/50 rounded pointer-events-none"
          style={{
            top: `${ZONE.top}%`,
            left: `${ZONE.left}%`,
            width: `${ZONE.right - ZONE.left}%`,
            height: `${ZONE.bottom - ZONE.top}%`,
            backgroundColor: "rgba(0, 212, 160, 0.08)",
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
              width: 24,
              height: 24,
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
