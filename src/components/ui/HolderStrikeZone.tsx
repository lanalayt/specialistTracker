"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import clsx from "clsx";
import { getCachedSettings, saveSettingsToCloud, useSettings } from "@/lib/settingsSync";

export interface ShortSnapMarker {
  x: number;
  y: number;
  num: number;
  inZone: boolean;
  /** Stable identity for edit interactions (e.g. the snap's index). */
  id?: number;
}

/** Single-direction result of where a marker landed relative to the zone. */
export type SnapDir = "ON_TARGET" | "HIGH" | "LOW" | "LEFT" | "RIGHT";

interface HolderStrikeZoneProps {
  markers?: ShortSnapMarker[];
  onSnap?: (marker: ShortSnapMarker) => void;
  nextNum?: number;
  chartMode?: "simple" | "detailed";
  missMode?: "simple" | "detailed";
  editable?: boolean;
  flipped?: boolean;
  /** Enable moving existing markers: tap a marker to select, tap the field to move it. */
  editableMarkers?: boolean;
  /** Id of the currently selected marker (highlighted). */
  selectedId?: number | null;
  /** Called when a marker is tapped. */
  onMarkerSelect?: (id: number) => void;
  /** Called when the field is tapped while a marker is selected — new location. */
  onPlace?: (x: number, y: number, inZone: boolean, dir: SnapDir) => void;
}

function dirFromPoint(xPct: number, yPct: number, zone: HolderZone): SnapDir {
  if (isInZone(xPct, yPct, zone)) return "ON_TARGET";
  if (yPct < zone.top) return "HIGH";
  if (yPct > zone.bottom) return "LOW";
  if (xPct < zone.left) return "LEFT";
  if (xPct > zone.right) return "RIGHT";
  return "HIGH";
}

type HolderZone = { top: number; bottom: number; left: number; right: number };

const DEFAULT_HOLDER_ZONE: HolderZone = { top: 45, bottom: 78, left: 42, right: 76 };
const HOLDER_ZONE_KEY = "holderStrikeZoneBounds";

function loadHolderZone(): HolderZone {
  const z = getCachedSettings<HolderZone>(HOLDER_ZONE_KEY);
  if (z && z.top != null) return z;
  return { ...DEFAULT_HOLDER_ZONE };
}
function saveHolderZone(z: HolderZone) {
  saveSettingsToCloud(HOLDER_ZONE_KEY, z);
}

function isInZone(xPct: number, yPct: number, zone: HolderZone): boolean {
  return xPct >= zone.left && xPct <= zone.right && yPct >= zone.top && yPct <= zone.bottom;
}

function loadSnapSettings(): { chartMode: "simple" | "detailed"; missMode: "simple" | "detailed" } {
  const p = getCachedSettings<{ chartMode?: string; missMode?: string }>("snapSettings");
  return {
    chartMode: p?.chartMode === "detailed" ? "detailed" : "simple",
    missMode: p?.missMode === "detailed" ? "detailed" : "simple",
  };
}

type DragEdge = "top" | "bottom" | "left" | "right" | null;

