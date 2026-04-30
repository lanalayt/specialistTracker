"use client";

import { useState, useEffect } from "react";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import Link from "next/link";
import type { LongSnapEntry, SnapAccuracy, SnapType } from "@/types";
import clsx from "clsx";

const SNAPS_PER_PLAYER = 10;
const PTS_PER_SNAP = 3;

interface SnapResult {
  athlete: string;
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
  const athleteNames = athletes.map((a) => a.name);

  // Mode selection
  const [mode, setMode] = useState<"single" | "multi" | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [saved, setSaved] = useState(false);

  // Game state
  const [results, setResults] = useState<SnapResult[]>([]);
  const [markers, setMarkers] = useState<ShortSnapMarker[]>([]);
  const [accuracy, setAccuracy] = useState<"Strike" | "Ball" | "">("");
  const [laces, setLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [spiral, setSpiral] = useState<"Good" | "Bad" | "">("");

  const players = mode === "single" ? (selectedPlayers.length === 1 ? selectedPlayers : []) : selectedPlayers;
  const totalSnaps = players.length * SNAPS_PER_PLAYER;
  const currentSnapIdx = results.length;
  const currentPlayerIdx = players.length > 0 ? currentSnapIdx % players.length : 0;
  const currentPlayer = players[currentPlayerIdx] ?? "";

  // Per-player markers for display
  const getPlayerMarkers = (name: string) => results.filter((r) => r.athlete === name && r.marker).map((r, i) => ({ ...r.marker!, num: i + 1 }));
  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerPoints = (name: string) => getPlayerResults(name).reduce((s, r) => s + r.points, 0);

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const handleSnapClick = (marker: ShortSnapMarker) => {
    if (accuracy) return; // Already clicked for this snap — must undo or log first
    const acc = marker.inZone ? "Strike" : "Ball";
    setAccuracy(acc);
    setMarkers((prev) => [...prev, marker]);
  };

  const handleLogSnap = () => {
    if (!accuracy || !laces || !spiral) return;
    const points = calcPoints(accuracy, laces, spiral);
    const result: SnapResult = { athlete: currentPlayer, accuracy, laces, spiral, points, marker: markers[markers.length - 1] };
    const newResults = [...results, result];
    setResults(newResults);
    if (newResults.length >= totalSnaps) setGameOver(true);
    setAccuracy("");
    setLaces("");
    setSpiral("");
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    setMarkers((prev) => prev.slice(0, -1));
    setGameOver(false);
    setAccuracy("");
    setLaces("");
    setSpiral("");
  };

  const handleSave = () => {
    if (results.length === 0) return;
    const snaps: LongSnapEntry[] = results.map((r) => ({
      athleteId: r.athlete, athlete: r.athlete,
      snapType: "FG" as SnapType, time: 0,
      accuracy: r.accuracy === "Strike" ? "ON_TARGET" as SnapAccuracy : "HIGH" as SnapAccuracy,
      score: r.points, laces: r.laces || undefined, spiral: r.spiral || undefined,
      markerX: r.marker?.x, markerY: r.marker?.y, markerInZone: r.marker?.inZone,
    }));
    const label = mode === "multi"
      ? `30 Point Game — ${players.map((p) => `${p}: ${getPlayerPoints(p)}/${SNAPS_PER_PLAYER * PTS_PER_SNAP}`).join(" vs ")}`
      : `30 Point Game — ${getPlayerPoints(players[0])}/${SNAPS_PER_PLAYER * PTS_PER_SNAP}`;
    commitPractice(snaps, label);
    setSaved(true);
  };

  const handleNewGame = () => {
    setResults([]); setMarkers([]); setGameStarted(false); setGameOver(false);
    setMode(null); setSelectedPlayers([]); setSaved(false);
    setAccuracy(""); setLaces(""); setSpiral("");
  };

  // Mode selection screen
  if (!mode) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-bold text-slate-100">30 Point Game</h2>
          <p className="text-sm text-muted">10 snaps. 3 points max per snap. Score out of 30.</p>
          <p className="text-xs text-muted">Strike (1) + Laces (1 or 0.5) + Spiral (1)</p>
          <div className="flex gap-3">
            <button onClick={() => setMode("single")} className="btn-primary flex-1 py-3 text-sm">Single Player</button>
            <button onClick={() => setMode("multi")} className="btn-ghost flex-1 py-3 text-sm">Multiplayer</button>
          </div>
          <Link href="/longsnap/charting" className="text-xs text-muted hover:text-white transition-colors">← Back to Charting</Link>
        </div>
      </div>
    );
  }

  // Player selection screen
  if (!gameStarted) {
    const canStart = mode === "single" ? selectedPlayers.length === 1 : selectedPlayers.length >= 2;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-bold text-slate-100">30 Point Game — {mode === "single" ? "Single" : "Multiplayer"}</h2>
          <p className="text-sm text-muted">{mode === "single" ? "Select your snapper" : "Select 2 or more snappers"}</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => mode === "single" ? setSelectedPlayers([a]) : togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-accent text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
          {mode === "multi" && selectedPlayers.length > 0 && (
            <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>
          )}
          <button onClick={() => setGameStarted(true)} disabled={!canStart} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Game</button>
          <button onClick={() => { setMode(null); setSelectedPlayers([]); }} className="text-xs text-muted hover:text-white transition-colors">← Back</button>
        </div>
      </div>
    );
  }

  // Game over screen
  if (gameOver) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Game Over</h2>
          {/* Per-player results side by side */}
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))` }}>
            {players.map((p) => {
              const pr = getPlayerResults(p);
              const pts = getPlayerPoints(p);
              const max = SNAPS_PER_PLAYER * PTS_PER_SNAP;
              const pct = Math.round((pts / max) * 100);
              const pm = getPlayerMarkers(p);
              return (
                <div key={p} className="space-y-3">
                  <p className="text-sm font-bold text-slate-200">{p}</p>
                  <HolderStrikeZone markers={pm} />
                  <div className="card-2 py-3">
                    <p className="text-3xl font-black text-accent">{pts}</p>
                    <p className="text-xs text-muted">/ {max} ({pct}%)</p>
                  </div>
                  <div className="card-2 text-left text-xs">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Loc</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Laces</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                        <th className="text-[10px] text-muted text-right py-1 px-1">Pts</th>
                      </tr></thead>
                      <tbody>
                        {pr.map((r, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="text-muted py-1 px-1">{i + 1}</td>
                            <td className={clsx("text-center py-1 px-1 font-semibold", r.accuracy === "Strike" ? "text-make" : "text-miss")}>{r.accuracy}</td>
                            <td className={clsx("text-center py-1 px-1", r.laces === "Good" ? "text-make" : r.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{r.laces === "Good" ? "Perfect" : r.laces}</td>
                            <td className={clsx("text-center py-1 px-1", r.spiral === "Good" ? "text-make" : "text-miss")}>{r.spiral === "Good" ? "Tight" : "Open"}</td>
                            <td className="text-right py-1 px-1 font-bold text-accent">{r.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 max-w-sm mx-auto">
            {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to History</button> : <span className="flex-1 py-3 text-sm text-make font-bold">✓ Saved!</span>}
            <button onClick={handleNewGame} className="btn-ghost flex-1 py-3 text-sm">New Game</button>
          </div>
        </div>
      </div>
    );
  }

  // Game in progress
  const playerSnapCount = getPlayerResults(currentPlayer).length + 1;
  const runningTotal = getPlayerPoints(currentPlayer);
  const runningMax = (playerSnapCount - 1) * PTS_PER_SNAP;

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{currentPlayer} — Snap {playerSnapCount} of {SNAPS_PER_PLAYER}</p>
            {mode === "multi" && <p className="text-[10px] text-muted">Overall snap {currentSnapIdx + 1} of {totalSnaps}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-accent">{runningTotal}</p>
            <p className="text-[10px] text-muted">/ {runningMax || PTS_PER_SNAP * SNAPS_PER_PLAYER}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${(results.length / totalSnaps) * 100}%` }} />
        </div>

        {/* Multiplayer scoreboard */}
        {mode === "multi" && (
          <div className="flex items-center justify-center gap-3">
            {players.map((p, i) => (
              <div key={p} className="flex items-center gap-3">
                {i > 0 && <span className="text-xs text-muted font-bold">vs</span>}
                <div className={clsx("card-2 px-4 py-2 text-center", p === currentPlayer && "ring-2 ring-accent")}>
                  <p className="text-xs font-bold text-slate-200">{p}</p>
                  <p className="text-lg font-black text-accent">{getPlayerPoints(p)}<span className="text-[10px] text-muted font-normal">/{getPlayerResults(p).length * PTS_PER_SNAP}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Diagram with Laces left, Spiral right */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1.5 shrink-0">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider text-center mb-1">Laces</p>
            <button onClick={() => setLaces("Good")} className={clsx("px-3 py-2.5 rounded-input text-xs font-bold border transition-all", laces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
            <button onClick={() => setLaces("1/4 Turn")} className={clsx("px-3 py-2.5 rounded-input text-xs font-bold border transition-all", laces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4 Turn</button>
            <button onClick={() => setLaces("Back")} className={clsx("px-3 py-2.5 rounded-input text-xs font-bold border transition-all", laces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
          </div>
          <div className="flex-1 min-w-0">
            <HolderStrikeZone markers={getPlayerMarkers(currentPlayer)} onSnap={handleSnapClick} nextNum={getPlayerResults(currentPlayer).length + 1} chartMode="simple" missMode="simple" editable />
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider text-center mb-1">Spiral</p>
            <button onClick={() => setSpiral("Good")} className={clsx("px-3 py-2.5 rounded-input text-xs font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
            <button onClick={() => setSpiral("Bad")} className={clsx("px-3 py-2.5 rounded-input text-xs font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
          </div>
        </div>

        {accuracy && <div className="text-center"><span className={clsx("text-sm font-bold", accuracy === "Strike" ? "text-make" : "text-miss")}>{accuracy}</span></div>}

        {/* Log + Undo */}
        <div className="flex gap-2">
          {results.length > 0 && <button onClick={handleUndo} className="text-xs px-3 py-3 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
          <button onClick={handleLogSnap} disabled={!accuracy || !laces || !spiral} className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40">
            Log Snap {accuracy && laces && spiral ? `(${calcPoints(accuracy, laces, spiral)} pts)` : ""}
          </button>
        </div>

        {/* Mini log */}
        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border">
            {results.map((r, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                <span className="text-slate-400 w-16 truncate">{r.athlete}</span>
                <span className={clsx("font-semibold", r.accuracy === "Strike" ? "text-make" : "text-miss")}>
                  {r.accuracy}{r.accuracy === "Ball" && r.spiral === "Bad" ? " (Spiral)" : ""}{r.accuracy === "Ball" && r.laces === "Back" ? "" : ""}
                </span>
                <span className={clsx("w-14", r.laces === "Good" ? "text-make" : r.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{r.laces === "Good" ? "Perfect" : r.laces}</span>
                <span className="text-accent font-bold ml-auto">{r.points}pt</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
