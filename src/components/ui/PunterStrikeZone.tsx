"use client";

export function PunterStrikeZone() {
  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 200 340" width="200" height="340" className="drop-shadow-lg">
        {/* Punter — facing viewer, simple front silhouette */}
        {/* Head */}
        <circle cx="100" cy="40" r="22" fill="#cbd5e1" />
        {/* Neck */}
        <rect x="93" y="60" width="14" height="12" rx="3" fill="#cbd5e1" />
        {/* Torso */}
        <path
          d="M70 72 L130 72 L126 170 L74 170 Z"
          fill="#94a3b8"
          stroke="#64748b"
          strokeWidth="1"
        />
        {/* Shoulders */}
        <path
          d="M70 72 Q60 72 52 82 L56 90 Q62 80 70 78 Z"
          fill="#94a3b8"
        />
        <path
          d="M130 72 Q140 72 148 82 L144 90 Q138 80 130 78 Z"
          fill="#94a3b8"
        />
        {/* Arms */}
        <path d="M52 82 L40 140 L48 143 L56 90" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
        <path d="M148 82 L160 140 L152 143 L144 90" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
        {/* Hands */}
        <circle cx="40" cy="143" r="6" fill="#cbd5e1" />
        <circle cx="160" cy="143" r="6" fill="#cbd5e1" />
        {/* Hips / waist */}
        <path
          d="M74 170 L126 170 L130 185 L70 185 Z"
          fill="#475569"
          stroke="#334155"
          strokeWidth="1"
        />
        {/* Legs */}
        <path d="M70 185 L65 290 L80 290 L90 185" fill="#64748b" stroke="#475569" strokeWidth="0.5" />
        <path d="M110 185 L120 290 L135 290 L130 185" fill="#64748b" stroke="#475569" strokeWidth="0.5" />
        {/* Feet */}
        <ellipse cx="72" cy="295" rx="14" ry="6" fill="#475569" />
        <ellipse cx="128" cy="295" rx="14" ry="6" fill="#475569" />

        {/* Strike zone box — nipple line to knee line, ~1 ball width outside body */}
        {/* Nipple line ≈ y=95, Knee line ≈ y=250 */}
        {/* Body width ≈ 70-130, ball width ~10px each side → 60-140 */}
        <rect
          x="55"
          y="95"
          width="90"
          height="155"
          rx="4"
          fill="rgba(0, 212, 160, 0.12)"
          stroke="rgba(0, 212, 160, 0.5)"
          strokeWidth="2"
          strokeDasharray="6 3"
        />
      </svg>
    </div>
  );
}
