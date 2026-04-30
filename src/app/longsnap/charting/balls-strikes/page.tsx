"use client";

import { useState, useEffect } from "react";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import type { LongSnapEntry, SnapAccuracy, SnapType } from "@/types";
import clsx from "clsx";

export default function BallsStrikesPage() {
  const { athletes, commitPractice } = useLongSnap();
  const athleteNames = athletes.map((a) => a.name);

  const [athlete, setAthlete] = useState("");
  const [maxTime, setMaxTime] = useState("0.75");
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  const [markers, setMarkers] = useState<SnapMarker[]>([]);
  const [snaps, setSnaps] = useState<{ time: string; accuracy: "Strike" | "Ball"; auto: boolean; marker?: SnapMarker }[]>([]);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    if (athleteNames.length > 0 && !athlete) setAthlete(athleteNames[0]);
  }, [athleteNames, athlete]);

  const formatAutoDecimal = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const padded = digits.padStart(3, "0");
    const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
    return `${whole}.${padded.slice(-2)}`;
  };

  const maxTimeNum = parseFloat(maxTime) || 0;

  const [pendingMarker, setPendingMarker] = useState<SnapMarker | null>(null);
  const [promptTime, setPromptTime] = useState("");

  const handleSnapClick = (marker: SnapMarker) => {
    setPendingMarker(marker);
    setPromptTime("");
  };

  const handleConfirmSnap = () => {
    if (!pendingMarker) return;
    const timeVal = parseFloat(promptTime) || 0;
    const exceededTime = maxTimeNum > 0 && timeVal > maxTimeNum;
    const acc: "Strike" | "Ball" = exceededTime ? "Ball" : pendingMarker.inZone ? "Strike" : "Ball";
    setMarkers((prev) => [...prev, { ...pendingMarker, inZone: acc === "Strike" }]);
    const newSnaps = [...snaps, { time: promptTime, accuracy: acc, auto: exceededTime, marker: pendingMarker }];
    setSnaps(newSnaps);
    setPendingMarker(null);
    setPromptTime("");
    if (newSnaps.length >= 10) setFinished(true);
  };

  const handleUndo = () => {
    if (snaps.length === 0) return;
    setSnaps((prev) => prev.slice(0, -1));
    setMarkers((prev) => prev.slice(0, -1));
  };

  const strikes = snaps.filter((s) => s.accuracy === "Strike").length;
  const balls = snaps.filter((s) => s.accuracy === "Ball").length;
  const strikePct = snaps.length > 0 ? Math.round((strikes / snaps.length) * 100) : 0;

  const handleFinish = () => setFinished(true);

  const handleSave = () => {
    if (snaps.length === 0) return;
    const entries: LongSnapEntry[] = snaps.map((s) => ({
      athleteId: athlete,
      athlete,
      snapType: "PUNT" as SnapType,
      time: parseFloat(s.time) || 0,
      accuracy: s.accuracy === "Strike" ? "ON_TARGET" as SnapAccuracy : "HIGH" as SnapAccuracy,
      score: 0,
    }));
    commitPractice(entries, `Balls & Strikes — ${strikes}/${snaps.length} (${strikePct}%)`);
    setSaved(true);
  };

  const [saved, setSaved] = useState(false);

  const handleNewRound = () => {
    setSnaps([]);
    setMarkers([]);
    setCurrentTime("");
    setStarted(false);
    setFinished(false);
  };

  // Setup screen
  if (!started) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">⚾</div>
          <h2 className="text-xl font-bold text-slate-100">Balls & Strikes</h2>
          <p className="text-sm text-muted">Chart accuracy with a max snap time. Exceeding the time = automatic Ball.</p>
          {athleteNames.length > 0 && (
            <div className="space-y-2">
              <p className="label">Snapper</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {athleteNames.map((a) => (
                  <button key={a} onClick={() => setAthlete(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", athlete === a ? "bg-accent text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="label">Max Snap Time (seconds)</p>
            <input
              type="text"
              inputMode="numeric"
              value={maxTime}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setMaxTime(digits ? formatAutoDecimal(digits) : "");
              }}
              className="input w-32 mx-auto text-center text-xl font-bold"
              placeholder="0.75"
            />
            <p className="text-[10px] text-muted mt-1">Snaps over this time are automatic balls</p>
          </div>
          <button onClick={() => setStarted(true)} disabled={!athlete || !maxTime} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Round</button>
        </div>
      </div>
    );
  }

  // Finished screen
  if (finished) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="text-5xl mb-2">{strikePct >= 80 ? "🏆" : strikePct >= 60 ? "💪" : "📋"}</div>
          <h2 className="text-2xl font-extrabold text-slate-100">Round Complete</h2>
          <div className="card-2 py-6">
            <div className="flex justify-center gap-8">
              <div>
                <p className="text-4xl font-black text-make">{strikes}</p>
                <p className="text-xs text-muted mt-1">Strikes</p>
              </div>
              <div>
                <p className="text-4xl font-black text-miss">{balls}</p>
                <p className="text-xs text-muted mt-1">Balls</p>
              </div>
            </div>
            <p className="text-lg font-bold text-accent mt-3">{strikePct}%</p>
            <p className="text-[10px] text-muted">{snaps.length} total snaps · Max time: {maxTime}s</p>
          </div>
          {/* Per-snap breakdown */}
          <div className="card-2 text-left overflow-y-auto max-h-[200px]">
            <table className="w-full text-xs">
              <thead><tr>
                <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                <th className="text-[10px] text-muted text-center py-1 px-1">Time</th>
                <th className="text-[10px] text-muted text-center py-1 px-1">Result</th>
              </tr></thead>
              <tbody>
                {snaps.map((s, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="text-muted py-1 px-1">{i + 1}</td>
                    <td className={clsx("text-center py-1 px-1", s.auto ? "text-miss" : "")}>{s.time || "—"}{s.auto ? " (over)" : ""}</td>
                    <td className={clsx("text-center py-1 px-1 font-semibold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            {!saved ? (
              <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to History</button>
            ) : (
              <span className="flex-1 py-3 text-sm text-make font-bold text-center">✓ Saved!</span>
            )}
            <button onClick={handleNewRound} className="btn-ghost flex-1 py-3 text-sm">New Round</button>
          </div>
        </div>
      </div>
    );
  }

  // In progress
  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Snap #{snaps.length + 1} of 10</p>
            <p className="text-sm text-slate-300 mt-0.5">{athlete} · Max: {maxTime}s</p>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-xl font-black text-make">{strikes}</p>
              <p className="text-[10px] text-muted">Strikes</p>
            </div>
            <div>
              <p className="text-xl font-black text-miss">{balls}</p>
              <p className="text-[10px] text-muted">Balls</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${(snaps.length / 10) * 100}%` }} />
        </div>

        {/* Diagram — front and center */}
        <p className="text-xs text-muted text-center">Click the diagram to chart snap location</p>
        <PunterStrikeZone markers={markers} onSnap={handleSnapClick} nextNum={snaps.length + 1} editable />

        {/* Undo + Finish */}
        <div className="flex gap-2">
          {snaps.length > 0 && (
            <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>
          )}
          {snaps.length > 0 && (
            <button onClick={handleFinish} className="btn-primary flex-1 py-2 text-sm font-bold">Finish Early ({snaps.length}/10)</button>
          )}
        </div>

        {/* Mini log */}
        {snaps.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[200px]">
            {snaps.map((s, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                <span className="w-14">{s.time || "—"}s</span>
                <span className={clsx("font-semibold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}</span>
                {s.auto && <span className="text-miss text-[10px]">(auto)</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time prompt popup */}
      {pendingMarker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-card p-6 w-72 space-y-4">
            <p className="text-sm font-bold text-slate-100 text-center">Snap #{snaps.length + 1} — Enter Time</p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0.74"
              value={promptTime}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setPromptTime(digits ? formatAutoDecimal(digits) : "");
              }}
              className="input w-full text-center text-2xl font-bold"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmSnap(); }}
            />
            {promptTime && parseFloat(promptTime) > maxTimeNum && maxTimeNum > 0 && (
              <p className="text-xs text-miss font-semibold text-center">Over {maxTime}s — auto Ball</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setPendingMarker(null)} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
              <button onClick={handleConfirmSnap} className="btn-primary flex-1 py-2 text-sm font-bold">Log Snap</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
