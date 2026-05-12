"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import { insertScoutSession, loadScoutAthletes, saveScoutAthletes } from "@/lib/scoutStore";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

interface PuntResult {
  athlete: string;
  kickNum: number;
  distance: number;
  hangTime: number;
  opTime: number;
  directionGood: boolean;
  score: number;
}

const DIR_OPTIONS = ["Good", "Bad"];

export default function ScoutPuntChartPage() {
  const [phase, setPhase] = useState<"setup" | "live" | "results">("setup");
  const [athleteNames, setAthleteNames] = useState<string[]>([]);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [puntsPerPlayer, setPuntsPerPlayer] = useState("5");
  const [saved, setSaved] = useState(false);

  const [results, setResults] = useState<PuntResult[]>([]);
  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [opInput, setOpInput] = useState("");
  const [dirGood, setDirGood] = useState(true);

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const totalPunts = selectedPlayers.length * (parseInt(puntsPerPlayer) || 0);
  const currentIdx = results.length;
  const currentPlayerIdx = selectedPlayers.length > 0 ? currentIdx % selectedPlayers.length : 0;
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";

  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerScore = (name: string) => getPlayerResults(name).reduce((s, r) => s + r.score, 0);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid || !active) return;
      const names = await loadScoutAthletes(tid, "punt");
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
    if (tid) await saveScoutAthletes(tid, "punt", updated);
  };

  const removeAthlete = async (name: string) => {
    const updated = athleteNames.filter((n) => n !== name);
    setAthleteNames(updated);
    setSelectedPlayers((prev) => prev.filter((n) => n !== name));
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "punt", updated);
  };

  const handleLog = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    const op = parseHangRaw(opInput);
    if (isNaN(dist) || dist <= 0 || !hang) return;
    const score = parseFloat((dist + hang * 15 + (dirGood ? 0 : -10)).toFixed(2));
    const kickNum = getPlayerResults(currentPlayer).length + 1;
    setResults((prev) => [...prev, { athlete: currentPlayer, kickNum, distance: dist, hangTime: hang, opTime: op, directionGood: dirGood, score }]);
    setDistInput("");
    setHangInput("");
    setOpInput("");
    setDirGood(true);
    if (results.length + 1 >= totalPunts) setPhase("results");
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    if (phase === "results") setPhase("live");
  };

  const handleSave = async () => {
    const tid = getTeamId();
    if (!tid || results.length === 0) return;
    const athletes = [...new Set(results.map((r) => r.athlete))];
    const label = `Punt Scout — ${athletes.map((a) => `${a}: ${getPlayerScore(a).toFixed(2)}`).join(", ")}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_PUNT",
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
        <Header title="Punt Scout" />
        <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
          <Link href="/scout/punt" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          <h2 className="text-lg font-bold text-slate-100">Punt Chart Setup</h2>
          <p className="text-xs text-muted">Select or add punters, then set number of punts.</p>
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
            <p className="text-xs text-muted mb-1">Punts per player</p>
            <input type="text" inputMode="numeric" value={puntsPerPlayer} onChange={(e) => setPuntsPerPlayer(e.target.value.replace(/\D/g, ""))} className="input w-20 text-center text-sm font-bold py-1.5" />
          </div>
          <button onClick={() => setPhase("live")} disabled={selectedPlayers.length === 0 || !parseInt(puntsPerPlayer)} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start</button>
        </main>
      </>
    );
  }

  // ── Results ──
  if (phase === "results") {
    const allAthletes = [...new Set(results.map((r) => r.athlete))];
    const maxKicks = Math.max(...allAthletes.map((n) => getPlayerResults(n).length));
    const ranked = allAthletes
      .map((name) => ({ name, entries: getPlayerResults(name), total: getPlayerScore(name) }))
      .sort((a, b) => b.total - a.total);

    return (
      <>
        <Header title="Punt Scout Results" />
        <main className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                  {Array.from({ length: maxKicks }, (_, i) => (
                    <th key={i} className="text-[10px] text-muted text-center py-1 px-2">P{i + 1}</th>
                  ))}
                  <th className="text-[10px] text-muted text-right py-1 px-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.name} className="border-t border-border/30">
                    <td className="py-1 px-2 font-semibold text-slate-200 text-left"><span className="text-muted mr-1">{i + 1}.</span>{r.name}</td>
                    {r.entries.map((e, j) => (
                      <td key={j} className={clsx("text-center py-1 px-2", e.directionGood ? "text-make" : "text-miss")}>
                        <span className="font-bold">{e.distance}</span>
                        <span className="text-[9px] block">{e.hangTime.toFixed(2)}s</span>
                      </td>
                    ))}
                    {Array.from({ length: maxKicks - r.entries.length }, (_, j) => (
                      <td key={`e-${j}`} className="text-center py-1 px-2 text-muted">—</td>
                    ))}
                    <td className="text-right py-1 px-2 font-black text-amber-400">{r.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 max-w-sm mx-auto">
            {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to Rankings</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
            <Link href="/scout/punt" className="btn-ghost flex-1 py-3 text-sm text-center">Done</Link>
          </div>
        </main>
      </>
    );
  }

  // ── Live ──
  const playerKickCount = getPlayerResults(currentPlayer).length + 1;
  const ppp = parseInt(puntsPerPlayer) || 0;

  return (
    <>
      <Header title="Punt Scout" />
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">{currentPlayer} — Punt {playerKickCount} of {ppp}</p>
          <div className="text-right">
            <p className="text-2xl font-black text-amber-400">{getPlayerScore(currentPlayer).toFixed(2)}</p>
            <p className="text-[10px] text-muted">score</p>
          </div>
        </div>

        {selectedPlayers.length > 1 && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {selectedPlayers.map((p, i) => (
              <div key={p} className="flex items-center gap-3">
                {i > 0 && <span className="text-xs text-muted font-bold">vs</span>}
                <div className={clsx("card-2 px-3 py-2 text-center", p === currentPlayer && "ring-2 ring-amber-500")}>
                  <p className="text-xs font-bold text-slate-200">{p}</p>
                  <p className="text-lg font-black text-amber-400">{getPlayerScore(p).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${(results.length / totalPunts) * 100}%` }} />
        </div>

        <div className="card space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Distance</p>
              <input type="text" inputMode="numeric" value={distInput} onChange={(e) => setDistInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
            </div>
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Hang Time</p>
              <input type="text" inputMode="numeric" value={hangInput ? parseHangRaw(hangInput).toFixed(2) : ""} onChange={(e) => setHangInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
            </div>
            <div>
              <p className="text-[10px] text-muted text-center uppercase tracking-wider mb-1">Op Time</p>
              <input type="text" inputMode="numeric" value={opInput ? parseHangRaw(opInput).toFixed(2) : ""} onChange={(e) => setOpInput(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
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

        <div className="flex gap-2">
          {results.length > 0 && <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
          <button onClick={handleLog} disabled={!distInput || !hangInput} className="btn-primary flex-1 py-2 text-sm font-bold disabled:opacity-40">Log Punt</button>
        </div>

        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[150px]">
            {results.map((r, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                <span className="text-slate-400 w-16 truncate">{r.athlete}</span>
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
