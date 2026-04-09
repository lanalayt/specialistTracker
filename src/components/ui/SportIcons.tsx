"use client";

import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

/** Clean yellow goalpost — classic Y-post shape */
export function GoalpostIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Base/ground */}
      <line x1="10" y1="28" x2="22" y2="28" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
      {/* Center post */}
      <line x1="16" y1="28" x2="16" y2="14" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" />
      {/* Crossbar */}
      <line x1="7" y1="14" x2="25" y2="14" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      {/* Left upright */}
      <line x1="7" y1="14" x2="7" y2="4" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" />
      {/* Right upright */}
      <line x1="25" y1="14" x2="25" y2="4" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Football with arc motion line — represents a punt in flight */
export function PuntFootIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Motion arc — shows the ball was kicked upward */}
      <path d="M6 24 Q10 6 22 10" stroke="#64748b" strokeWidth="1.5" strokeDasharray="2 2" strokeLinecap="round" fill="none" />
      {/* Football — tilted, in flight */}
      <g transform="translate(20, 8) rotate(30)">
        <ellipse cx="0" cy="0" rx="7" ry="4" fill="#7c3a1a" />
        <ellipse cx="0" cy="0" rx="7" ry="4" fill="none" stroke="#5c2a0e" strokeWidth="0.8" />
        {/* Seam */}
        <line x1="-4" y1="0" x2="4" y2="0" stroke="white" strokeWidth="1" strokeLinecap="round" />
        {/* Laces */}
        <line x1="-2" y1="-1.5" x2="-2" y2="1.5" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="0" y1="-1.8" x2="0" y2="1.8" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="2" y1="-1.5" x2="2" y2="1.5" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
      </g>
      {/* Kick origin marker */}
      <circle cx="6" cy="24" r="1.5" fill="#94a3b8" />
    </svg>
  );
}

/** Football standing upright on a tee */
export function KickoffTeeIcon({ className, size = 24 }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Tee — rubber tee shape */}
      <path d="M11 24 L14 20 L18 20 L21 24 Z" fill="#f97316" stroke="#ea580c" strokeWidth="1" strokeLinejoin="round" />
      {/* Ground line */}
      <line x1="8" y1="24" x2="24" y2="24" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      {/* Football — upright on tee */}
      <g transform="translate(16, 12)">
        <ellipse cx="0" cy="0" rx="4" ry="7.5" fill="#7c3a1a" />
        <ellipse cx="0" cy="0" rx="4" ry="7.5" fill="none" stroke="#5c2a0e" strokeWidth="0.8" />
        {/* Seam */}
        <line x1="0" y1="-4" x2="0" y2="4" stroke="white" strokeWidth="1" strokeLinecap="round" />
        {/* Laces */}
        <line x1="-1.5" y1="-2" x2="1.5" y2="-2" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="-1.8" y1="0" x2="1.8" y2="0" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="-1.5" y1="2" x2="1.5" y2="2" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
      </g>
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
