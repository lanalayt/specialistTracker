"use client";

import { useState } from "react";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import type { LongSnapEntry, SnapType, SnapAccuracy } from "@/types";
import clsx from "clsx";

export interface SnapLogEntry {
  snapper: string;
  holder: string;
  accuracy: string;
  laces?: string;
  spiral: string;
  dbEntry: LongSnapEntry;
}

interface Props {
  snapType: "FG" | "PUNT";
  athletes: string[]; // snappers
  holders?: string[]; // holders (falls back to athletes if not provided)
  holderEnabled?: boolean; // show holder selection (default true for FG)
  kickerName?: string; // who's kicking
  kickDistance?: number; // distance of the kick
  kickHash?: string; // hash of the kick
  previousSnaps?: SnapLogEntry[]; // snaps already logged for this kick
  onClose: () => void;
  onSaved?: (entry: SnapLogEntry) => void;
  kickList?: { idx: number; kickNum: number; athlete: string; dist: string; pos: string; hasSnap: boolean; isActive: boolean }[];
  onKickSelect?: (idx: number) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2);
}

export function AthleteSnapPopup({ snapType, athletes, holders: holdersProp, holderEnabled = true, kickerName, kickDistance, kickHash, previousSnaps, onClose, onSaved, kickList, onKickSelect }: Props) {
  const isFG = snapType === "FG";
  const showHolder = isFG && holderEnabled;
  const holderList = holdersProp && holdersProp.length > 0 ? holdersProp : athletes;

  const [holderSide, setHolderSide] = useState<"right" | "left">("right");
  const [snapper, setSnapper] = useState(athletes[0] ?? "");
  const [holder, setHolder] = useState(holderList[0] ?? "");
  const [marker, setMarker] = useState<ShortSnapMarker | null>(null);
  const [laces, setLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [spiral, setSpiral] = useState<"Good" | "Bad" | "">("");

  // Punt
  const [puntMarker, setPuntMarker] = useState<SnapMarker | null>(null);
  const [snapTime, setSnapTime] = useState("");

  const parseTimeRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const canSave = isFG
    ? !!marker && !!laces && !!spiral && !!snapper
    : !!puntMarker && !!spiral && !!snapper;

  const handleSave = () => {
    if (!canSave) return;

    const acc = isFG ? (marker?.inZone ? "ON_TARGET" : "HIGH") : (puntMarker?.inZone ? "ON_TARGET" : "HIGH");
    const snapTimeVal = snapTime ? parseTimeRaw(snapTime) : 0;

    // Score: FG uses 30-point scoring (strike 1 + laces 0/0.5/1 + spiral 0/1 = max 3)
    // Punt uses simple strike/ball (1 or 0)
    let score = 0;
    if (isFG) {
      if (acc === "ON_TARGET") score += 1;
      if (laces === "Good") score += 1;
      else if (laces === "1/4 Turn") score += 0.5;
      if (spiral === "Good") score += 1;
    } else {
      score = acc === "ON_TARGET" ? 1 : 0;
    }

    const dbEntry: LongSnapEntry = {
      athleteId: snapper, athlete: snapper,
      snapType: (isFG ? "FG" : "PUNT") as SnapType, time: snapTimeVal,
      accuracy: acc as SnapAccuracy,
      laces: isFG ? laces || undefined : undefined,
      spiral: spiral || undefined,
      score,
      markerX: isFG ? marker?.x : puntMarker?.x, markerY: isFG ? marker?.y : puntMarker?.y,
      markerInZone: isFG ? marker?.inZone : puntMarker?.inZone,
    };

    const logEntry: SnapLogEntry = {
      snapper, holder: isFG ? holder : "",
      accuracy: isFG ? (marker?.inZone ? "Strike" : "Ball") : (puntMarker?.inZone ? "Strike" : "Ball"),
      laces: isFG ? laces || undefined : undefined,
      spiral: spiral === "Good" ? "Tight" : "Open",
      dbEntry,
    };
    onSaved?.(logEntry);
    // In team mode (kickList), stay open for next kick. In athlete mode, close.
    if (!kickList || kickList.length === 0) {
      onClose();
    } else {
      // Reset inputs for next snap
      setMarker(null);
      setPuntMarker(null);
      setLaces("");
      setSpiral("");
    }
  };

  const hashDisplay: Record<string, string> = { "Left Hash": "Left Hash", "LH": "Left Hash", "LM": "Left Middle", "M": "Middle", "RM": "Right Middle", "Right Hash": "Right Hash", "RH": "Right Hash" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm mx-4 p-4 space-y-3 max-h-[90vh] overflow-y-auto">
        {/* Title: kicker, distance, hash */}
        <div className="flex items-center justify-between">
          <div>
            {kickerName && kickDistance ? (
              <h3 className="text-sm font-bold text-slate-100">{kickerName} — {kickDistance} Yard Kick</h3>
            ) : (
              <h3 className="text-sm font-bold text-slate-100">{isFG ? "Short" : "Long"} Snap</h3>
            )}
            {kickHash && <p className="text-[10px] text-muted">{hashDisplay[kickHash] ?? kickHash}</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xs">Done</button>
        </div>

        {isFG ? (
          <>
            {/* Snapper + Holder + Right/Left toggle row */}
            <div className="flex items-start gap-3">
              <div>
                <p className="text-[8px] text-muted uppercase tracking-wider mb-1">Snapper</p>
                <div className="flex gap-1">
                  {athletes.map((a) => (
                    <button key={a} onClick={() => setSnapper(a)} className={clsx("w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center transition-all", snapper === a ? "bg-sky-500 text-slate-900" : "bg-surface-2 text-muted border border-border")} title={a}>{getInitials(a)}</button>
                  ))}
                </div>
              </div>
              {showHolder && <div className="w-px self-stretch bg-accent/60 mx-0.5" />}
              {showHolder && <div>
                <p className="text-[8px] text-muted uppercase tracking-wider mb-1">Holder</p>
                <div className="flex gap-1">
                  {holderList.map((a) => (
                    <button key={a} onClick={() => setHolder(a)} className={clsx("w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center transition-all", holder === a ? "bg-sky-500 text-slate-900" : "bg-surface-2 text-muted border border-border")} title={a}>{getInitials(a)}</button>
                  ))}
                  <button onClick={() => setHolder("")} className={clsx("w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center transition-all", holder === "" ? "bg-miss/30 text-miss border border-miss/50" : "bg-surface-2 text-miss/60 border border-border")} title="No holder">✕</button>
                </div>
              </div>}
              <div className="ml-auto">
                <p className="text-[8px] text-muted uppercase tracking-wider mb-1">Side</p>
                <div className="flex rounded-input border border-border overflow-hidden">
                  <button onClick={() => setHolderSide("right")} className={clsx("px-2 py-1 text-[9px] font-semibold transition-colors", holderSide === "right" ? "bg-sky-500 text-slate-900" : "text-muted")}>R</button>
                  <button onClick={() => setHolderSide("left")} className={clsx("px-2 py-1 text-[9px] font-semibold transition-colors border-l border-border", holderSide === "left" ? "bg-sky-500 text-slate-900" : "text-muted")}>L</button>
                </div>
              </div>
            </div>

            {/* Diagram with Laces + Spiral */}
            <div className="flex items-center gap-1">
              <div className="flex flex-col gap-1 shrink-0">
                <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Laces</p>
                <button onClick={() => setLaces("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
                <button onClick={() => setLaces("1/4 Turn")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4</button>
                <button onClick={() => setLaces("Back")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", laces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
              </div>
              <div className="flex-1 min-w-0">
                <HolderStrikeZone markers={marker ? [{ ...marker, num: 1 }] : []} onSnap={(m) => setMarker(m)} nextNum={1} chartMode="simple" missMode="simple" editable flipped={holderSide === "left"} />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Spiral</p>
                <button onClick={() => setSpiral("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                <button onClick={() => setSpiral("Bad")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
              </div>
            </div>

            {marker && <p className="text-center text-xs"><span className={clsx("font-bold", marker.inZone ? "text-make" : "text-miss")}>{marker.inZone ? "Strike" : "Ball"}</span></p>}
          </>
        ) : (
          <>
            {/* Punt snap */}
            <div>
              <p className="text-[8px] text-muted uppercase tracking-wider mb-1">Snapper</p>
              <div className="flex gap-1">
                {athletes.map((a) => (
                  <button key={a} onClick={() => setSnapper(a)} className={clsx("w-8 h-8 rounded-full text-[10px] font-bold flex items-center justify-center transition-all", snapper === a ? "bg-sky-500 text-slate-900" : "bg-surface-2 text-muted border border-border")} title={a}>{getInitials(a)}</button>
                ))}
              </div>
            </div>

            {/* Diagram + Spiral */}
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <PunterStrikeZone markers={puntMarker ? [{ ...puntMarker, num: 1 }] : []} onSnap={(m) => setPuntMarker(m)} nextNum={1} chartMode="simple" missMode="simple" editable />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <p className="text-[8px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Spiral</p>
                <button onClick={() => setSpiral("Good")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                <button onClick={() => setSpiral("Bad")} className={clsx("px-2 py-2 rounded-input text-[10px] font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
              </div>
            </div>

            {puntMarker && <p className="text-center text-xs"><span className={clsx("font-bold", puntMarker.inZone ? "text-make" : "text-miss")}>{puntMarker.inZone ? "Strike" : "Ball"}</span></p>}

            {/* Snap Time (optional) */}
            <div>
              <p className="text-[10px] text-muted mb-1">Snap Time <span className="text-muted/50">(optional)</span></p>
              <input type="text" inputMode="numeric" value={snapTime ? parseTimeRaw(snapTime).toFixed(2) : ""} onChange={(e) => setSnapTime(e.target.value.replace(/\D/g, ""))} placeholder="0.75" className="input w-24 text-center text-sm font-bold py-1.5" />
            </div>
          </>
        )}

        <button onClick={handleSave} disabled={!canSave} className="btn-primary w-full py-2 text-sm font-bold disabled:opacity-40">
          Log Snap
        </button>

        {/* Kick list (team mode) */}
        {kickList && kickList.length > 0 && (
          <div className="border-t border-border/50 pt-2 space-y-1">
            <p className="text-[10px] text-muted uppercase tracking-wider font-semibold mb-1">Kicks</p>
            {kickList.map((k) => (
              <button key={k.idx} onClick={() => onKickSelect?.(k.idx)} className={clsx("w-full flex items-center gap-2 px-2 py-1.5 rounded-input text-[10px] transition-all text-left", k.isActive ? "bg-accent/15 border border-accent/50 text-accent" : k.hasSnap ? "bg-make/5 border border-make/30 text-make" : "border border-border/40 text-muted hover:text-white hover:border-border")}>
                <span className="font-bold w-4 text-center">{k.kickNum}</span>
                <span className="font-semibold text-slate-200 flex-1">{k.athlete}</span>
                <span className="text-slate-400">{k.dist}yd</span>
                <span className="text-slate-400">{k.pos}</span>
                {k.hasSnap && <span className="text-make font-bold">✓</span>}
              </button>
            ))}
          </div>
        )}

        {/* Logged snaps for this kick */}
        {previousSnaps && previousSnaps.length > 0 && (
          <div className="border-t border-border/50 pt-2 space-y-1">
            {[...previousSnaps].reverse().map((s, i) => (
              <div key={i} className="flex items-center text-[10px] gap-1.5">
                <span className="text-muted">{previousSnaps.length - i}.</span>
                <span className="text-slate-300 font-semibold">{getInitials(s.snapper)}</span>
                {s.holder && <span className="text-slate-400">({getInitials(s.holder)})</span>}
                <span className={clsx("font-bold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}</span>
                {s.laces && <span className={clsx(s.laces === "Good" ? "text-make" : s.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{s.laces === "Good" ? "Perf" : s.laces}</span>}
                <span className={clsx(s.spiral === "Tight" ? "text-make" : "text-miss")}>{s.spiral}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
