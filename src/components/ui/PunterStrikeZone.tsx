"use client";

export function PunterStrikeZone() {
  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 220 380" width="220" height="380" className="drop-shadow-lg">
        <defs>
          {/* Skin gradient */}
          <radialGradient id="skinGrad" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#d4a574" />
            <stop offset="100%" stopColor="#b8895a" />
          </radialGradient>
          {/* Jersey gradient */}
          <linearGradient id="jerseyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="50%" stopColor="#334155" />
            <stop offset="100%" stopColor="#2d3a4a" />
          </linearGradient>
          {/* Pants gradient */}
          <linearGradient id="pantsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          {/* Shadow beneath */}
          <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.25)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          {/* Helmet gradient */}
          <radialGradient id="helmetGrad" cx="45%" cy="35%" r="55%">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>
        </defs>

        {/* Ground shadow */}
        <ellipse cx="110" cy="348" rx="50" ry="8" fill="url(#shadowGrad)" />

        {/* ── LEGS ── */}
        {/* Left leg */}
        <path
          d="M88 200 Q86 230 84 260 Q82 280 80 300 L78 310 Q78 316 85 316 L95 316 Q98 316 98 312 L96 300 Q94 280 94 260 Q94 240 95 220 L95 200"
          fill="url(#pantsGrad)" stroke="#94a3b8" strokeWidth="0.5"
        />
        {/* Right leg */}
        <path
          d="M125 200 Q127 230 129 260 Q131 280 133 300 L135 310 Q135 316 128 316 L118 316 Q115 316 115 312 L117 300 Q119 280 119 260 Q119 240 118 220 L118 200"
          fill="url(#pantsGrad)" stroke="#94a3b8" strokeWidth="0.5"
        />
        {/* Cleats */}
        <path d="M76 314 Q74 320 78 324 L96 324 Q100 320 98 314" fill="#1e293b" />
        <path d="M115 314 Q113 320 117 324 L135 324 Q139 320 137 314" fill="#1e293b" />
        {/* Cleat studs */}
        <rect x="80" y="323" width="3" height="3" rx="1" fill="#475569" />
        <rect x="87" y="323" width="3" height="3" rx="1" fill="#475569" />
        <rect x="94" y="323" width="3" height="3" rx="1" fill="#475569" />
        <rect x="119" y="323" width="3" height="3" rx="1" fill="#475569" />
        <rect x="126" y="323" width="3" height="3" rx="1" fill="#475569" />
        <rect x="133" y="323" width="3" height="3" rx="1" fill="#475569" />
        {/* Knee pads */}
        <ellipse cx="87" cy="262" rx="9" ry="12" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
        <ellipse cx="126" cy="262" rx="9" ry="12" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />

        {/* ── TORSO ── */}
        {/* Jersey body */}
        <path
          d="M72 88 Q70 90 68 100 L66 140 Q66 165 68 185 L70 200 Q80 205 110 205 Q140 205 143 200 L145 185 Q147 165 147 140 L145 100 Q143 90 141 88"
          fill="url(#jerseyGrad)" stroke="#2d3a4a" strokeWidth="1"
        />
        {/* Jersey number */}
        <text x="107" y="155" textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="42" fontWeight="900" fontFamily="sans-serif">8</text>
        {/* Jersey collar */}
        <path
          d="M90 82 Q100 86 107 86 Q114 86 123 82"
          fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round"
        />
        {/* Jersey seam lines */}
        <line x1="107" y1="88" x2="107" y2="200" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

        {/* ── SHOULDER PADS ── */}
        <path
          d="M56 78 Q58 70 72 68 L72 88 Q66 90 60 96 L52 96 Q50 90 56 78"
          fill="#4a5568" stroke="#2d3a4a" strokeWidth="1"
        />
        <path
          d="M158 78 Q156 70 141 68 L141 88 Q147 90 153 96 L161 96 Q163 90 158 78"
          fill="#4a5568" stroke="#2d3a4a" strokeWidth="1"
        />
        {/* Pad edge highlight */}
        <path d="M56 78 Q58 72 72 68" fill="none" stroke="#64748b" strokeWidth="1.5" />
        <path d="M158 78 Q156 72 141 68" fill="none" stroke="#64748b" strokeWidth="1.5" />

        {/* ── ARMS ── */}
        {/* Left arm */}
        <path
          d="M56 96 Q50 115 46 138 Q44 150 46 155"
          fill="none" stroke="url(#skinGrad)" strokeWidth="14" strokeLinecap="round"
        />
        {/* Right arm */}
        <path
          d="M158 96 Q163 115 167 138 Q169 150 167 155"
          fill="none" stroke="url(#skinGrad)" strokeWidth="14" strokeLinecap="round"
        />
        {/* Left forearm/hand */}
        <circle cx="46" cy="158" r="7" fill="#d4a574" stroke="#b8895a" strokeWidth="0.5" />
        {/* Right forearm/hand */}
        <circle cx="167" cy="158" r="7" fill="#d4a574" stroke="#b8895a" strokeWidth="0.5" />

        {/* ── NECK ── */}
        <path
          d="M95 68 Q100 72 107 72 Q114 72 118 68 L118 60 Q114 64 107 64 Q100 64 95 60 Z"
          fill="#d4a574"
        />

        {/* ── HELMET ── */}
        <ellipse cx="107" cy="42" rx="24" ry="26" fill="url(#helmetGrad)" />
        {/* Face mask */}
        <path
          d="M90 48 Q92 58 107 60 Q122 58 124 48"
          fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
        />
        <path
          d="M93 52 Q107 56 121 52"
          fill="none" stroke="#94a3b8" strokeWidth="1.5"
        />
        {/* Facemask bars */}
        <line x1="96" y1="48" x2="96" y2="56" stroke="#94a3b8" strokeWidth="1.2" />
        <line x1="107" y1="48" x2="107" y2="58" stroke="#94a3b8" strokeWidth="1.2" />
        <line x1="118" y1="48" x2="118" y2="56" stroke="#94a3b8" strokeWidth="1.2" />
        {/* Helmet stripe */}
        <path
          d="M107 16 Q107 18 107 42"
          fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3"
        />
        {/* Ear hole */}
        <ellipse cx="83" cy="44" rx="3" ry="5" fill="#2d3a4a" />
        <ellipse cx="131" cy="44" rx="3" ry="5" fill="#2d3a4a" />
        {/* Chin strap */}
        <path d="M86 56 Q86 64 95 66" fill="none" stroke="#64748b" strokeWidth="1.5" />
        <path d="M128 56 Q128 64 118 66" fill="none" stroke="#64748b" strokeWidth="1.5" />

        {/* ── BELT ── */}
        <rect x="68" y="196" width="77" height="6" rx="2" fill="#1e293b" />
        <rect x="103" y="195" width="8" height="8" rx="1.5" fill="#94a3b8" stroke="#64748b" strokeWidth="0.5" />

        {/* ═══ STRIKE ZONE BOX ═══ */}
        {/* Nipple line ≈ y=105, Knee line ≈ y=265 */}
        {/* Body edges ~68-145, one ball width (~12px) outside → 56-157 */}
        <rect
          x="54"
          y="105"
          width="105"
          height="160"
          rx="4"
          fill="rgba(0, 212, 160, 0.10)"
          stroke="rgba(0, 212, 160, 0.5)"
          strokeWidth="2"
          strokeDasharray="6 3"
        />
      </svg>
    </div>
  );
}
