"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import clsx from "clsx";
import { saveSettingsToCloud, getCachedSettings, useSettings } from "@/lib/settingsSync";
import type { SnapDir } from "@/components/ui/HolderStrikeZone";

export interface SnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
  zoneCell?: string;
  missCell?: string;
  /** Stable identity for edit interactions (e.g. the snap's index). */
  id?: number;
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
  /** Enable moving existing markers: tap a marker to select, tap the field to move it. */
  editableMarkers?: boolean;
  /** Id of the currently selected marker (highlighted). */
  selectedId?: number | null;
  /** Called when a marker is tapped. */
  onMarkerSelect?: (id: number) => void;
  /** Called when the field is tapped while a marker is selected — new location. */
  onPlace?: (x: number, y: number, inZone: boolean, dir: SnapDir) => void;
}

function dirFromPoint(xPct: number, yPct: number, zone: ZoneBounds): SnapDir {
  if (isInZone(xPct, yPct, zone)) return "ON_TARGET";
  if (yPct < zone.top) return "HIGH";
  if (yPct > zone.bottom) return "LOW";
  if (xPct < zone.left) return "LEFT";
  if (xPct > zone.right) return "RIGHT";
  return "HIGH";
}

// Default strike zone — preset. Narrowed width (v5) while keeping the same
// top/bottom height. Key bumped so the narrower width applies universally.
const DEFAULT_ZONE: ZoneBounds = { top: 34, bottom: 68, left: 38, right: 62 };
const ZONE_STORAGE_KEY = "strikeZoneBounds_v5";

function loadZone(): ZoneBounds {
  const z = getCachedSettings<ZoneBounds>(ZONE_STORAGE_KEY);
  if (z && z.top != null) return z;
  return { ...DEFAULT_ZONE };
}

