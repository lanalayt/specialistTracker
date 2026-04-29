"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { saveSettingsToCloud, loadSettingsFromCloud } from "@/lib/settingsSync";

export interface SnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
  zoneCell?: string;
  missCell?: string;
}

export interface ZoneBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface PunterStrikeZoneProps {
  markers?: SnapMarker[];
  onSnap?: (marker: SnapMarker) => void;
  nextNum?: number;
  chartMode?: "simple" | "detailed";
  missMode?: "simple" | "detailed";
  editable?: boolean;
}

// Default strike zone — preset
const DEFAULT_ZONE: ZoneBounds = { top: 50, bottom: 73, left: 25, right: 75 };
const ZONE_STORAGE_KEY = "strikeZoneBounds_v2";

function loadZone(): ZoneBounds {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (raw) { const z = JSON.parse(raw); if (z.top != null) return z; }
  } catch {}
  return { ...DEFAULT_ZONE };
}

function saveZone(z: ZoneBounds) {
  try { localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(z)); } catch {}
  saveSettingsToCloud(ZONE_STORAGE_KEY, z);
}

const CELL_ROWS = ["T", "M", "B"];
const CELL_COLS = ["L", "C", "R"];

const CELL_ARROWS: Record<string, string> = {
  TL: "↖", TC: "↑", TR: "↗",
  ML: "←", MC: "✓", MR: "→",
  BL: "↙", BC: "↓", BR: "↘",
};

const MISS_ARROWS: Record<string, string> = {
  HIGH_L: "↖", HIGH: "↑", HIGH_R: "↗",
  LEFT: "←", RIGHT: "→",
  LOW_L: "↙", LOW: "↓", LOW_R: "↘",
};

function isInZone(xPct: number, yPct: number, zone: ZoneBounds): boolean {
  return xPct >= zone.left && xPct <= zone.right && yPct >= zone.top && yPct <= zone.bottom;
}

function getZoneCell(xPct: number, yPct: number, zone: ZoneBounds): string | undefined {
  if (!isInZone(xPct, yPct, zone)) return undefined;
  const zoneW = zone.right - zone.left;
  const zoneH = zone.bottom - zone.top;
  const relX = (xPct - zone.left) / zoneW;
  const relY = (yPct - zone.top) / zoneH;
  const col = relX < 1 / 3 ? 0 : relX < 2 / 3 ? 1 : 2;
  const row = relY < 1 / 3 ? 0 : relY < 2 / 3 ? 1 : 2;
  return CELL_ROWS[row] + CELL_COLS[col];
}

function getMissCell(xPct: number, yPct: number, zone: ZoneBounds): string {
  const isAbove = yPct < zone.top;
  const isBelow = yPct > zone.bottom;
  const isLeft = xPct < zone.left;
  const isRight = xPct > zone.right;
  if (isAbove && isLeft) return "HIGH_L";
  if (isAbove && isRight) return "HIGH_R";
  if (isBelow && isLeft) return "LOW_L";
  if (isBelow && isRight) return "LOW_R";
  if (isAbove) {
    const relX = (xPct - zone.left) / (zone.right - zone.left);
    if (relX < 0.33) return "HIGH_L";
    if (relX > 0.67) return "HIGH_R";
    return "HIGH";
  }
  if (isBelow) {
    const relX = (xPct - zone.left) / (zone.right - zone.left);
    if (relX < 0.33) return "LOW_L";
    if (relX > 0.67) return "LOW_R";
    return "LOW";
  }
  if (isLeft) return "LEFT";
  if (isRight) return "RIGHT";
  return "HIGH";
}

type DragEdge = "top" | "bottom" | "left" | "right" | null;

export function PunterStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode = "simple", missMode = "simple", editable = false }: PunterStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<ZoneBounds>(loadZone);
  const [dragEdge, setDragEdge] = useState<DragEdge>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Load from cloud on mount
  useEffect(() => {
    loadSettingsFromCloud<ZoneBounds>(ZONE_STORAGE_KEY).then((cloud) => {
      if (cloud && cloud.top != null) { setZone(cloud); try { localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(cloud)); } catch {} }
    });
  }, []);
  const isDetailedStrike = chartMode === "detailed";
  const isDetailedMiss = missMode === "detailed";

  useEffect(() => { saveZone(zone); }, [zone]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing || dragEdge) return; // Don't place markers while editing zone
    if (!onSnap || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone = isInZone(xPct, yPct, zone);
    const zoneCell = isDetailedStrike && inZone ? getZoneCell(xPct, yPct, zone) : undefined;
    const missCell = isDetailedMiss && !inZone ? getMissCell(xPct, yPct, zone) : undefined;
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone, zoneCell, missCell });
  };

  const handleEdgeDrag = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!dragEdge || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const yPct = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    const xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    setZone((prev) => {
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

  const resetZone = () => { setZone({ ...DEFAULT_ZONE }); };

  const handleStyle = "absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20";

  return (
    <div className="flex justify-center">
      <div className="space-y-2">
        <div
          ref={containerRef}
          onClick={handleClick}
          className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none overflow-hidden flex flex-col items-center"
          style={{ width: 280, background: "#000000", paddingTop: 30, paddingBottom: 10 }}
        >
          {/* Player image */}
          <img
            src="/punter-silhouette.png"
            alt="Punter"
            className="pointer-events-none select-none"
            style={{ height: 400, width: "auto", objectFit: "contain" }}
            draggable={false}
          />

          {/* Detailed miss lines */}
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

          {/* Drag handles when editing */}
          {isEditing && (
            <>
              {/* Top edge */}
              <div
                className={handleStyle}
                style={{ top: `${zone.top}%`, left: `${zone.left}%`, width: `${zone.right - zone.left}%`, height: 6, transform: "translateY(-50%)", cursor: "ns-resize" }}
                onMouseDown={(e) => { e.stopPropagation(); setDragEdge("top"); }}
              />
              {/* Bottom edge */}
              <div
                className={handleStyle}
                style={{ top: `${zone.bottom}%`, left: `${zone.left}%`, width: `${zone.right - zone.left}%`, height: 6, transform: "translateY(-50%)", cursor: "ns-resize" }}
                onMouseDown={(e) => { e.stopPropagation(); setDragEdge("bottom"); }}
              />
              {/* Left edge */}
              <div
                className={handleStyle}
                style={{ top: `${zone.top}%`, left: `${zone.left}%`, width: 6, height: `${zone.bottom - zone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }}
                onMouseDown={(e) => { e.stopPropagation(); setDragEdge("left"); }}
              />
              {/* Right edge */}
              <div
                className={handleStyle}
                style={{ top: `${zone.top}%`, left: `${zone.right}%`, width: 6, height: `${zone.bottom - zone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }}
                onMouseDown={(e) => { e.stopPropagation(); setDragEdge("right"); }}
              />
            </>
          )}

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

        {/* Edit controls */}
        {editable && (
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setIsEditing((v) => !v)}
              className={`text-[10px] px-2 py-1 rounded-input border font-semibold transition-all ${isEditing ? "border-accent/50 text-accent bg-accent/10" : "border-border text-muted hover:text-white"}`}
            >
              {isEditing ? "Done Editing" : "Edit Zone"}
            </button>
            {isEditing && (
              <button
                onClick={resetZone}
                className="text-[10px] px-2 py-1 rounded-input border border-border text-muted hover:text-white font-semibold transition-all"
              >
                Reset Default
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
