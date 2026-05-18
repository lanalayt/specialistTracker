"use client";

import { useState } from "react";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { getTeamId } from "@/lib/teamData";
import { insertSession, stampSessionWrite } from "@/lib/sessionStore";
import { genId, sessionLabel } from "@/lib/stats";
import type { LongSnapEntry, SnapType, SnapAccuracy } from "@/types";
import clsx from "clsx";

interface Props {
  snapType: "FG" | "PUNT";
  snapper: string;
  onClose: () => void;
  onSaved?: () => void;
}

function formatSnapTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";
  if (digits.length === 1) return `0.0${digits}`;
  if (digits.length === 2) return `0.${digits}`;
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function AthleteSnapPopup({ snapType, snapper, onClose, onSaved }: Props) {
  const isFG = snapType === "FG";

  // FG: diagram-based
  const [holderSide, setHolderSide] = useState<"right" | "left">("right");
  const [marker, setMarker] = useState<ShortSnapMarker | null>(null);
  const [laces, setLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [spiral, setSpiral] = useState<"Good" | "Bad" | "">("");

  // Punt: simple buttons + time
  const [time, setTime] = useState("");
  const [accuracy, setAccuracy] = useState<"good" | "bad" | "">("");

  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [totalLogged, setTotalLogged] = useState(0);

  const canSave = isFG
    ? !!marker && !!laces && !!spiral
    : !!accuracy && !!spiral;

  const handleSnapClick = (m: ShortSnapMarker) => {
    setMarker(m);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const tid = getTeamId();
    if (!tid) { setSaving(false); return; }

    const acc = isFG
      ? (marker?.inZone ? "ON_TARGET" : "HIGH")
      : (accuracy === "good" ? "ON_TARGET" : "HIGH");
    const timeNum = !isFG && time ? parseFloat(formatSnapTime(time)) : 0;

    const entry: LongSnapEntry = {
      athleteId: snapper,
      athlete: snapper,
      snapType: snapType as SnapType,
      time: timeNum,
      accuracy: acc as SnapAccuracy,
      laces: isFG ? laces || undefined : undefined,
      spiral: spiral || undefined,
      score: acc === "ON_TARGET" ? 1 : 0,
      markerX: marker?.x,
      markerY: marker?.y,
      markerInZone: marker?.inZone,
    };

    const sportKey = isFG ? "ATHLETE_SHORTSNAP" : "ATHLETE_LONGSNAP";
    const session = {
      id: genId(),
      teamId: tid,
      sport: sportKey,
      label: `${isFG ? "Short" : "Long"} Snap — ${snapper}`,
      date: new Date().toISOString(),
      mode: "practice" as const,
      entries: [entry],
    };

    stampSessionWrite(tid);
    await insertSession(tid, session as any);
    setSaving(false);
    setTotalLogged((prev) => prev + 1);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
    onSaved?.();
    // Reset for next snap — don't close
    setMarker(null);
    setLaces("");
    setSpiral("");
    setAccuracy("");
    setTime("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm mx-4 p-4 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">{isFG ? "Short" : "Long"} Snap — {snapper}</h3>
            {totalLogged > 0 && <p className="text-[10px] text-sky-400">{totalLogged} snap{totalLogged !== 1 ? "s" : ""} logged</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xs">Done</button>
        </div>
        {justSaved && <p className="text-xs text-make font-bold text-center">Saved!</p>}

        {isFG ? (
          <>
            {/* Holder side toggle */}
            <div className="flex rounded-input border border-border overflow-hidden w-fit">
              <button onClick={() => setHolderSide("right")} className={clsx("px-3 py-1 text-[10px] font-semibold transition-colors", holderSide === "right" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Right</button>
              <button onClick={() => setHolderSide("left")} className={clsx("px-3 py-1 text-[10px] font-semibold transition-colors border-l border-border", holderSide === "left" ? "bg-sky-500 text-slate-900" : "text-muted hover:text-white")}>Left</button>
            </div>

            {/* Holder diagram */}
            <div className={clsx("flex items-center gap-1", holderSide === "left" && "flex-row-reverse")}>
              <div className="flex flex-col gap-1 shrink-0">
                <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Laces</p>
                <button onClick={() => setLaces("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
                <button onClick={() => setLaces("1/4 Turn")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4</button>
                <button onClick={() => setLaces("Back")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
              </div>
              <div className="flex-1 min-w-0" style={holderSide === "left" ? { transform: "scaleX(-1)" } : undefined}>
                <HolderStrikeZone
                  markers={marker ? [{ ...marker, num: 1 }] : []}
                  onSnap={handleSnapClick}
                  nextNum={1}
                  chartMode="simple"
                  missMode="simple"
                  editable
                />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Spiral</p>
                <button onClick={() => setSpiral("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                <button onClick={() => setSpiral("Bad")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
              </div>
            </div>

            {marker && (
              <p className="text-center text-xs">
                <span className={clsx("font-bold", marker.inZone ? "text-make" : "text-miss")}>{marker.inZone ? "Strike" : "Ball"}</span>
              </p>
            )}
          </>
        ) : (
          <>
            {/* Punt snap: time + accuracy + spiral */}
            <div>
              <p className="text-[10px] text-muted mb-1">Time</p>
              <input type="text" inputMode="numeric" value={time ? formatSnapTime(time) : ""} onChange={(e) => setTime(e.target.value.replace(/\D/g, ""))} placeholder="0.76" className="input w-24 text-center text-sm font-bold py-1.5" />
            </div>

            <div>
              <p className="text-[10px] text-muted mb-1">Accuracy</p>
              <div className="flex gap-1">
                <button onClick={() => setAccuracy("good")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", accuracy === "good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Good</button>
                <button onClick={() => setAccuracy("bad")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", accuracy === "bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Bad</button>
              </div>
            </div>

            <div>
              <p className="text-[10px] text-muted mb-1">Spiral</p>
              <div className="flex gap-1">
                <button onClick={() => setSpiral("Good")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                <button onClick={() => setSpiral("Bad")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
              </div>
            </div>
          </>
        )}

        <button onClick={handleSave} disabled={!canSave || saving} className="btn-primary w-full py-2 text-sm font-bold disabled:opacity-40">
          {saving ? "Saving..." : "Log Snap"}
        </button>
      </div>
    </div>
  );
}