export function HolderStrikeZone({ markers = [], onSnap, nextNum = 1, chartMode, missMode, editable = false, flipped = false, editableMarkers = false, selectedId = null, onMarkerSelect, onPlace }: HolderStrikeZoneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState(loadHolderZone);
  const [dragEdge, setDragEdge] = useState<DragEdge>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [settings] = useState(() => loadSnapSettings());
  const isDetailedStrike = (chartMode ?? settings.chartMode) === "detailed";
  const isDetailedMiss = (missMode ?? settings.missMode) === "detailed";

  // Once the user edits, stop adopting the DB value and start persisting.
  const userEdited = useRef(false);

  // The DB (user_settings) is the source of truth. Subscribe so the saved zone
  // is adopted whenever it arrives — including after the first paint — until the
  // user starts editing.
  const dbZone = useSettings<HolderZone>(HOLDER_ZONE_KEY);
  useEffect(() => {
    if (!userEdited.current && dbZone && dbZone.top != null) setZone(dbZone);
  }, [dbZone]);

  // Persist only the user's own edits (never echo an adopted DB value back).
  useEffect(() => { if (userEdited.current) saveHolderZone(zone); }, [zone]);

  // Mirror zone horizontally when flipped
  const displayZone = flipped
    ? { top: zone.top, bottom: zone.bottom, left: 100 - zone.right, right: 100 - zone.left }
    : zone;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing || dragEdge) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const inZone2 = isInZone(xPct, yPct, displayZone);
    // Edit mode: relocate the selected marker instead of adding a new one.
    if (editableMarkers) {
      if (onPlace) onPlace(xPct, yPct, inZone2, dirFromPoint(xPct, yPct, displayZone));
      return;
    }
    if (!onSnap) return;
    onSnap({ x: xPct, y: yPct, num: nextNum, inZone: inZone2 });
  };

  const handleEdgeDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragEdge || !containerRef.current) return;
    const pt = "touches" in e ? e.touches[0] : e;
    if (!pt) return;
    const rect = containerRef.current.getBoundingClientRect();
    const yPct = Math.max(5, Math.min(95, ((pt.clientY - rect.top) / rect.height) * 100));
    const xPct = Math.max(5, Math.min(95, ((pt.clientX - rect.left) / rect.width) * 100));
    userEdited.current = true;
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

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        onClick={handleClick}
        className="relative border-2 border-slate-400/60 rounded-lg cursor-crosshair select-none overflow-hidden flex items-end w-full max-w-[300px]"
        style={{ aspectRatio: "300/260", background: "#000000", padding: 0 }}
      >
        {/* Holder image */}
        <img
          src="/holder-silhouette.png?v=7"
          alt="Holder"
          className="pointer-events-none select-none"
          style={{ height: "130%", width: "auto", objectFit: "contain", position: "absolute", bottom: "-23%", ...(flipped ? { right: 0, marginRight: "-7%", transform: "scaleX(-1)" } : { left: 0, marginLeft: "-7%" }) }}
          draggable={false}
        />

        {/* Detailed miss lines — zone edges extended to outer box */}
        {isDetailedMiss && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1={displayZone.left} y1="0" x2={displayZone.left} y2={displayZone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={displayZone.left} y1={displayZone.bottom} x2={displayZone.left} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={displayZone.right} y1="0" x2={displayZone.right} y2={displayZone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={displayZone.right} y1={displayZone.bottom} x2={displayZone.right} y2="100" stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1="0" y1={displayZone.top} x2={displayZone.left} y2={displayZone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={displayZone.right} y1={displayZone.top} x2="100" y2={displayZone.top} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1="0" y1={displayZone.bottom} x2={displayZone.left} y2={displayZone.bottom} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
            <line x1={displayZone.right} y1={displayZone.bottom} x2="100" y2={displayZone.bottom} stroke="rgba(239,68,68,0.25)" strokeWidth="0.4" />
          </svg>
        )}

        {/* Strike zone box overlay */}
        <div
          className="absolute border-2 border-red-500 rounded pointer-events-none"
          style={{
            top: `${displayZone.top}%`,
            left: `${displayZone.left}%`,
            width: `${displayZone.right - displayZone.left}%`,
            height: `${displayZone.bottom - displayZone.top}%`,
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

        {/* Drag handles when editing */}
        {isEditing && (
          <>
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${displayZone.top}%`, left: `${displayZone.left}%`, width: `${displayZone.right - displayZone.left}%`, height: 6, transform: "translateY(-50%)", cursor: "ns-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("top"); }} onTouchStart={(e) => { e.stopPropagation(); setDragEdge("top"); }} />
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${displayZone.bottom}%`, left: `${displayZone.left}%`, width: `${displayZone.right - displayZone.left}%`, height: 6, transform: "translateY(-50%)", cursor: "ns-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("bottom"); }} onTouchStart={(e) => { e.stopPropagation(); setDragEdge("bottom"); }} />
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${displayZone.top}%`, left: `${displayZone.left}%`, width: 6, height: `${displayZone.bottom - displayZone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("left"); }} onTouchStart={(e) => { e.stopPropagation(); setDragEdge("left"); }} />
            <div className="absolute bg-red-500/60 hover:bg-red-500 transition-colors z-20" style={{ top: `${displayZone.top}%`, left: `${displayZone.right}%`, width: 6, height: `${displayZone.bottom - displayZone.top}%`, transform: "translateX(-50%)", cursor: "ew-resize" }} onMouseDown={(e) => { e.stopPropagation(); setDragEdge("right"); }} onTouchStart={(e) => { e.stopPropagation(); setDragEdge("right"); }} />
          </>
        )}
      </div>

      {/* Edit controls */}
      {editable && (
        <div className="flex gap-1 justify-center mt-1">
          <button onClick={() => setIsEditing((v) => !v)} className={`text-[8px] px-1.5 py-0.5 rounded border font-semibold transition-all ${isEditing ? "border-accent/50 text-accent bg-accent/10" : "border-border/50 text-muted/60 hover:text-white"}`}>{isEditing ? "Done" : "Edit Zone"}</button>
          {isEditing && <button onClick={() => { userEdited.current = true; setZone({ ...DEFAULT_HOLDER_ZONE }); }} className="text-[8px] px-1.5 py-0.5 rounded border border-border/50 text-muted/60 hover:text-white font-semibold transition-all">Reset</button>}
        </div>
      )}
    </div>
  );
}
