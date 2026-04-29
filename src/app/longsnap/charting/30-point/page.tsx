"use client";

import { useState, useEffect } from "react";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import type { LongSnapEntry, SnapAccuracy, SnapType } from "@/types";
import clsx from "clsx";

const TOTAL_SNAPS = 10;
const MAX_POINTS = 30;

interface SnapResult {
  accuracy: "Strike" | "Ball";
  laces: "Good" | "1/4 Turn" | "Back" | "";
  spiral: "Good" | "Bad" | "";
  points: number;
  marker?: ShortSnapMarker;
}

function calcPoints(acc: string, laces: string, spiral: string): number {
  let pts = 0;
  if (acc === "Strike") pts += 1;
  if (laces === "Good") pts += 1;
  else if (laces === "1/4 Turn") pts += 0.5;
  if (spiral === "Good") pts += 1;
  return pts;
}

export default function ThirtyPointGamePage() {
  const { athletes, commitPractice } = useLongSnap();
  const { isAthlete } = useAuth();
  const athleteNames = athletes.map((a) => a.name);

  const [athlete, setAthlete] = useState("");
  const [currentSnap, setCurrentSnap] = useState(0); // 0-9
  const [results, setResults] = useState<SnapResult[]>([]);
  const [markers, setMarkers] = useState<ShortSnapMarker[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  // Current snap state
  const [accuracy, setAccuracy] = useState<"Strike" | "Ball" | "">("");
  const [laces, setLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [spiral, setSpiral] = useState<"Good" | "Bad" | "">("");

  useEffect(() => {
    if (athleteNames.length > 0 && !athlete) setAthlete(athleteNames[0]);
  }, [athleteNames, athlete]);

  const handleSnapClick = (marker: ShortSnapMarker) => {
    const acc = marker.inZone ? "Strike" : "Ball";
    setAccuracy(acc);
    setMarkers((prev) => [...prev, marker]);
  };

  const handleLogSnap = () => {
    if (!accuracy || !laces || !spiral) return;
    const points = calcPoints(accuracy, laces, spiral);
    const result: SnapResult = { accuracy, laces, spiral, points, marker: markers[markers.length - 1] };
    const newResults = [...results, result];
    setResults(newResults);

    if (newResults.length >= TOTAL_SNAPS) {
      setGameOver(true);
    } else {
      setCurrentSnap(newResults.length);
    }
    // Reset for next snap
    setAccuracy("");
    setLaces("");
    setSpiral("");
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    setMarkers((prev) => prev.slice(0, -1));
    setCurrentSnap(results.length - 1);
    setGameOver(false);
    setAccuracy("");
    setLaces("");
    setSpiral("");
  };

  const totalPoints = results.reduce((s, r) => s + r.points, 0);

  const handleSave = () => {
    if (results.length === 0) return;
    const snaps: LongSnapEntry[] = results.map((r) => ({
      athleteId: athlete,
      athlete,
      snapType: "FG" as SnapType,
      time: 0,
      accuracy: r.accuracy === "Strike" ? "ON_TARGET" as SnapAccuracy : "HIGH" as SnapAccuracy,
      score: r.points,
      laces: r.laces || undefined,
      spiral: r.spiral || undefined,
    }));
    commitPractice(snaps, `30 Point Game — ${totalPoints}/${MAX_POINTS}`);
    setSaved(true);
  };

  const [saved, setSaved] = useState(false);

  const handleNewGame = () => {
    setResults([]);
    setMarkers([]);
    setCurrentSnap(0);
    setGameOver(false);
    setGameStarted(false);
    setAccuracy("");
    setLaces("");
    setSpiral("");
  };

  // Start screen
  if (!gameStarted) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-bold text-slate-100">30 Point Game</h2>
          <p className="text-sm text-muted">10 snaps. 3 points max per snap. Score out of 30.</p>
          <p className="text-xs text-muted">Strike (1) + Laces (1 or 0.5) + Spiral (1)</p>
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
          <button onClick={() => setGameStarted(true)} disabled={!athlete} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Game</button>
        </div>
      </div>
    );
  }

  // Game over screen
  if (gameOver) {
    const pct = Math.round((totalPoints / MAX_POINTS) * 100);
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="text-5xl mb-2">{pct >= 90 ? "🏆" : pct >= 70 ? "💪" : "📋"}</div>
          <h2 className="text-2xl font-extrabold text-slate-100">Game Over</h2>
          <div className="card-2 py-6">
            <p className="text-5xl font-black text-accent">{totalPoints}</p>
            <p className="text-sm text-muted mt-1">out of {MAX_POINTS}</p>
            <p className="text-lg font-bold text-slate-200 mt-2">{pct}%</p>
          </div>
          {/* Per-snap breakdown */}
          <div className="card-2 text-left">
            <table className="w-full text-xs">
              <thead><tr>
                <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                <th className="text-[10px] text-muted text-center py-1 px-1">Acc</th>
                <th className="text-[10px] text-muted text-center py-1 px-1">Laces</th>
                <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                <th className="text-[10px] text-muted text-right py-1 px-1">Pts</th>
              </tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="text-muted py-1 px-1">{i + 1}</td>
                    <td className={clsx("text-center py-1 px-1 font-semibold", r.accuracy === "Strike" ? "text-make" : "text-miss")}>{r.accuracy}</td>
                    <td className={clsx("text-center py-1 px-1", r.laces === "Good" ? "text-make" : r.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{r.laces}</td>
                    <td className={clsx("text-center py-1 px-1", r.spiral === "Good" ? "text-make" : "text-miss")}>{r.spiral}</td>
                    <td className="text-right py-1 px-1 font-bold text-accent">{r.points}</td>
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
            <button onClick={handleNewGame} className="btn-ghost flex-1 py-3 text-sm">New Game</button>
          </div>
        </div>
      </div>
    );
  }

  // Game in progress
  const runningTotal = results.reduce((s, r) => s + r.points, 0);
  const runningMax = results.length * 3;

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Left: Snap entry */}
      <div className="lg:w-[55%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0 p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Snap {currentSnap + 1} of {TOTAL_SNAPS}</p>
            <p className="text-sm text-slate-300 mt-0.5">{athlete}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-accent">{runningTotal}</p>
            <p className="text-[10px] text-muted">/ {runningMax || MAX_POINTS}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${(results.length / TOTAL_SNAPS) * 100}%` }} />
        </div>

        {/* Accuracy — auto-filled by diagram */}
        <div>
          <p className="label text-slate-100">Accuracy</p>
          <div className="flex gap-2">
            <button onClick={() => setAccuracy("Strike")} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border transition-all", accuracy === "Strike" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Strike (1pt)</button>
            <button onClick={() => setAccuracy("Ball")} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border transition-all", accuracy === "Ball" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Ball (0pt)</button>
          </div>
        </div>

        {/* Laces */}
        <div>
          <p className="label text-slate-100">Laces</p>
          <div className="flex gap-2">
            <button onClick={() => setLaces("Good")} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border transition-all", laces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Good (1pt)</button>
            <button onClick={() => setLaces("1/4 Turn")} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border transition-all", laces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4 Turn (0.5)</button>
            <button onClick={() => setLaces("Back")} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border transition-all", laces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back (0pt)</button>
          </div>
        </div>

        {/* Spiral */}
        <div>
          <p className="label text-slate-100">Spiral</p>
          <div className="flex gap-2">
            <button onClick={() => setSpiral("Good")} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Good (1pt)</button>
            <button onClick={() => setSpiral("Bad")} className={clsx("flex-1 py-3 rounded-input text-sm font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Bad (0pt)</button>
          </div>
        </div>

        {/* Log + Undo */}
        <div className="flex gap-2">
          {results.length > 0 && (
            <button onClick={handleUndo} className="text-xs px-3 py-3 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>
          )}
          <button onClick={handleLogSnap} disabled={!accuracy || !laces || !spiral} className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40">
            Log Snap #{currentSnap + 1} {accuracy && laces && spiral ? `(${calcPoints(accuracy, laces, spiral)} pts)` : ""}
          </button>
        </div>

        {/* Mini log of completed snaps */}
        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border">
            {results.map((r, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                <span className={clsx("font-semibold w-12", r.accuracy === "Strike" ? "text-make" : "text-miss")}>{r.accuracy}</span>
                <span className={clsx("w-14", r.laces === "Good" ? "text-make" : r.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{r.laces}</span>
                <span className={clsx("w-12", r.spiral === "Good" ? "text-make" : "text-miss")}>{r.spiral}</span>
                <span className="text-accent font-bold ml-auto">{r.points}pt</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Holder diagram */}
      <div className="lg:w-[45%] overflow-y-auto p-4 space-y-3">
        <HolderStrikeZone markers={markers} onSnap={handleSnapClick} nextNum={currentSnap + 1} chartMode="simple" missMode="simple" editable />
        {markers.length > 0 && (
          <button onClick={handleUndo} className="w-full text-xs py-1.5 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all">Undo Snap #{markers.length}</button>
        )}
      </div>
    </main>
  );
}
