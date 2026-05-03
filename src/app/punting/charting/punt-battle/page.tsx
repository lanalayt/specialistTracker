"use client";

import { useState } from "react";
import { usePunt } from "@/lib/puntContext";
import Link from "next/link";
import type { PuntEntry, PuntHash } from "@/types";
import clsx from "clsx";

const KICK_OPTIONS = [3, 5, 10];
const DIR_OPTIONS = ["Left", "Straight", "Right"];

type ScoringMode = "point" | "bigball";

interface PuntTarget {
  distance: number;
  hangTime: number;
  direction: string;
}

interface PuntResult {
  athlete: string;
  target: PuntTarget;
  actualDist: number;
  actualHang: number;
  actualDir: string;
  hitDist: boolean;
  hitHang: boolean;
  hitDir: boolean;
  score: number; // point mode: 0 or 1, bigball mode: calculated
}

export default function PuntBattlePage() {
  const { athletes, commitPractice } = usePunt();
  const athleteNames = athletes.map((a) => a.name);

  const [mode, setMode] = useState<"single" | "multi" | null>(null);
  const [scoringMode, setScoringMode] = useState<ScoringMode>("point");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [puntsPerPlayer, setPuntsPerPlayer] = useState(10);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [saved, setSaved] = useState(false);
  const [results, setResults] = useState<PuntResult[]>([]);

  // Targets — shared across all players for each punt number
  const [targets, setTargets] = useState<PuntTarget[]>([]);
  const [targetDist, setTargetDist] = useState("40");
  const [targetHang, setTargetHang] = useState("");
  const [targetDir, setTargetDir] = useState("Straight");

  // Input state
  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [dirInput, setDirInput] = useState("Straight");

  const players = mode === "single" ? (selectedPlayers.length === 1 ? selectedPlayers : []) : selectedPlayers;
  const totalPunts = players.length * puntsPerPlayer;
  const currentPuntIdx = results.length;
  const currentPlayerIdx = players.length > 0 ? currentPuntIdx % players.length : 0;
  const currentPlayer = players[currentPlayerIdx] ?? "";
  const currentPuntNum = players.length > 0 ? Math.floor(currentPuntIdx / players.length) : 0;

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

  // Get or set target for current punt number
  const getCurrentTarget = (): PuntTarget => {
    if (targets[currentPuntNum]) return targets[currentPuntNum];
    return { distance: parseInt(targetDist) || 40, hangTime: parseHangRaw(targetHang), direction: targetDir };
  };

  const handleSetTarget = () => {
    const t: PuntTarget = { distance: parseInt(targetDist) || 40, hangTime: parseHangRaw(targetHang), direction: targetDir };
    setTargets((prev) => {
      const next = [...prev];
      next[currentPuntNum] = t;
      return next;
    });
  };

  // Auto-set target when first player of a new punt round
  const needsTarget = !targets[currentPuntNum] && currentPlayerIdx === 0;

  const handleSubmit = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    if (isNaN(dist) || dist <= 0 || !hang) return;

    const target = getCurrentTarget();
    const hitDist = dist >= target.distance;
    const hitHang = hang >= target.hangTime;
    const hitDir = dirInput === target.direction;

    let score: number;
    if (scoringMode === "point") {
      score = (hitDist && hitHang && hitDir) ? 1 : 0;
    } else {
      // Big Ball: distance 1:1, hang x15, direction miss -10
      score = dist + Math.round(hang * 15) + (hitDir ? 0 : -10);
    }

    setResults((prev) => [...prev, {
      athlete: currentPlayer,
      target,
      actualDist: dist,
      actualHang: hang,
      actualDir: dirInput,
      hitDist, hitHang, hitDir,
      score,
    }]);

    setDistInput("");
    setHangInput("");
    setDirInput(target.direction);

    if (results.length + 1 >= totalPunts) setGameOver(true);
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
      type: "PUNT_BATTLE", hash: "M" as PuntHash,
      yards: r.actualDist, hangTime: r.actualHang, opTime: 0,
      directionalAccuracy: r.hitDir ? 1 : 0,
      landingZones: [r.actualDir.toUpperCase()] as unknown as PuntEntry["landingZones"],
      kickNum: i + 1,
    }));
    const label = mode === "multi"
      ? `Punt Battle (${scoringMode === "point" ? "Point" : "Big Ball"}) — ${players.map((p) => `${p}: ${getPlayerScore(p)}`).join(" vs ")}`
      : `Punt Battle (${scoringMode === "point" ? "Point" : "Big Ball"}) — Score: ${getPlayerScore(players[0])}`;
    commitPractice(entries, label);
    setSaved(true);
  };

  const handleNewGame = () => {
    setResults([]); setTargets([]); setGameStarted(false); setGameOver(false);
    setMode(null); setSelectedPlayers([]); setSaved(false);
    setDistInput(""); setHangInput(""); setTargetHang("");
  };

  // ── Mode selection ──
  if (!mode) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">💥</div>
          <h2 className="text-xl font-bold text-slate-100">Punt Battle</h2>
          <p className="text-sm text-muted">Hit your targets. Distance, hang time, and direction all count.</p>
          <div className="flex gap-3">
            <button onClick={() => setMode("single")} className="btn-primary flex-1 py-3 text-sm">Single Player</button>
            <button onClick={() => setMode("multi")} className="btn-ghost flex-1 py-3 text-sm">Multiplayer</button>
          </div>
          <Link href="/punting/charting" className="text-xs text-muted hover:text-white transition-colors">← Back to Charting Games</Link>
        </div>
      </div>
    );
  }

  // ── Setup ──
  if (!gameStarted) {
    const canStart = mode === "single" ? selectedPlayers.length === 1 : selectedPlayers.length >= 2;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">💥</div>
          <h2 className="text-xl font-bold text-slate-100">Punt Battle — {mode === "single" ? "Single" : "Multiplayer"}</h2>
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
                <button key={n} onClick={() => setPuntsPerPlayer(n)} className={clsx("px-4 py-2 rounded-input text-sm font-bold border transition-all", puntsPerPlayer === n ? "bg-accent text-slate-900 border-accent" : "bg-surface-2 text-muted border-border")}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Scoring Mode</p>
            <div className="flex rounded-input border border-border overflow-hidden w-fit mx-auto">
              <button onClick={() => setScoringMode("point")} className={clsx("px-4 py-2 text-xs font-semibold transition-colors", scoringMode === "point" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Point Mode</button>
              <button onClick={() => setScoringMode("bigball")} className={clsx("px-4 py-2 text-xs font-semibold transition-colors border-l border-border", scoringMode === "bigball" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Big Ball Mode</button>
            </div>
            <p className="text-[10px] text-muted mt-2">
              {scoringMode === "point"
                ? "Hit target distance, hang time & direction = 1 point"
                : "Yards (1:1) + Hang (x15) + Direction miss (-10)"}
            </p>
          </div>
          <button onClick={() => setGameStarted(true)} disabled={!canStart} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Game</button>
          <button onClick={() => { setMode(null); setSelectedPlayers([]); }} className="text-xs text-muted hover:text-white transition-colors">← Back</button>
        </div>
      </div>
    );
  }

  // ── Game Over ──
  if (gameOver) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Game Over</h2>
          <p className="text-sm text-muted">{scoringMode === "point" ? "Point Mode" : "Big Ball Mode"}</p>
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))` }}>
            {players.map((p) => {
              const pr = getPlayerResults(p);
              const sc = getPlayerScore(p);
              return (
                <div key={p} className="space-y-3">
                  <p className="text-sm font-bold text-slate-200">{p}</p>
                  <div className="card-2 py-4">
                    <p className="text-4xl font-black text-accent">{sc}</p>
                    <p className="text-xs text-muted mt-1">{scoringMode === "point" ? `${sc}/${pr.length} targets hit` : "total points"}</p>
                  </div>
                  <div className="card-2 text-left text-xs overflow-y-auto max-h-[250px]">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Dist</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Hang</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Dir</th>
                        <th className="text-[10px] text-muted text-right py-1 px-1">Pts</th>
                      </tr></thead>
                      <tbody>
                        {pr.map((r, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="text-muted py-1 px-1">{i + 1}</td>
                            <td className={clsx("text-center py-1 px-1", r.hitDist ? "text-make" : "text-miss")}>{r.actualDist}{scoringMode === "point" && <span className="text-[9px] text-muted ml-0.5">/{r.target.distance}</span>}</td>
                            <td className={clsx("text-center py-1 px-1", r.hitHang ? "text-make" : "text-miss")}>{r.actualHang.toFixed(2)}s{scoringMode === "point" && <span className="text-[9px] text-muted ml-0.5">/{r.target.hangTime.toFixed(1)}</span>}</td>
                            <td className={clsx("text-center py-1 px-1", r.hitDir ? "text-make" : "text-miss")}>{r.actualDir[0]}{scoringMode === "point" && !r.hitDir && <span className="text-[9px] text-muted ml-0.5">({r.target.direction[0]})</span>}</td>
                            <td className={clsx("text-right py-1 px-1 font-bold", r.score > 0 ? "text-make" : r.score < 0 ? "text-miss" : "text-muted")}>{r.score > 0 ? `+${r.score}` : r.score}</td>
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

  // ── Game in Progress ──
  const playerKickCount = getPlayerResults(currentPlayer).length + 1;
  const target = getCurrentTarget();

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{currentPlayer} — Punt {playerKickCount} of {puntsPerPlayer}</p>
            <p className="text-[10px] text-muted">{scoringMode === "point" ? "Point Mode" : "Big Ball Mode"}</p>
          </div>
          {mode === "single" && (
            <div className="text-right">
              <p className="text-2xl font-black text-accent">{getPlayerScore(currentPlayer)}</p>
              <p className="text-[10px] text-muted">{scoringMode === "point" ? "points" : "total"}</p>
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
                  <p className="text-[10px] text-muted">Punt {getPlayerResults(p).length + (p === currentPlayer ? 1 : 0)}/{puntsPerPlayer}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${(results.length / totalPunts) * 100}%` }} />
        </div>

        {/* Target setter — shown for first player of each round */}
        {needsTarget && (
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-accent uppercase tracking-wider">Set Target for Punt {currentPuntNum + 1}</p>
            {scoringMode === "point" ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                    <input type="text" inputMode="numeric" value={targetDist} onChange={(e) => setTargetDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted text-center mb-1">Hang Time</p>
                    <input type="text" inputMode="numeric" value={targetHang} onChange={(e) => setTargetHang(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
                    {targetHang && <p className="text-[10px] text-accent text-center mt-0.5">{parseHangRaw(targetHang).toFixed(2)}s</p>}
                  </div>
                  <div>
                    <p className="text-[10px] text-muted text-center mb-1">Direction</p>
                    <select value={targetDir} onChange={(e) => setTargetDir(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5">
                      {DIR_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={handleSetTarget} disabled={!targetDist || !targetHang} className="btn-primary w-full py-2 text-xs font-bold disabled:opacity-40">Lock Target</button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Target Direction</p>
                  <select value={targetDir} onChange={(e) => setTargetDir(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5">
                    {DIR_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={() => {
                    setTargets((prev) => { const next = [...prev]; next[currentPuntNum] = { distance: 0, hangTime: 0, direction: targetDir }; return next; });
                  }} className="btn-primary w-full py-2 text-xs font-bold">Lock Direction</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Target display */}
        {targets[currentPuntNum] && (
          <div className="card-2 py-2 px-3 flex items-center justify-between">
            <p className="text-[10px] text-muted uppercase tracking-wider">Target</p>
            <div className="flex gap-3 text-xs">
              {scoringMode === "point" && <span className="text-slate-300">{target.distance} yd</span>}
              {scoringMode === "point" && <span className="text-slate-300">{target.hangTime.toFixed(2)}s</span>}
              <span className="text-slate-300">{target.direction}</span>
            </div>
            <button onClick={() => setTargets((prev) => { const next = [...prev]; delete next[currentPuntNum]; return next; })} className="text-[10px] text-muted hover:text-accent transition-colors">Change</button>
          </div>
        )}

        {/* Input — only shown when target is set */}
        {targets[currentPuntNum] && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Distance</p>
                <input type="text" inputMode="numeric" value={distInput} onChange={(e) => setDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
              </div>
              <div>
                <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Hang Time</p>
                <input type="text" inputMode="numeric" value={hangInput} onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
                {hangInput && <p className="text-[10px] text-accent text-center mt-0.5">{parseHangRaw(hangInput).toFixed(2)}s</p>}
              </div>
              <div>
                <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Direction</p>
                <select value={dirInput} onChange={(e) => setDirInput(e.target.value)} className="input w-full text-center text-lg font-bold py-2">
                  {DIR_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              {results.length > 0 && <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
              <button onClick={handleSubmit} disabled={!distInput || !hangInput} className="btn-primary flex-1 py-2 text-sm font-bold disabled:opacity-40">Log Punt</button>
            </div>
          </div>
        )}

        {/* Mini log */}
        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[150px]">
            {results.map((r, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                {mode === "multi" && <span className="text-slate-400 w-16 truncate">{r.athlete}</span>}
                <span className={clsx(r.hitDist ? "text-make" : "text-miss")}>{r.actualDist}yd</span>
                <span className={clsx(r.hitHang ? "text-make" : "text-miss")}>{r.actualHang.toFixed(2)}s</span>
                <span className={clsx(r.hitDir ? "text-make" : "text-miss")}>{r.actualDir[0]}</span>
                <span className={clsx("font-bold ml-auto", r.score > 0 ? "text-make" : r.score < 0 ? "text-miss" : "text-muted")}>{r.score > 0 ? `+${r.score}` : r.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
