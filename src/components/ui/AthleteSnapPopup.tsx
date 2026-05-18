"use client";

import { useState } from "react";
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
  const [time, setTime] = useState("");
  const [accuracy, setAccuracy] = useState<"good" | "bad" | "">("");
  const [laces, setLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [spiral, setSpiral] = useState<"Good" | "Bad" | "">("");
  const [saving, setSaving] = useState(false);

  const isFG = snapType === "FG";
  const canSave = accuracy && spiral && (isFG ? !!laces : true);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const tid = getTeamId();
    if (!tid) { setSaving(false); return; }

    const timeNum = time ? parseFloat(formatSnapTime(time)) : 0;
    const entry: LongSnapEntry = {
      athleteId: snapper,
      athlete: snapper,
      snapType: snapType as SnapType,
      time: timeNum,
      accuracy: (accuracy === "good" ? "ON_TARGET" : "HIGH") as SnapAccuracy,
      laces: isFG ? laces || undefined : undefined,
      spiral: spiral || undefined,
      score: accuracy === "good" ? 1 : 0,
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
    onSaved?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">{isFG ? "Short" : "Long"} Snap — {snapper}</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xs">Close</button>
        </div>

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

        {isFG && (
          <div>
            <p className="text-[10px] text-muted mb-1">Laces</p>
            <div className="flex gap-1">
              <button onClick={() => setLaces("Good")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", laces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
              <button onClick={() => setLaces("1/4 Turn")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", laces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4</button>
              <button onClick={() => setLaces("Back")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", laces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] text-muted mb-1">Spiral</p>
          <div className="flex gap-1">
            <button onClick={() => setSpiral("Good")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
            <button onClick={() => setSpiral("Bad")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
          </div>
        </div>

        <button onClick={handleSave} disabled={!canSave || saving} className="btn-primary w-full py-2 text-sm font-bold disabled:opacity-40">
          {saving ? "Saving..." : "Log Snap"}
        </button>
      </div>
    </div>
  );
}
