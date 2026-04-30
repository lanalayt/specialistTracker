"use client";

import { useState, useEffect } from "react";
import { useFG } from "@/lib/fgContext";
import Link from "next/link";
import type { FGKick, FGPosition, FGResult } from "@/types";
import clsx from "clsx";

const KICKS_PER_PLAYER = 10;

interface KickResult {
  athlete: string;
  target: number;
  landed: number;
  direction: "left" | "right" | "center";
  score: number;
}

export default function LineGolfPage() {
  const { athletes, commitPractice } = useFG();
  const athleteNames = athletes.map((a) => a.name);

  const [mode, setMode] = useState<"single" | "multi" | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [targetYL, setTargetYL] = useState("50");
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [saved, setSaved] = useState(false);

  const [results, setResults] = useState<KickResult[]>([]);
  const [leftInput, setLeftInput] = useState("");
  const [rightInput, setRightInput] = useState("");

  const players = mode === "single" ? (selectedPlayers.length === 1 ? selectedPlayers : []) : selectedPlayers;
  const totalKicks = players.length * KICKS_PER_PLAYER;
  const currentKickIdx = results.length;
  const currentPlayerIdx = players.length > 0 ? currentKickIdx % players.length : 0;
  const currentPlayer = players[currentPlayerIdx] ?? "";
  const target = parseInt(targetYL) || 50;

  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerScore = (name: string) => getPlayerResults(name).reduce((s, r) => s + r.score, 0);

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const handleSubmitLeft = () => {
    const yl = parseInt(leftInput);
    if (isNaN(yl)) return;
    const score = Math.abs(target - yl);
    setResults((prev) => [...prev, { athlete: currentPlayer, target, landed: yl, direction: "left", score }]);
    setLeftInput("");
    if (results.length + 1 >= totalKicks) setGameOver(true);
  };

  const handleSubmitRight = () => {
    const yl = parseInt(rightInput);
    if (isNaN(yl)) return;
    const score = Math.abs(target - yl);
    setResults((prev) => [...prev, { athlete: currentPlayer, target, landed: yl, direction: "right", score }]);
    setRightInput("");
    if (results.length + 1 >= totalKicks) setGameOver(true);
  };

  const handleSubmitCenter = () => {
    setResults((prev) => [...prev, { athlete: currentPlayer, target, landed: target, direction: "center", score: 0 }]);
    if (results.length + 1 >= totalKicks) setGameOver(true);
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    setGameOver(false);
  };

  const handleSave = () => {
    if (results.length === 0) return;
    const kicks: FGKick[] = results.map((r, i) => ({
      athleteId: r.athlete, athlete: r.athlete,
      dist: r.score, pos: "M" as FGPosition, result: "YC" as FGResult,
      score: r.score, kickNum: i + 1,
    }));
    const label = mode === "multi"
      ? `Line Golf @ ${target}yd — ${players.map((p) => `${p}: ${getPlayerScore(p)}`).join(" vs ")}`
      : `Line Golf @ ${target}yd — Score: ${getPlayerScore(players[0])}`;
    commitPractice(kicks, label);
    setSaved(true);
  };

  const handleNewGame = () => {
    setResults([]); setGameStarted(false); setGameOver(false);
    setMode(null); setSelectedPlayers([]); setSaved(false);
    setLeftInput(""); setRightInput("");
  };

  // Field yard lines for display
  const fieldLines = [];
  for (let yl = Math.max(0, target - 15); yl <= Math.min(100, target + 15); yl += 5) {
    fieldLines.push(yl);
  }

  // Mode selection
  if (!mode) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">⛳</div>
          <h2 className="text-xl font-bold text-slate-100">Line Golf</h2>
          <p className="text-sm text-muted">10 kicks. Hit the target yard line. Low score wins.</p>
          <p className="text-xs text-muted">Score = yards off the target. 0 is perfect.</p>
          <div className="flex gap-3">
            <button onClick={() => setMode("single")} className="btn-primary flex-1 py-3 text-sm">Single Player</button>
            <button onClick={() => setMode("multi")} className="btn-ghost flex-1 py-3 text-sm">Multiplayer</button>
          </div>
          <Link href="/kicking/charting" className="text-xs text-muted hover:text-white transition-colors">← Back to Charting Games</Link>
        </div>
      </div>
    );
  }

  // Player + target selection
  if (!gameStarted) {
    const canStart = mode === "single" ? selectedPlayers.length === 1 : selectedPlayers.length >= 2;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">⛳</div>
          <h2 className="text-xl font-bold text-slate-100">Line Golf — {mode === "single" ? "Single" : "Multiplayer"}</h2>
          <p className="text-sm text-muted">{mode === "single" ? "Select your kicker" : "Select 2 or more kickers"}</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => mode === "single" ? setSelectedPlayers([a]) : togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-accent text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
          {mode === "multi" && selectedPlayers.length > 0 && <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>}
          <div>
            <p className="label">Target Yard Line</p>
            <input type="text" inputMode="numeric" value={targetYL} onChange={(e) => setTargetYL(e.target.value.replace(/\D/g, ""))} className="input w-24 mx-auto text-center text-2xl font-bold" placeholder="50" />
          </div>
          <button onClick={() => setGameStarted(true)} disabled={!canStart || !targetYL} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Game</button>
          <button onClick={() => { setMode(null); setSelectedPlayers([]); }} className="text-xs text-muted hover:text-white transition-colors">← Back</button>
        </div>
      </div>
    );
  }

  // Game over
  if (gameOver) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Game Over</h2>
          <p className="text-sm text-muted">Target: {target} yard line</p>
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))` }}>
            {players.map((p) => {
              const pr = getPlayerResults(p);
              const sc = getPlayerScore(p);
              return (
                <div key={p} className="space-y-3">
                  <p className="text-sm font-bold text-slate-200">{p}</p>
                  <div className="card-2 py-4">
                    <p className="text-4xl font-black text-accent">{sc}</p>
                    <p className="text-xs text-muted mt-1">Total yards off</p>
                  </div>
                  <div className="card-2 text-left text-xs overflow-y-auto max-h-[200px]">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Landed</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Dir</th>
                        <th className="text-[10px] text-muted text-right py-1 px-1">Off</th>
                      </tr></thead>
                      <tbody>
                        {pr.map((r, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="text-muted py-1 px-1">{i + 1}</td>
                            <td className="text-center py-1 px-1">{r.landed}</td>
                            <td className={clsx("text-center py-1 px-1", r.direction === "center" ? "text-make" : "text-slate-300")}>{r.direction === "center" ? "✓" : r.direction === "left" ? "←" : "→"}</td>
                            <td className={clsx("text-right py-1 px-1 font-bold", r.score === 0 ? "text-make" : r.score <= 2 ? "text-accent" : "text-miss")}>{r.score}</td>
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
  const playerKickCount = getPlayerResults(currentPlayer).length + 1;
  const playerScore = getPlayerScore(currentPlayer);
  const currentPlayerKicks = getPlayerResults(currentPlayer);

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">{currentPlayer} — Kick {playerKickCount} of {KICKS_PER_PLAYER}</p>
          {mode === "single" && (
            <div className="text-right">
              <p className="text-2xl font-black text-accent">{playerScore}</p>
              <p className="text-[10px] text-muted">yards off</p>
            </div>
          )}
        </div>

        {/* Multiplayer scoreboard */}
        {mode === "multi" && (
          <div className="flex items-center justify-center gap-3">
            {players.map((p, i) => (
              <div key={p} className="flex items-center gap-3">
                {i > 0 && <span className="text-xs text-muted font-bold">vs</span>}
                <div className={clsx("card-2 px-4 py-2 text-center", p === currentPlayer && "ring-2 ring-accent")}>
                  <p className="text-xs font-bold text-slate-200">{p}</p>
                  <p className="text-lg font-black text-accent">{getPlayerScore(p)}</p>
                  <p className="text-[10px] text-muted">Kick {getPlayerResults(p).length + (p === currentPlayer ? 1 : 0)}/{KICKS_PER_PLAYER}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${(results.length / totalKicks) * 100}%` }} />
        </div>

        {/* Field view */}
        <div className="card-2 py-4">
          <div className="relative mx-auto" style={{ height: 120 }}>
            {/* Green field background */}
            <div className="absolute inset-0 rounded bg-green-900/40" />
            {/* Yard lines */}
            {fieldLines.map((yl) => {
              const pct = ((yl - (target - 15)) / 30) * 100;
              const isTarget = yl === target;
              return (
                <div key={yl} className="absolute top-0 bottom-0" style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}>
                  <div className={clsx("h-full w-px", isTarget ? "bg-yellow-400" : "bg-white/20")} />
                  <span className={clsx("absolute -bottom-4 -translate-x-1/2 text-[8px]", isTarget ? "text-yellow-400 font-bold" : "text-white/40")}>{yl > 50 ? 100 - yl : yl}</span>
                </div>
              );
            })}
            {/* Kick markers for current player */}
            {currentPlayerKicks.map((r, i) => {
              const offset = r.direction === "left" ? -r.score : r.direction === "right" ? r.score : 0;
              const yl = r.target + offset;
              const pct = ((yl - (target - 15)) / 30) * 100;
              return (
                <div key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${Math.max(2, Math.min(98, pct))}%` }}>
                  <div className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white", r.score === 0 ? "bg-green-500" : r.score <= 2 ? "bg-accent" : "bg-red-500")}>
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Input: Left | Target | Right */}
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <p className="text-[10px] text-muted text-center uppercase tracking-wider">← Left</p>
            <div className="flex gap-1">
              <input type="text" inputMode="numeric" placeholder="YL" value={leftInput} onChange={(e) => setLeftInput(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") handleSubmitLeft(); }} className="input flex-1 text-center text-lg font-bold py-2" />
              <button onClick={handleSubmitLeft} disabled={!leftInput} className="btn-primary px-3 py-2 text-xs disabled:opacity-40">Go</button>
            </div>
          </div>

          <button onClick={handleSubmitCenter} className="px-4 py-6 rounded-input border-2 border-yellow-400/50 bg-yellow-400/10 text-yellow-400 font-black text-lg hover:bg-yellow-400/20 transition-all shrink-0">
            {target}
          </button>

          <div className="flex-1 space-y-1">
            <p className="text-[10px] text-muted text-center uppercase tracking-wider">Right →</p>
            <div className="flex gap-1">
              <input type="text" inputMode="numeric" placeholder="YL" value={rightInput} onChange={(e) => setRightInput(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") handleSubmitRight(); }} className="input flex-1 text-center text-lg font-bold py-2" />
              <button onClick={handleSubmitRight} disabled={!rightInput} className="btn-primary px-3 py-2 text-xs disabled:opacity-40">Go</button>
            </div>
          </div>
        </div>

        {/* Undo */}
        <div className="flex gap-2">
          {results.length > 0 && <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
        </div>

        {/* Mini log */}
        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[150px]">
            {results.map((r, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                <span className="text-slate-400 w-16 truncate">{r.athlete}</span>
                <span className="w-8">{r.landed}</span>
                <span className={clsx("w-6", r.direction === "center" ? "text-make" : "text-slate-300")}>{r.direction === "center" ? "✓" : r.direction === "left" ? "←" : "→"}</span>
                <span className={clsx("font-bold ml-auto", r.score === 0 ? "text-make" : r.score <= 2 ? "text-accent" : "text-miss")}>+{r.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
