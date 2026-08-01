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

/** Kicker follow-through — matches the FG module tile art (theme-neutral PNG) */
export function KickerIcon({ className, size = 24 }: IconProps) {
  return (
    <img src="/kicker-fg.png" alt="" style={{ height: size, width: "auto", objectFit: "contain" }} className={className} />
  );
}

/** Punter follow-through — matches the punt module tile art (theme-neutral PNG) */
export function PuntFootIcon({ className, size = 24 }: IconProps) {
  return (
    <img src="/punter.png" alt="" style={{ height: size, width: "auto", objectFit: "contain" }} className={className} />
  );
}

/** Long snapper reaching for the ball — matches the snap module tile art (theme-neutral PNG) */
export function SnapperIcon({ className, size = 24 }: IconProps) {
  return (
    <img src="/snapper.png" alt="" style={{ height: size, width: "auto", objectFit: "contain" }} className={className} />
  );
}

/** Kickoff kicker striking a teed ball — matches the kickoff module tile art (theme-neutral PNG) */
export function KickoffTeeIcon({ className, size = 24 }: IconProps) {
  return (
    <img src="/kickoff-kicker.png" alt="" style={{ height: size, width: "auto", objectFit: "contain" }} className={className} />
  );
}

/** Map sport key to icon component */
export function SportIcon({ sport, size = 24, className }: { sport: string; size?: number; className?: string }) {
  switch (sport) {
    case "KICKING": return <GoalpostIcon size={size} className={className} />;
    case "PUNTING": return <PuntFootIcon size={size} className={className} />;
    case "KICKOFF": return <KickoffTeeIcon size={size} className={className} />;
    case "LONGSNAP": return <SnapperIcon size={size} className={className} />;
    default: return <span className={className} style={{ fontSize: size }}>📋</span>;
  }
}
