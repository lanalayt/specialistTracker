"use client";

import { useState } from "react";
import { usePunt } from "@/lib/puntContext";
import Link from "next/link";
import type { PuntEntry, PuntHash } from "@/types";
import clsx from "clsx";

const KICK_OPTIONS = [3, 5, 10];
const MAX_SCORE_PER_KICK = 10;

interface KickResult {
  athlete: string;
  target: number;
  landed: number;
  direction: "left" | "right" | "center";
  score: number;
  hangTime: number;
}

export default function LineGolfPage() {
  const { athletes, commitPractice } = usePunt();
  const athleteNames = athletes.map((a) => a.name);

  const [mode, setMode] = useState<"single" | "multi" | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [kicksPerPlayer, setKicksPerPlayer] = useState(10);
  const [targetHang, setTargetHang] = useState(0);
  const [targetHangInput, setTargetHangInput] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [saved, setSaved] = useState(false);

  const [results, setResults] = useState<KickResult[]>([]);
  const [leftInput, setLeftInput] = useState("");
  const [rightInput, setRightInput] = useState("");
  const [hangInput, setHangInput] = useState("");

  const players = mode === "single" ? (selectedPlayers.length === 1 ? selectedPlayers : []) : selectedPlayers;
  const totalKicks = players.length * kicksPerPlayer;
  const currentKickIdx = results.length;
  const currentPlayerIdx = players.length > 0 ? currentKickIdx % players.length : 0;
  const currentPlayer = players[currentPlayerIdx] ?? "";
  const target = 50;

  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerScore = (name: string) => getPlayerResults(name).reduce((s, r) => s + r.score, 0);

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const parseHang = (): number => parseHangRaw(hangInput);

  const formatHangDisplay = (raw: string): string => {
    const val = parseHangRaw(raw);
    return val > 0 ? val.toFixed(2) + "s" : "";
  };

  const handleTargetHangInput = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setTargetHangInput(digits);
    setTargetHang(parseHangRaw(digits));
  };

  const HANG_PENALTY = 5;

  const submitKick = (direction: "left" | "right" | "center", offAmount: number) => {
    const ht = parseHang();
    if (!ht) return;
    const baseScore = Math.min(offAmount, MAX_SCORE_PER_KICK);
    const penalty = ht < targetHang ? HANG_PENALTY : 0;
    const score = baseScore + penalty;
    const landed = direction === "left" ? target - baseScore : direction === "right" ? target + baseScore : target;
    setResults((prev) => [...prev, { athlete: currentPlayer, target, landed, direction, score, hangTime: ht }]);
    setLeftInput(""); setRightInput(""); setHangInput("");
    if (results.length + 1 >= totalKicks) setGameOver(true);
  };

  const handleSubmit = () => {
    if (leftInput) {
      const off = parseInt(leftInput);
      if (isNaN(off) || off <= 0) return;
      submitKick("left", off);
    } else if (rightInput) {
      const off = parseInt(rightInput);
      if (isNaN(off) || off <= 0) return;
      submitKick("right", off);
    }
  };

  const handleSubmitCenter = () => {
    const ht = parseHang();
    if (!ht) return;
    submitKick("center", 0);
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    setGameOver(false);
  };

  const handleSave = () => {
    if (results.length === 0) return;
    const entries: PuntEntry[] = results.map((r, i) => ({
      athleteId: r.athlete, athlete: r.athlete,
      type: "LINE_GOLF", hash: "M" as PuntHash,
      yards: r.score, hangTime: r.hangTime, opTime: targetHang,
      directionalAccuracy: r.direction === "center" ? 1 : 0,
      landingZones: [r.direction.toUpperCase()] as unknown as PuntEntry["landingZones"], kickNum: i + 1,
    }));
    const label = mode === "multi"
      ? `Line Golf — ${players.map((p) => `${p}: ${getPlayerScore(p)}`).join(" vs ")}`
      : `Line Golf — Score: ${getPlayerScore(players[0])}`;
    commitPractice(entries, label);
    setSaved(true);
  };

  const handleNewGame = () => {
    setResults([]); setGameStarted(false); setGameOver(false);
    setMode(null); setSelectedPlayers([]); setSaved(false);
    setLeftInput(""); setRightInput(""); setHangInput("");
  };

  // Mode selection
  if (!mode) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">⛳</div>
          <h2 className="text-xl font-bold text-slate-100">Line Golf</h2>
          <p className="text-sm text-muted">Hit the target yard line. Low score wins.</p>
          <p className="text-xs text-muted">Score = yards off the target. 0 is perfect.</p>
          <p className="text-xs text-miss/80">Miss hang time target = +5 penalty yards.</p>
          <div className="flex gap-3">
            <button onClick={() => setMode("single")} className="btn-primary flex-1 py-3 text-sm">Single Player</button>
            <button onClick={() => setMode("multi")} className="btn-ghost flex-1 py-3 text-sm">Multiplayer</button>
          </div>
          <Link href="/punting/charting" className="text-xs text-muted hover:text-white transition-colors">← Back to Charting Games</Link>
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
          <p className="text-sm text-muted">{mode === "single" ? "Select your punter" : "Select 2 or more punters"}</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => mode === "single" ? setSelectedPlayers([a]) : togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-accent text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
          {mode === "multi" && selectedPlayers.length > 0 && <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>}
          <div>
            <p className="label">Punts Per Player</p>
            <div className="flex gap-2 justify-center">
              {KICK_OPTIONS.map((n) => (
                <button key={n} onClick={() => setKicksPerPlayer(n)} className={clsx("px-4 py-2 rounded-input text-sm font-bold border transition-all", kicksPerPlayer === n ? "bg-accent text-slate-900 border-accent" : "bg-surface-2 text-muted border-border")}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Target Hang Time</p>
            <div className="flex items-center justify-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder=""
                value={targetHangInput}
                onChange={(e) => handleTargetHangInput(e.target.value)}
                className="input w-24 text-center text-lg font-bold py-2"
              />
              {targetHang > 0 && <span className="text-sm font-semibold text-accent">{targetHang.toFixed(2)}s</span>}
            </div>
          </div>
          <button onClick={() => setGameStarted(true)} disabled={!canStart || targetHang <= 0} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Game</button>
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
          <p className="text-sm text-muted">Target: {target} yard line · Hang target: {targetHang.toFixed(1)}s</p>
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))` }}>
            {players.map((p) => {
              const pr = getPlayerResults(p);
              const sc = getPlayerScore(p);
              const avgHang = pr.length > 0 ? (pr.reduce((s, r) => s + r.hangTime, 0) / pr.length).toFixed(2) : "—";
              return (
                <div key={p} className="space-y-3">
                  <p className="text-sm font-bold text-slate-200">{p}</p>
                  <div className="card-2 py-4">
                    <p className="text-4xl font-black text-accent">{sc}</p>
                    <p className="text-xs text-muted mt-1">Total yards off</p>
                    <p className="text-sm font-semibold text-slate-300 mt-2">Avg Hang: {avgHang}s</p>
                  </div>
                  <div className="card-2 text-left text-xs overflow-y-auto max-h-[200px]">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Dir</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Hang</th>
                        <th className="text-[10px] text-muted text-right py-1 px-1">Off</th>
                      </tr></thead>
                      <tbody>
                        {pr.map((r, i) => {
                          const penalty = r.hangTime < targetHang ? HANG_PENALTY : 0;
                          const baseOff = r.score - penalty;
                          return (
                          <tr key={i} className="border-t border-border/30">
                            <td className="text-muted py-1 px-1">{i + 1}</td>
                            <td className={clsx("text-center py-1 px-1", r.direction === "center" ? "text-make" : "text-slate-300")}>{r.direction === "center" ? "✓" : r.direction === "left" ? `← ${baseOff}` : `${baseOff} →`}</td>
                            <td className={clsx("text-center py-1 px-1", r.hangTime >= targetHang ? "text-make" : "text-miss")}>{r.hangTime.toFixed(2)}s</td>
                            <td className={clsx("text-right py-1 px-1 font-bold", r.score === 0 ? "text-make" : r.score <= 2 ? "text-accent" : "text-miss")}>+{r.score}{penalty > 0 ? <span className="text-miss text-[9px] ml-0.5">(+{penalty})</span> : ""}</td>
                          </tr>
                          );
                        })}
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
  const hasHang = !!parseHang();

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{currentPlayer} — Punt {playerKickCount} of {kicksPerPlayer}</p>
            <p className="text-[10px] text-muted">Hang target: {targetHang.toFixed(1)}s</p>
          </div>
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
                  <p className="text-[10px] text-muted">Punt {getPlayerResults(p).length + (p === currentPlayer ? 1 : 0)}/{kicksPerPlayer}</p>
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
            <div className="absolute inset-0 rounded bg-green-900/40" />
            {Array.from({ length: 21 }, (_, i) => i - 10).map((offset) => {
              const pct = ((offset + 10) / 20) * 100;
              const isCenter = offset === 0;
              return (
                <div key={offset} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                  <div className={clsx("h-full w-px", isCenter ? "bg-yellow-400" : offset % 5 === 0 ? "bg-white/30" : "bg-white/10")} />
                  {(offset % 2 === 0) && <span className={clsx("absolute -bottom-4 -translate-x-1/2 text-[8px]", isCenter ? "text-yellow-400 font-bold" : "text-white/40")}>{Math.abs(offset)}</span>}
                </div>
              );
            })}
            {currentPlayerKicks.map((r, i) => {
              const baseOff = r.score - (r.hangTime < targetHang ? HANG_PENALTY : 0);
              const offset = r.direction === "left" ? -baseOff : r.direction === "right" ? baseOff : 0;
              const pct = ((offset + 10) / 20) * 100;
              return (
                <div key={i} className="absolute -translate-x-1/2" style={{ left: `${Math.max(2, Math.min(98, pct))}%`, top: "15%" }}>
                  <div className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white", r.score === 0 ? "bg-green-500" : r.score <= 2 ? "bg-accent" : "bg-red-500")}>
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hang Time input */}
        <div>
          <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Hang Time</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder=""
            value={hangInput}
            onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))}
            className="input w-full text-center text-lg font-bold py-2"
          />
          {hangInput && <p className={clsx("text-center text-xs mt-1 font-semibold", parseHang() >= targetHang ? "text-make" : "text-miss")}>{parseHang().toFixed(2)}s {parseHang() >= targetHang ? "✓" : `(target: ${targetHang.toFixed(1)}s)`}</p>}
        </div>

        {/* Input: Left | 0 | Right */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">← Left</p>
            <input type="text" inputMode="numeric" placeholder="" value={leftInput} onChange={(e) => { setLeftInput(e.target.value.replace(/\D/g, "")); if (e.target.value) setRightInput(""); }} className="input w-full text-center text-lg font-bold py-2" />
          </div>

          <button onClick={handleSubmitCenter} disabled={!hasHang} className={clsx("px-4 py-4 rounded-input border-2 border-yellow-400/50 bg-yellow-400/10 text-yellow-400 font-black text-lg hover:bg-yellow-400/20 transition-all shrink-0 mt-4", !hasHang && "opacity-40 cursor-not-allowed")}>
            0
          </button>

          <div className="flex-1">
            <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Right →</p>
            <input type="text" inputMode="numeric" placeholder="" value={rightInput} onChange={(e) => { setRightInput(e.target.value.replace(/\D/g, "")); if (e.target.value) setLeftInput(""); }} className="input w-full text-center text-lg font-bold py-2" />
          </div>
        </div>

        {/* Go + Undo */}
        <div className="flex gap-2">
          {results.length > 0 && <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
          <button onClick={handleSubmit} disabled={(!leftInput && !rightInput) || !hasHang} className="btn-primary flex-1 py-2 text-sm font-bold disabled:opacity-40">Go</button>
        </div>

        {/* Mini log */}
        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[150px]">
            {results.map((r, i) => {
              const penalty = r.hangTime < targetHang ? HANG_PENALTY : 0;
              return (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                {mode === "multi" && <span className="text-slate-400 w-16 truncate">{r.athlete}</span>}
                <span className={clsx("w-6", r.direction === "center" ? "text-make" : "text-slate-300")}>{r.direction === "center" ? "✓" : r.direction === "left" ? "←" : "→"}</span>
                <span className={clsx("text-xs", r.hangTime >= targetHang ? "text-make" : "text-miss")}>{r.hangTime.toFixed(2)}s</span>
                <span className={clsx("font-bold ml-auto", r.score === 0 ? "text-make" : r.score <= 2 ? "text-accent" : "text-miss")}>+{r.score}{penalty > 0 && <span className="text-miss text-[9px] ml-0.5">(+{penalty})</span>}</span>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
