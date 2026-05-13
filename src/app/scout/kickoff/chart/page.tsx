"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { insertScoutSession, loadScoutAthletes, saveScoutAthletes } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface KOResult {
  athlete: string;
  kickNum: number;
  distance: number;
  hangTime: number;
  directionGood: boolean;
  score: number;
}

function calcKickScore(dist: number, hang: number, dirGood: boolean): number {
  return parseFloat((dist + hang * 10 + (dirGood ? 0 : -10)).toFixed(2));
}

function calcAvg(scores: number[], dropWorst: boolean): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  if (!dropWorst) return parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
  const sorted = [...scores].sort((a, b) => a - b);
  const best = sorted.slice(1);
  return parseFloat((best.reduce((s, v) => s + v, 0) / best.length).toFixed(2));
}

export default function ScoutKOChartPage() {
  const [phase, setPhase] = useState<"setup" | "live" | "results">("setup");
  const [athleteNames, setAthleteNames] = useState<string[]>([]);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [kicksPerPlayer, setKicksPerPlayer] = useState("5");
  const [dropWorst, setDropWorst] = useState(true);
  const [saved, setSaved] = useState(false);

  const [results, setResults] = useState<KOResult[]>([]);
  const [activePlayer, setActivePlayer] = useState("");
  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [dirGood, setDirGood] = useState(true);

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerScores = (name: string) => getPlayerResults(name).map((r) => r.score);
  const getPlayerAvg = (name: string) => calcAvg(getPlayerScores(name), dropWorst);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid || !active) return;
      const names = await loadScoutAthletes(tid, "kickoff");
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
    if (tid) await saveScoutAthletes(tid, "kickoff", updated);
  };

  const removeAthlete = async (name: string) => {
    const updated = athleteNames.filter((n) => n !== name);
    setAthleteNames(updated);
    setSelectedPlayers((prev) => prev.filter((n) => n !== name));
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "kickoff", updated);
  };

  useUnsavedWarning(results.length > 0 && !saved);

  const handleLog = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    if (isNaN(dist) || dist <= 0 || !hang || !activePlayer) return;
    const score = calcKickScore(dist, hang, dirGood);
    const kickNum = getPlayerResults(activePlayer).length + 1;
    setResults((prev) => [...prev, { athlete: activePlayer, kickNum, distance: dist, hangTime: hang, directionGood: dirGood, score }]);
    setDistInput("");
    setHangInput("");
    setDirGood(true);
    // Auto-rotate to next player
    const idx = selectedPlayers.indexOf(activePlayer);
    const next = selectedPlayers[(idx + 1) % selectedPlayers.length];
    setActivePlayer(next);
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
  };

  const handleFinish = () => {
    if (results.length > 0) setPhase("results");
  };

  const handleSave = async () => {
    const tid = getTeamId();
    if (!tid || results.length === 0) return;
    const allAthletes = [...new Set(results.map((r) => r.athlete))];
    const label = `KO Scout — ${allAthletes.map((a) => `${a}: ${getPlayerAvg(a).toFixed(2)}`).join(", ")}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_KO",
      label,
      date: new Date().toISOString(),
      entries: results as unknown as Record<string, unknown>[],
    });
    setSaved(true);
  };

  // ── Setup ──
  if (phase === "setup") {
    return (
      <>
        <Header title="KO Scout" />
        <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
          <Link href="/scout/kickoff" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          <h2 className="text-lg font-bold text-slate-100">Kickoff Chart Setup</h2>
          <p className="text-xs text-muted">Select or add kickers, then set number of kickoffs.</p>
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
          <div>
            <p className="text-xs text-muted mb-1">Kicks per player</p>
            <input type="text" inputMode="numeric" value={kicksPerPlayer} onChange={(e) => setKicksPerPlayer(e.target.value.replace(/\D/g, ""))} className="input w-20 text-center text-sm font-bold py-1.5" />
          </div>
          <div className="flex items-center justify-between card-2 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-200">Drop Worst Kick</p>
              <p className="text-[10px] text-muted">Exclude lowest score from average</p>
            </div>
            <button
              onClick={() => setDropWorst(!dropWorst)}
              className={clsx("w-10 h-5 rounded-full transition-colors relative", dropWorst ? "bg-amber-500" : "bg-surface-2 border border-border")}
            >
              <div className={clsx("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all", dropWorst ? "left-5" : "left-0.5")} />
            </button>
          </div>
          <div className="card-2 p-3 text-xs text-muted space-y-1">
            <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Scoring</p>
            <p>Kick score = Distance + (Hang Time x 10). Bad direction = -10.</p>
            <p>Final = average of all kicks{dropWorst ? ", dropping the worst one" : ""}.</p>
          </div>
          <button onClick={() => { setPhase("live"); setActivePlayer(selectedPlayers[0] ?? ""); }} disabled={selectedPlayers.length === 0 || !parseInt(kicksPerPlayer)} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start</button>
        </main>
      </>
    );
  }

  // ── Results ──
  if (phase === "results") {
    const allAthletes = [...new Set(results.map((r) => r.athlete))];
    const maxKicks = Math.max(...allAthletes.map((n) => getPlayerResults(n).length));
    const ranked = allAthletes
      .map((name) => {
        const entries = getPlayerResults(name);
        const scores = entries.map((e) => e.score);
        const worst = dropWorst && scores.length > 1 ? Math.min(...scores) : null;
        return { name, entries, avg: getPlayerAvg(name), worst };
      })
      .sort((a, b) => b.avg - a.avg);

    return (
      <>
        <Header title="KO Scout Results" />
        <main className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
          <p className="text-xs text-muted">Score = avg of all kicks{dropWorst ? ", worst dropped" : ""}. Kick = Dist + (Hang x 10), bad dir = -10.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                  {Array.from({ length: maxKicks }, (_, i) => (
                    <th key={i} className="text-[10px] text-muted text-center py-1 px-2">K{i + 1}</th>
                  ))}
                  <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.name} className="border-t border-border/30">
                    <td className="py-1 px-2 font-semibold text-slate-200 text-left"><span className="text-muted mr-1">{i + 1}.</span>{r.name}</td>
                    {r.entries.map((e, j) => {
                      const isWorst = r.worst !== null && e.score === r.worst && r.entries.filter((x) => x.score === r.worst).length > 0;
                      const isDropped = isWorst && j === r.entries.findIndex((x) => x.score === r.worst);
                      return (
                        <td key={j} className={clsx("text-center py-1 px-2", isDropped ? "opacity-40 line-through" : "", e.directionGood ? "text-make" : "text-miss")}>
                          <span className="font-bold">{e.distance}</span>
                          <span className="text-[9px] block">{e.hangTime.toFixed(2)}s</span>
                          <span className="text-[8px] block text-muted">{e.score.toFixed(1)}</span>
                        </td>
                      );
                    })}
                    {Array.from({ length: maxKicks - r.entries.length }, (_, j) => (
                      <td key={`e-${j}`} className="text-center py-1 px-2 text-muted">—</td>
                    ))}
                    <td className="text-right py-1 px-2 font-black text-amber-400">{r.avg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 max-w-sm mx-auto">
            {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to Rankings</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
            <Link href="/scout/kickoff" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
          </div>
        </main>
      </>
    );
  }

  // ── Live ──
  const kpp = parseInt(kicksPerPlayer) || 0;
  const playerKickCount = getPlayerResults(activePlayer).length;

  return (
    <>
      <Header title="KO Scout" />
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        {/* Athlete selector — tap to switch */}
        <div className="flex flex-wrap gap-2 justify-center">
          {selectedPlayers.map((p) => {
            const count = getPlayerResults(p).length;
            const avg = getPlayerAvg(p);
            return (
              <button
                key={p}
                onClick={() => setActivePlayer(p)}
                className={clsx(
                  "card-2 px-3 py-2 text-center transition-all min-w-[80px]",
                  p === activePlayer ? "ring-2 ring-amber-500" : "opacity-60 hover:opacity-100"
                )}
              >
                <p className="text-xs font-bold text-slate-200">{p}</p>
                <p className="text-lg font-black text-amber-400">{count > 0 ? avg.toFixed(2) : "—"}</p>
                <p className="text-[10px] text-muted">{count}/{kpp} kicks</p>
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-muted text-center">
          Kick score = Dist + (Hang x 10), bad dir = -10. Final = avg{dropWorst ? ", drop worst" : ""}.
        </p>

        {/* Active player header */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">{activePlayer} — Kick {playerKickCount + 1} of {kpp}</p>
        </div>

        {/* Inputs */}
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Distance</p>
              <input type="text" inputMode="numeric" value={distInput} onChange={(e) => setDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
            </div>
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Hang Time</p>
              <input type="text" inputMode="numeric" value={hangInput ? parseHangRaw(hangInput).toFixed(2) : ""} onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Direction</p>
            <div className="flex rounded-input border border-border overflow-hidden">
              <button onClick={() => setDirGood(true)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors", dirGood ? "bg-make text-slate-900" : "text-muted hover:text-white")}>Good</button>
              <button onClick={() => setDirGood(false)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors border-l border-border", !dirGood ? "bg-miss text-white" : "text-muted hover:text-white")}>Bad (-10)</button>
            </div>
          </div>
        </div>

        {/* Log + Undo + Finish */}
        <div className="flex gap-2">
          {results.length > 0 && <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
          <button onClick={handleLog} disabled={!distInput || !hangInput || !activePlayer} className="btn-primary flex-1 py-2 text-sm font-bold disabled:opacity-40">Log Kick</button>
        </div>
        {results.length > 0 && (
          <button onClick={handleFinish} className="btn-ghost w-full py-2 text-xs font-bold border border-amber-500/40 text-amber-400">Finish Chart</button>
        )}

        {/* Full kick log */}
        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[200px]">
            {[...results].reverse().map((r, i) => (
              <div key={results.length - 1 - i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{results.length - i}</span>
                <span className="text-slate-400 w-20 truncate">{r.athlete}</span>
                <span className={clsx(r.directionGood ? "text-make" : "text-miss")}>{r.distance}yd</span>
                <span className={clsx(r.directionGood ? "text-make" : "text-miss")}>{r.hangTime.toFixed(2)}s</span>
                <span className="text-amber-400 font-bold ml-auto">{r.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
