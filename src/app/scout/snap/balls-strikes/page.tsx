"use client";

import { useState, useEffect } from "react";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { getTeamId } from "@/lib/teamData";
import { loadAthletes, type StoredAthlete } from "@/lib/athleteStore";
import { insertScoutSession } from "@/lib/scoutStore";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

const SNAPS_PER_PLAYER = 10;

interface BsSnap {
  athlete: string;
  time: string;
  accuracy: "Strike" | "Ball";
  auto: boolean;
  autoReason?: "time" | "spiral";
  spiral: string;
  marker?: SnapMarker;
}

export default function ScoutBallsStrikesPage() {
  const [athletes, setAthletes] = useState<StoredAthlete[]>([]);
  const [mode, setMode] = useState<"single" | "multi" | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [maxTime, setMaxTime] = useState("0.75");
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);

  const [snaps, setSnaps] = useState<BsSnap[]>([]);
  const [pendingMarker, setPendingMarker] = useState<SnapMarker | null>(null);
  const [promptTime, setPromptTime] = useState("");
  const [promptSpiral, setPromptSpiral] = useState<"Good" | "Bad" | "">("");

  const players = mode === "single" ? (selectedPlayers.length === 1 ? selectedPlayers : []) : selectedPlayers;
  const totalSnaps = players.length * SNAPS_PER_PLAYER;
  const currentSnapIdx = snaps.length;
  const currentPlayerIdx = players.length > 0 ? currentSnapIdx % players.length : 0;
  const currentPlayer = players[currentPlayerIdx] ?? "";

  const maxTimeNum = parseFloat(maxTime) || 0;

  const getPlayerSnaps = (name: string) => snaps.filter((s) => s.athlete === name);
  const getPlayerMarkers = (name: string) => snaps.filter((s) => s.athlete === name && s.marker).map((s, i) => ({ ...s.marker!, num: i + 1, inZone: s.accuracy === "Strike" }));
  const getPlayerStrikes = (name: string) => getPlayerSnaps(name).filter((s) => s.accuracy === "Strike").length;

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid || !active) return;
      const ath = await loadAthletes(tid, "LONGSNAP");
      if (active) setAthletes(ath);
    }
    load();
    return () => { active = false; };
  }, []);

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const handleSnapClick = (marker: SnapMarker) => {
    if (pendingMarker) return;
    setPendingMarker(marker);
  };

  const handleLogSnap = () => {
    if (!pendingMarker || !promptSpiral) return;
    const timeNum = parseFloat(promptTime) || 0;
    const isTimeBall = maxTimeNum > 0 && timeNum > maxTimeNum;
    const isSpiralBall = promptSpiral === "Bad";
    const inZone = pendingMarker.inZone !== false;
    let accuracy: "Strike" | "Ball" = inZone && !isTimeBall && !isSpiralBall ? "Strike" : "Ball";
    const autoReason: "time" | "spiral" | undefined = isTimeBall ? "time" : isSpiralBall ? "spiral" : undefined;

    const newSnaps = [...snaps, {
      athlete: currentPlayer, time: promptTime, accuracy, auto: !!autoReason, autoReason,
      spiral: promptSpiral, marker: pendingMarker,
    }];
    setSnaps(newSnaps);
    if (newSnaps.length >= totalSnaps) setFinished(true);
    setPendingMarker(null); setPromptTime(""); setPromptSpiral("");
  };

  const handleUndo = () => {
    if (pendingMarker) { setPendingMarker(null); setPromptTime(""); setPromptSpiral(""); return; }
    if (snaps.length === 0) return;
    setSnaps((prev) => prev.slice(0, -1));
    setFinished(false);
  };

  const handleSave = async () => {
    if (snaps.length === 0) return;
    const tid = getTeamId();
    if (!tid) return;
    const entries = snaps.map((s) => ({
      athlete: s.athlete, time: s.time, accuracy: s.accuracy, spiral: s.spiral,
      score: s.accuracy === "Strike" ? 1 : 0,
      markerX: s.marker?.x, markerY: s.marker?.y,
    }));
    const label = mode === "multi"
      ? `Balls & Strikes — ${players.map((p) => `${p}: ${getPlayerStrikes(p)}/${SNAPS_PER_PLAYER}`).join(" vs ")}`
      : `Balls & Strikes — ${getPlayerStrikes(players[0])}/${SNAPS_PER_PLAYER}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_SNAP",
      label,
      date: new Date().toISOString(),
      entries: entries as unknown as Record<string, unknown>[],
    });
    setSaved(true);
  };

  const handleNewGame = () => {
    setSnaps([]); setStarted(false); setFinished(false);
    setMode(null); setSelectedPlayers([]); setSaved(false);
    setPendingMarker(null); setPromptTime(""); setPromptSpiral("");
  };

  const athleteNames = athletes.map((a) => a.name);

  if (!mode) {
    return (
      <>
        <Header title="Scout Balls & Strikes" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-sm">
            <div className="text-5xl mb-4">⚾</div>
            <h2 className="text-xl font-bold text-slate-100">Balls & Strikes</h2>
            <p className="text-sm text-muted">Accuracy, time, and spiral. Scout mode.</p>
            <div className="flex gap-3">
              <button onClick={() => setMode("single")} className="btn-primary flex-1 py-3 text-sm">Single Player</button>
              <button onClick={() => setMode("multi")} className="btn-ghost flex-1 py-3 text-sm">Multiplayer</button>
            </div>
            <Link href="/scout/snap" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          </div>
        </main>
      </>
    );
  }

  if (!started) {
    const canStart = mode === "single" ? selectedPlayers.length === 1 : selectedPlayers.length >= 2;
    return (
      <>
        <Header title="Scout Balls & Strikes" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-sm">
            <h2 className="text-xl font-bold text-slate-100">Balls & Strikes — {mode === "single" ? "Single" : "Multi"}</h2>
            <p className="text-sm text-muted">{mode === "single" ? "Select your snapper" : "Select 2+ snappers"}</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {athleteNames.map((a) => (
                <button key={a} onClick={() => mode === "single" ? setSelectedPlayers([a]) : togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
              ))}
            </div>
            <div>
              <p className="text-xs text-muted mb-1">Max Time (seconds) — 0 = no limit</p>
              <input type="text" inputMode="decimal" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} className="input w-24 text-center text-sm font-bold py-1.5" />
            </div>
            <button onClick={() => setStarted(true)} disabled={!canStart} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Game</button>
            <button onClick={() => { setMode(null); setSelectedPlayers([]); }} className="text-xs text-muted hover:text-white transition-colors">&larr; Back</button>
          </div>
        </main>
      </>
    );
  }

  if (finished) {
    return (
      <>
        <Header title="Game Over" />
        <main className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-6 text-center">
            <h2 className="text-2xl font-extrabold text-slate-100">Game Over</h2>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))` }}>
              {players.map((p) => {
                const ps = getPlayerSnaps(p);
                const strikes = getPlayerStrikes(p);
                const pm = getPlayerMarkers(p);
                return (
                  <div key={p} className="space-y-3">
                    <p className="text-sm font-bold text-slate-200">{p}</p>
                    <PunterStrikeZone markers={pm} />
                    <div className="card-2 py-3">
                      <p className="text-3xl font-black text-amber-400">{strikes}</p>
                      <p className="text-xs text-muted">/ {ps.length} strikes</p>
                    </div>
                    <div className="card-2 text-left text-xs">
                      <table className="w-full">
                        <thead><tr>
                          <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                          <th className="text-[10px] text-muted text-center py-1 px-1">Call</th>
                          <th className="text-[10px] text-muted text-center py-1 px-1">Time</th>
                          <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                        </tr></thead>
                        <tbody>
                          {ps.map((s, i) => (
                            <tr key={i} className="border-t border-border/30">
                              <td className="text-muted py-1 px-1">{i + 1}</td>
                              <td className={clsx("text-center py-1 px-1 font-semibold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}</td>
                              <td className="text-center py-1 px-1 text-slate-300">{s.time || "—"}</td>
                              <td className={clsx("text-center py-1 px-1", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : "Open"}</td>
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
              {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to Rankings</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
              <button onClick={handleNewGame} className="btn-ghost flex-1 py-3 text-sm">New Game</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Live
  const playerSnapCount = getPlayerSnaps(currentPlayer).length + 1;

  return (
    <>
      <Header title="Scout Balls & Strikes" />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{currentPlayer} — Snap {playerSnapCount} of {SNAPS_PER_PLAYER}</p>
            {mode === "single" && (
              <div className="text-right">
                <p className="text-2xl font-black text-amber-400">{getPlayerStrikes(currentPlayer)}</p>
                <p className="text-[10px] text-muted">strikes / {getPlayerSnaps(currentPlayer).length}</p>
              </div>
            )}
          </div>

          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${(snaps.length / totalSnaps) * 100}%` }} />
          </div>

          {mode === "multi" && (
            <div className="flex items-center justify-center gap-3">
              {players.map((p, i) => (
                <div key={p} className="flex items-center gap-3">
                  {i > 0 && <span className="text-xs text-muted font-bold">vs</span>}
                  <div className={clsx("card-2 px-4 py-2 text-center", p === currentPlayer && "ring-2 ring-amber-500")}>
                    <p className="text-xs font-bold text-slate-200">{p}</p>
                    <p className="text-lg font-black text-amber-400">{getPlayerStrikes(p)}<span className="text-[10px] text-muted font-normal">/{getPlayerSnaps(p).length}</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <PunterStrikeZone markers={[...getPlayerMarkers(currentPlayer), ...(pendingMarker ? [{ ...pendingMarker, num: getPlayerSnaps(currentPlayer).length + 1, inZone: pendingMarker.inZone !== false }] : [])]} onSnap={handleSnapClick} nextNum={getPlayerSnaps(currentPlayer).length + 1} editable />

          {pendingMarker && (
            <div className="card space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Time (sec)</p>
                  <input type="text" inputMode="decimal" value={promptTime} onChange={(e) => setPromptTime(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5" placeholder="0.65" />
                </div>
                <div>
                  <p className="text-[10px] text-muted text-center mb-1">Spiral</p>
                  <div className="flex gap-1">
                    <button onClick={() => setPromptSpiral("Good")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", promptSpiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                    <button onClick={() => setPromptSpiral("Bad")} className={clsx("flex-1 py-1.5 rounded-input text-xs font-bold border transition-all", promptSpiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {(snaps.length > 0 || pendingMarker) && <button onClick={handleUndo} className="text-xs px-3 py-3 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
            <button onClick={handleLogSnap} disabled={!pendingMarker || !promptSpiral} className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40">Log Snap</button>
          </div>

          {snaps.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-border">
              {snaps.map((s, i) => (
                <div key={i} className="flex items-center text-xs gap-2">
                  <span className="text-muted w-5">#{i + 1}</span>
                  <span className="text-slate-400 w-16 truncate">{s.athlete}</span>
                  <span className={clsx("font-semibold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}</span>
                  <span className="text-slate-300">{s.time || "—"}s</span>
                  <span className={clsx("ml-auto", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : "Open"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
