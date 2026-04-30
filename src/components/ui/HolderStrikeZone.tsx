"use client";

import { useRef, useState, useEffect, useCallback } from "react";

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
  chartMode?: "simple" | "detailed";
  missMode?: "simple" | "detailed";
  editable?: boolean;
}

const DEFAULT_HOLDER_ZONE = { top: 45, bottom: 78, left: 42, right: 76 };
const HOLDER_ZONE_KEY = "holderStrikeZoneBounds";

function loadHolderZone() {
  try { const r = localStorage.getItem(HOLDER_ZONE_KEY); if (r) { const z = JSON.parse(r); if (z.top != null) return z; } } catch {}
  return { ...DEFAULT_HOLDER_ZONE };
}
function saveHolderZone(z: typeof DEFAULT_HOLDER_ZONE) {
  try { localStorage.setItem(HOLDER_ZONE_KEY, JSON.stringify(z)); } catch {}
}

function isInZone(xPct: number, yPct: number, zone: typeof DEFAULT_HOLDER_ZONE): boolean {
  return xPct >= zone.left && xPct <= zone.right && yPct >= zone.top && yPct <= zone.bottom;
}

function loadSnapSettings(): { chartMode: "simple" | "detailed"; missMode: "simple" | "detailed" } {
  try {
    const raw = localStorage.getItem("snapSettings");
    if (raw) {
      const p = JSON.parse(raw);
      return { chartMode: p.chartMode === "detailed" ? "detailed" : "simple", missMode: p.missMode === "detailed" ? "detailed" : "simple" };
    }
  } catch {}
  return { chartMode: "simple", missMode: "simple" };
}

type DragEdge = "top" | "bottom" | "left" | "right" | null;

export function HolderStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode, missMode, editable = false }: HolderStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState(loadHolderZone);
  const [dragEdge, setDragEdge] = useState<DragEdge>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [settings] = useState(() => loadSnapSettings());
  const isDetailedStrike = (chartMode ?? settings.chartMode) === "detailed";
  const isDetailedMiss = (missMode ?? settings.missMode) === "detailed";

  useEffect(() => { saveHolderZone(zone); }, [zone]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing || dragEdge) return;
    if (!onSnap || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone2 = isInZone(xPct, yPct, zone);
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone: inZone2 });
  };

  const handleEdgeDrag = useCallback((e: MouseEvent) => {
    if (!dragEdge || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const yPct = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    const xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    setZone((prev: typeof DEFAULT_HOLDER_ZONE) => {
      if (dragEdge === "top") return { ...prev, top: Math.min(yPct, prev.bottom - 10) };
      if (dragEdge === "bottom") return { ...prev, bottom: Math.max(yPct, prev.top + 10) };
      if (dragEdge === "left") return { ...prev, left: Math.min(xPct, prev.right - 10) };
      if (dragEdge === "right") return { ...prev, right: Math.max(xPct, prev.left + 10) };
      return prev;
    });
  }, [dragEdge]);

  useEffect(() => {
    if (!dragEdge) return;
    const handleMove = (e: MouseEvent) => handleEdgeDrag(e);
    const handleUp = () => setDragEdge(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [dragEdge, handleEdgeDrag]);

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        onClick={handleClick}
        className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none overflow-hidden flex items-end"
        style={{ width: 300, height: 260, background: "#000000", padding: 0 }}
      >
        {/* Holder image — left side, scaled up */}
        <img
          src="/holder-silhouette.png?v=7"
          alt="Holder"
          className="pointer-events-none select-none"
          style={{ height: "130%", width: "auto", objectFit: "contain", marginLeft: -20, position: "absolute", bottom: -60, left: 0 }}
          draggable={false}
        />

        {/* Detailed miss lines — zone edges extended to outer box */}
        {isDetailedMiss && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1={zone.left} y1="0" x2={zone.left} y2={zone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={zone.left} y1={zone.bottom} x2={zone.left} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={zone.right} y1="0" x2={zone.right} y2={zone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={zone.right} y1={zone.bottom} x2={zone.right} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1="0" y1={zone.top} x2={zone.left} y2={zone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={zone.right} y1={zone.top} x2="100" y2={zone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1="0" y1={zone.bottom} x2={zone.left} y2={zone.bottom} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={zone.right} y1={zone.bottom} x2="100" y2={zone.bottom} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
          </svg>
        )}

        {/* Strike zone box overlay */}
        <div
          className="absolute border-2 border-red-500 rounded pointer-events-none"
          style={{
            top: `${zone.top}%`,
            left: `${zone.left}%`,
            width: `${zone.right - zone.left}%`,
            height: `${zone.bottom - zone.top}%`,
            backgroundColor: "rgba(239, 68, 68, 0.06)",
            ...(isDetailedStrike ? {
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gridTemplateRows: "1fr 1fr 1fr",
            } : {}),
          }}
        >
          {isDetailedStrike && Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border pointer-events-none" style={{ borderColor: "rgba(239, 68, 68, 0.35)" }} />
          ))}
        </div>

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

        {/* Drag handles when editing */}
        {isEditing && (
          <>
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${zone.top}%`, left: `${zone.left}%`, width: `${zone.right - zone.left}%`, height: 6, transform: "translateY(-50%)", cursor: "ns-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("top"); }} />
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${zone.bottom}%`, left: `${zone.left}%`, width: `${zone.right - zone.left}%`, height: 6, transform: "translateY(-50%)", cursor: "ns-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("bottom"); }} />
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${zone.top}%`, left: `${zone.left}%`, width: 6, height: `${zone.bottom - zone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("left"); }} />
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${zone.top}%`, left: `${zone.right}%`, width: 6, height: `${zone.bottom - zone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("right"); }} />
          </>
        )}
      </div>

      {/* Edit controls */}
      {editable && (
        <div className="flex gap-1 justify-center mt-1">
          <button onClick={() => setIsEditing((v) => !v)} className={`text-[8px] px-1.5 py-0.5 rounded border font-semibold transition-all ${isEditing ? "border-accent/50 text-accent bg-accent/10" : "border-border/50 text-muted/60 hover:text-white"}`}>{isEditing ? "Done" : "Edit Zone"}</button>
          {isEditing && <button onClick={() => setZone({ ...DEFAULT_HOLDER_ZONE })} className="text-[8px] px-1.5 py-0.5 rounded border border-border/50 text-muted/60 hover:text-white font-semibold transition-all">Reset</button>}
        </div>
      )}
    </div>
  );
}
