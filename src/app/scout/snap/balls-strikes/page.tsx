"use client";

import { useState, useEffect } from "react";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { getTeamId } from "@/lib/teamData";
import { insertScoutSession, loadScoutAthletes, saveScoutAthletes } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface BsSnap {
  athlete: string;
  time: string;
  accuracy: "Strike" | "Ball";
  spiral: string;
  marker?: SnapMarker;
}

function calcAvg(scores: number[], dropWorst: boolean): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  if (!dropWorst) return parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
  const sorted = [...scores].sort((a, b) => a - b);
  const best = sorted.slice(1);
  return parseFloat((best.reduce((s, v) => s + v, 0) / best.length).toFixed(2));
}

export default function ScoutLongSnapsPage() {
  const [phase, setPhase] = useState<"setup" | "live" | "results">("setup");
  const [athleteNames, setAthleteNames] = useState<string[]>([]);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [snapsPerPlayer, setSnapsPerPlayer] = useState("10");
  const [maxTime, setMaxTime] = useState("0.75");
  const [dropWorst, setDropWorst] = useState(true);
  const [saved, setSaved] = useState(false);

  const [snaps, setSnaps] = useState<BsSnap[]>([]);
  const [activePlayer, setActivePlayer] = useState("");
  const [pendingMarker, setPendingMarker] = useState<SnapMarker | null>(null);
  const [promptTime, setPromptTime] = useState("");
  const [promptSpiral, setPromptSpiral] = useState<"Good" | "Bad" | "">("");

  const spp = parseInt(snapsPerPlayer) || 0;
  const totalSnaps = selectedPlayers.length * spp;
  const maxTimeNum = parseFloat(maxTime) || 0;

  const getPlayerSnaps = (name: string) => snaps.filter((s) => s.athlete === name);
  const getPlayerMarkers = (name: string) => snaps.filter((s) => s.athlete === name && s.marker).map((s, i) => ({ ...s.marker!, num: i + 1, inZone: s.accuracy === "Strike" }));
  const getPlayerStrikes = (name: string) => getPlayerSnaps(name).filter((s) => s.accuracy === "Strike").length;
  const getPlayerScores = (name: string) => getPlayerSnaps(name).map((s) => s.accuracy === "Strike" ? 1 : 0);
  const getPlayerAvg = (name: string) => calcAvg(getPlayerScores(name), dropWorst);

  useUnsavedWarning(snaps.length > 0 && !saved);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid || !active) return;
      const names = await loadScoutAthletes(tid, "snap");
      if (active) setAthleteNames(names);
    }
    load();
    return () => { active = false; };
  }, []);

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const addAthlete = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || athleteNames.includes(trimmed)) return;
    const updated = [...athleteNames, trimmed];
    setAthleteNames(updated);
    setNewAthleteName("");
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "snap", updated);
  };

  const removeAthlete = async (name: string) => {
    const updated = athleteNames.filter((n) => n !== name);
    setAthleteNames(updated);
    setSelectedPlayers((prev) => prev.filter((n) => n !== name));
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "snap", updated);
  };

  const handleSnapClick = (marker: SnapMarker) => {
    if (pendingMarker) return;
    setPendingMarker(marker);
  };

  const handleLogSnap = () => {
    if (!pendingMarker || !promptSpiral || !activePlayer) return;
    const timeNum = parseFloat(promptTime) || 0;
    const isTimeBall = maxTimeNum > 0 && timeNum > maxTimeNum;
    const isSpiralBall = promptSpiral === "Bad";
    const inZone = pendingMarker.inZone !== false;
    const accuracy: "Strike" | "Ball" = inZone && !isTimeBall && !isSpiralBall ? "Strike" : "Ball";

    setSnaps((prev) => [...prev, { athlete: activePlayer, time: promptTime, accuracy, spiral: promptSpiral, marker: pendingMarker }]);
    setPendingMarker(null); setPromptTime(""); setPromptSpiral("");
    // Auto-rotate
    const idx = selectedPlayers.indexOf(activePlayer);
    setActivePlayer(selectedPlayers[(idx + 1) % selectedPlayers.length]);
    if (snaps.length + 1 >= totalSnaps) setPhase("results");
  };

  const handleUndo = () => {
    if (pendingMarker) { setPendingMarker(null); setPromptTime(""); setPromptSpiral(""); return; }
    if (snaps.length === 0) return;
    const last = snaps[snaps.length - 1];
    setSnaps((prev) => prev.slice(0, -1));
    setActivePlayer(last.athlete);
    if (phase === "results") setPhase("live");
  };

  const handleFinish = () => {
    if (snaps.length > 0) setPhase("results");
  };

  const handleSave = async () => {
    if (snaps.length === 0) return;
    const tid = getTeamId();
    if (!tid) return;
    const entries = snaps.map((s) => ({
      athlete: s.athlete, time: s.time, accuracy: s.accuracy, spiral: s.spiral,
      score: s.accuracy === "Strike" ? 1 : 0,
      markerX: s.marker?.x, markerY: s.marker?.y, dropWorst,
    }));
    const allAthletes = [...new Set(snaps.map((s) => s.athlete))];
    const label = `Long Snaps — ${allAthletes.map((a) => `${a}: ${getPlayerAvg(a).toFixed(2)} avg`).join(", ")}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_SNAP",
      label,
      date: new Date().toISOString(),
      entries: entries as unknown as Record<string, unknown>[],
    });
    setSaved(true);
  };

  // ── Setup ──
  if (phase === "setup") {
    return (
      <>
        <Header title="Long Snaps" />
        <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
          <Link href="/scout/snap" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          <h2 className="text-lg font-bold text-slate-100">Long Snap Setup</h2>
          <p className="text-xs text-muted">Select or add snappers, then set number of snaps.</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <div key={a} className="flex items-center gap-0.5">
                <button onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-l-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
                <button onClick={() => removeAthlete(a)} className="px-1.5 py-1.5 rounded-r-input text-[10px] bg-surface-2 text-muted border border-border border-l-0 hover:text-miss transition-colors">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newAthleteName} onChange={(e) => setNewAthleteName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addAthlete(newAthleteName); }} placeholder="Type name to add..." className="input flex-1 text-sm py-1.5" />
            <button onClick={() => addAthlete(newAthleteName)} disabled={!newAthleteName.trim()} className="btn-primary px-4 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
          </div>
          {selectedPlayers.length > 0 && <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted mb-1">Snaps per player</p>
              <input type="text" inputMode="numeric" value={snapsPerPlayer} onChange={(e) => setSnapsPerPlayer(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
            </div>
            <div>
              <p className="text-xs text-muted mb-1">Max time (sec, 0 = no limit)</p>
              <input type="text" inputMode="decimal" value={maxTime} onChange={(e) => setMaxTime(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5" />
            </div>
          </div>
          <div className="flex items-center justify-between card-2 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-200">Drop Worst Snap</p>
              <p className="text-[10px] text-muted">Exclude lowest score from average</p>
            </div>
            <button onClick={() => setDropWorst(!dropWorst)} className={clsx("w-10 h-5 rounded-full transition-colors relative", dropWorst ? "bg-amber-500" : "bg-surface-2 border border-border")}>
              <div className={clsx("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all", dropWorst ? "left-5" : "left-0.5")} />
            </button>
          </div>
          <div className="card-2 p-3 text-xs text-muted space-y-1">
            <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Scoring</p>
            <p>Strike = 1 point. Ball = 0. A snap is a Ball if it misses the zone, exceeds max time, or has a bad spiral.</p>
            <p>Final = average{dropWorst ? ", dropping the worst one" : ""}.</p>
          </div>
          <button onClick={() => { setPhase("live"); setActivePlayer(selectedPlayers[0] ?? ""); }} disabled={selectedPlayers.length === 0 || !spp} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start</button>
        </main>
      </>
    );
  }

  // ── Results ──
  if (phase === "results") {
    const allAthletes = [...new Set(snaps.map((s) => s.athlete))];
    const ranked = allAthletes
      .map((name) => {
        const ps = getPlayerSnaps(name);
        const scores = ps.map((s) => s.accuracy === "Strike" ? 1 : 0);
        const worst = dropWorst && scores.length > 1 ? 0 : null; // worst is always 0 if any ball exists
        const hasWorst = dropWorst && scores.length > 1 && scores.includes(0);
        return { name, snaps: ps, strikes: getPlayerStrikes(name), avg: getPlayerAvg(name), markers: getPlayerMarkers(name), hasWorst };
      })
      .sort((a, b) => b.avg - a.avg);

    return (
      <>
        <Header title="Long Snap Results" />
        <main className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-6 text-center">
            <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
            <p className="text-xs text-muted">Avg: Strike=1, Ball=0{dropWorst ? ", worst dropped" : ""}.</p>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(ranked.length, 3)}, minmax(0, 1fr))` }}>
              {ranked.map((r) => (
                <div key={r.name} className="space-y-3">
                  <p className="text-sm font-bold text-slate-200">{r.name}</p>
                  <PunterStrikeZone markers={r.markers} />
                  <div className="card-2 py-3">
                    <p className="text-3xl font-black text-amber-400">{r.avg.toFixed(2)}</p>
                    <p className="text-xs text-muted">{r.strikes}/{r.snaps.length} strikes</p>
                  </div>
                  <div className="card-2 text-left text-xs max-h-[200px] overflow-y-auto">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Call</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Time</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                      </tr></thead>
                      <tbody>
                        {r.snaps.map((s, j) => {
                          const isDropped = r.hasWorst && s.accuracy === "Ball" && j === r.snaps.findIndex((x) => x.accuracy === "Ball");
                          return (
                            <tr key={j} className={clsx("border-t border-border/30", isDropped && "opacity-40 line-through")}>
                              <td className="text-muted py-1 px-1">{j + 1}</td>
                              <td className={clsx("text-center py-1 px-1 font-semibold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}</td>
                              <td className="text-center py-1 px-1 text-slate-300">{s.time || "—"}</td>
                              <td className={clsx("text-center py-1 px-1", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : "Open"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 max-w-sm mx-auto">
              {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to Rankings</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
              <Link href="/scout/snap" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ── Live ──
  const playerSnapCount = getPlayerSnaps(activePlayer).length;

  return (
    <>
      <Header title="Long Snaps" />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Athlete selector */}
          <div className="flex flex-wrap gap-2 justify-center">
            {selectedPlayers.map((p) => {
              const count = getPlayerSnaps(p).length;
              return (
                <button key={p} onClick={() => setActivePlayer(p)} className={clsx("card-2 px-3 py-2 text-center transition-all min-w-[80px]", p === activePlayer ? "ring-2 ring-amber-500" : "opacity-60 hover:opacity-100")}>
                  <p className="text-xs font-bold text-slate-200">{p}</p>
                  <p className="text-lg font-black text-amber-400">{count > 0 ? getPlayerAvg(p).toFixed(2) : "—"}</p>
                  <p className="text-[10px] text-muted">{count}/{spp}</p>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-muted text-center">Strike=1, Ball=0. Avg{dropWorst ? ", drop worst" : ""}.</p>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{activePlayer} — Snap {playerSnapCount + 1} of {spp}</p>
          </div>

          <PunterStrikeZone markers={[...getPlayerMarkers(activePlayer), ...(pendingMarker ? [{ ...pendingMarker, num: playerSnapCount + 1, inZone: pendingMarker.inZone !== false }] : [])]} onSnap={handleSnapClick} nextNum={playerSnapCount + 1} editable />

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
            <button onClick={handleFinish} className="btn-ghost w-full py-2 text-xs font-bold border border-amber-500/40 text-amber-400">Finish</button>
          )}
        </div>
      </main>
    </>
  );
}