function saveZone(z: ZoneBounds) {
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

export function PunterStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode = "simple", missMode = "simple", editable = false, editableMarkers = false, selectedId = null, onMarkerSelect, onPlace }: PunterStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<ZoneBounds>(loadZone);
  const [dragEdge, setDragEdge] = useState<DragEdge>(null);
  const [isEditing, setIsEditing] = useState(false);
  // Once the user edits, stop adopting the DB value and start persisting.
  const userEdited = useRef(false);

  // The DB (user_settings) is the source of truth. Subscribe so the saved zone
  // is adopted whenever it arrives — including after the first paint, when the
  // cache is warmed by preload/realtime — until the user starts editing.
  const dbZone = useSettings<ZoneBounds>(ZONE_STORAGE_KEY);
  useEffect(() => {
    if (!userEdited.current && dbZone && dbZone.top != null) setZone(dbZone);
  }, [dbZone]);

  const isDetailedStrike = chartMode === "detailed";
  const isDetailedMiss = missMode === "detailed";

  // Persist only the user's own edits (never echo an adopted DB value back).
  useEffect(() => { if (userEdited.current) saveZone(zone); }, [zone]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing || dragEdge) return; // Don't place markers while editing zone
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone = isInZone(xPct, yPct, zone);
    // Edit mode: relocate the selected marker instead of adding a new one.
    if (editableMarkers) {
      if (onPlace) onPlace(xPct, yPct, inZone, dirFromPoint(xPct, yPct, zone));
      return;
    }
    if (!onSnap) return;
    const zoneCell = isDetailedStrike && inZone ? getZoneCell(xPct, yPct, zone) : undefined;
    const missCell = isDetailedMiss && !inZone ? getMissCell(xPct, yPct, zone) : undefined;
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone, zoneCell, missCell });
  };

  const handleEdgeDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragEdge || !containerRef.current) return;
    const pt = "touches" in e ? e.touches[0] : e;
    if (!pt) return;
    const rect = containerRef.current.getBoundingClientRect();
    const yPct = Math.max(5, Math.min(95, ((pt.clientY - rect.top) / rect.height) * 100));
    const xPct = Math.max(5, Math.min(95, ((pt.clientX - rect.left) / rect.width) * 100));
    userEdited.current = true;
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
    const handleMove = (e: MouseEvent | TouchEvent) => { if ("touches" in e) e.preventDefault(); handleEdgeDrag(e); };
    const handleUp = () => setDragEdge(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [dragEdge, handleEdgeDrag]);

  const resetZone = () => { userEdited.current = true; setZone({ ...DEFAULT_ZONE }); };

  const handleStyle = "absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20";

  return (
    <div className="flex justify-center">
      <div className="space-y-2">
        <div
          ref={containerRef}
          onClick={handleClick}
          className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none overflow-hidden flex flex-col items-center w-full max-w-[280px]"
          style={{ background: "#000000", paddingTop: 30, paddingBottom: 10 }}
        >
          {/* Player image */}
          <img
            src="/punter-silhouette.png"
            alt="Punter"
            className="pointer-events-none select-none"
            style={{ height: "auto", width: "75%", maxHeight: 400, objectFit: "contain" }}
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
                onTouchStart={(e) => { e.stopPropagation(); setDragEdge("top"); }}
              />
              {/* Bottom edge */}
              <div
                className={handleStyle}
                style={{ top: `${zone.bottom}%`, left: `${zone.left}%`, width: `${zone.right - zone.left}%`, height: 6, transform: "translateY(-50%)", cursor: "ns-resize" }}
                onMouseDown={(e) => { e.stopPropagation(); setDragEdge("bottom"); }}
                onTouchStart={(e) => { e.stopPropagation(); setDragEdge("bottom"); }}
              />
              {/* Left edge */}
              <div
                className={handleStyle}
                style={{ top: `${zone.top}%`, left: `${zone.left}%`, width: 6, height: `${zone.bottom - zone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }}
                onMouseDown={(e) => { e.stopPropagation(); setDragEdge("left"); }}
                onTouchStart={(e) => { e.stopPropagation(); setDragEdge("left"); }}
              />
              {/* Right edge */}
              <div
                className={handleStyle}
                style={{ top: `${zone.top}%`, left: `${zone.right}%`, width: 6, height: `${zone.bottom - zone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }}
                onMouseDown={(e) => { e.stopPropagation(); setDragEdge("right"); }}
                onTouchStart={(e) => { e.stopPropagation(); setDragEdge("right"); }}
              />
            </>
          )}

          {/* Snap markers */}
          {markers.map((m) => {
            const selected = editableMarkers && m.id != null && m.id === selectedId;
            return (
              <div
                key={m.id ?? m.num}
                onClick={editableMarkers ? (e) => { e.stopPropagation(); if (m.id != null) onMarkerSelect?.(m.id); } : undefined}
                className={clsx(
                  "absolute flex items-center justify-center",
                  editableMarkers ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
                )}
                style={{
                  left: `${m.x}%`,
                  top: `${m.y}%`,
                  transform: `translate(-50%, -50%) scale(${selected ? 1.15 : 1})`,
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  backgroundColor: m.inZone ? "rgba(0, 212, 160, 0.85)" : "rgba(239, 68, 68, 0.85)",
                  border: selected ? "2px solid #ffffff" : `2px solid ${m.inZone ? "#00d4a0" : "#ef4444"}`,
                  boxShadow: selected ? "0 0 0 2px #fbbf24" : undefined,
                  zIndex: selected ? 10 : undefined,
                }}
              >
                <span className="text-[10px] font-black text-white leading-none">{m.num}</span>
              </div>
            );
          })}
        </div>

        {/* Edit controls */}
        {editable && (
          <div className="flex gap-1 justify-center mt-1">
            <button onClick={() => setIsEditing((v) => !v)} className={`text-[8px] px-1.5 py-0.5 rounded border font-semibold transition-all ${isEditing ? "border-accent/50 text-accent bg-accent/10" : "border-border/50 text-muted/60 hover:text-white"}`}>{isEditing ? "Done" : "Edit Zone"}</button>
            {isEditing && <button onClick={resetZone} className="text-[8px] px-1.5 py-0.5 rounded border border-border/50 text-muted/60 hover:text-white font-semibold transition-all">Reset</button>}
          </div>
        )}
      </div>
    </div>
  );
}
