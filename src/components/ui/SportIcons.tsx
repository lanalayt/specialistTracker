"use client";

import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

/** Yellow goalpost icon for FG Kicking */
export function GoalpostIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
      {/* Base post */}
      <line x1="12" y1="22" x2="12" y2="10" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      {/* Crossbar */}
      <line x1="5" y1="10" x2="19" y2="10" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      {/* Left upright */}
      <line x1="5" y1="10" x2="5" y2="2" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      {/* Right upright */}
      <line x1="19" y1="10" x2="19" y2="2" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Foot kicking a football icon for Punting */
export function PuntFootIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
      {/* Foot/shoe shape */}
      <path
        d="M4 18 C4 14 6 12 8 11 L12 10 C13 10 14 11 14 12 L15 14 L20 14 C21 14 22 15 22 16 L22 18 C22 19 21 20 20 20 L4 20 C3 20 3 19 4 18Z"
        fill="#94a3b8"
        stroke="#64748b"
        strokeWidth="1"
      />
      {/* Football on the toe */}
      <ellipse cx="8" cy="8" rx="3.5" ry="2" transform="rotate(-35 8 8)" fill="#92400e" stroke="#78350f" strokeWidth="0.8" />
      {/* Ball laces */}
      <line x1="7" y1="7" x2="9" y2="9" stroke="white" strokeWidth="0.7" />
      <line x1="6.5" y1="7.8" x2="7.5" y2="7.2" stroke="white" strokeWidth="0.5" />
      <line x1="8.5" y1="8.8" x2="9.5" y2="8.2" stroke="white" strokeWidth="0.5" />
    </svg>
  );
}

/** Kickoff tee with football icon */
export function KickoffTeeIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
      {/* Tee base */}
      <path
        d="M6 20 L10 14 L14 14 L18 20Z"
        fill="#f97316"
        stroke="#ea580c"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Tee cradle notch */}
      <path
        d="M10 14 Q12 12 14 14"
        fill="none"
        stroke="#ea580c"
        strokeWidth="1.2"
      />
      {/* Football sitting on tee */}
      <ellipse cx="12" cy="9" rx="4.5" ry="2.5" transform="rotate(-20 12 9)" fill="#92400e" stroke="#78350f" strokeWidth="0.8" />
      {/* Ball laces */}
      <line x1="10.5" y1="8.5" x2="13.5" y2="9.5" stroke="white" strokeWidth="0.7" />
      <line x1="10" y1="9.5" x2="11" y2="8.5" stroke="white" strokeWidth="0.5" />
      <line x1="11.5" y1="9.8" x2="12.5" y2="8.8" stroke="white" strokeWidth="0.5" />
      <line x1="13" y1="10" x2="14" y2="9" stroke="white" strokeWidth="0.5" />
    </svg>
  );
}

/** Map sport key to icon component */
export function SportIcon({ sport, size = 24, className }: { sport: string; size?: number; className?: string }) {
  switch (sport) {
    case "KICKING": return <GoalpostIcon size={size} className={className} />;
    case "PUNTING": return <PuntFootIcon size={size} className={className} />;
    case "KICKOFF": return <KickoffTeeIcon size={size} className={className} />;
    default: return <span className={className} style={{ fontSize: size }}>{sport === "LONGSNAP" ? "📏" : "📋"}</span>;
  }
}
