"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTeamId } from "@/lib/teamData";
import { loadScoutPreset, saveScoutPreset, insertScoutSession, loadScoutAthletes, saveScoutAthletes } from "@/lib/scoutStore";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

const HASH_OPTIONS = ["L", "M", "R"];
const PRESET_KEY = "scout_fg_preset";

interface PresetKick {
  distance: number;
  hash: string;
  pointValue: number;
}

interface FGResult {
  athlete: string;
  kickNum: number;
  distance: number;
  hash: string;
  pointValue: number;
  result: "make" | "miss";
  score: number;
}

type Phase = "preset-edit" | "setup" | "manual-setup" | "live" | "results";

function ScoutFGChartInner() {
  const searchParams = useSearchParams();
  const chartMode = searchParams.get("mode") === "manual" ? "manual" : "preset";

  const [phase, setPhase] = useState<Phase>(chartMode === "preset" ? "preset-edit" : "manual-setup");
  const [athleteNames, setAthleteNames] = useState<string[]>([]);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  // Preset
  const [presetKicks, setPresetKicks] = useState<PresetKick[]>([]);
  const [presetLoaded, setPresetLoaded] = useState(false);
  const [newDist, setNewDist] = useState("30");
  const [newHash, setNewHash] = useState("M");
  const [newPoints, setNewPoints] = useState("1");

  // Per-athlete kick overrides (for preset mode)
  const [athleteKicks, setAthleteKicks] = useState<Record<string, PresetKick[]>>({});

  // Manual mode
  const [manualDist, setManualDist] = useState("30");
  const [manualHash, setManualHash] = useState("M");
  const [manualPoints, setManualPoints] = useState("1");

  // Live charting
  const [results, setResults] = useState<FGResult[]>([]);

  // Total kicks for live mode
  const kicks: PresetKick[] = chartMode === "preset" ? presetKicks : [];
  const totalKicks = chartMode === "preset"
    ? selectedPlayers.length * kicks.length
    : 0; // manual mode has no fixed total

  const currentIdx = results.length;
  const currentPlayerIdx = selectedPlayers.length > 0 ? currentIdx % selectedPlayers.length : 0;
  const currentPlayer = selectedPlayers[currentPlayerIdx] ?? "";
  const currentKickNum = selectedPlayers.length > 0 ? Math.floor(currentIdx / selectedPlayers.length) : 0;

  // Get the kick for current player + round (with overrides)
  const getCurrentKick = (): PresetKick | null => {
    if (chartMode === "preset") {
      const overrides = athleteKicks[currentPlayer];
      if (overrides && overrides[currentKickNum]) return overrides[currentKickNum];
      return kicks[currentKickNum] ?? null;
    }
    return null;
  };

  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerScore = (name: string) => getPlayerResults(name).reduce((s, r) => s + r.score, 0);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }
      if (!tid || !active) return;
      const names = await loadScoutAthletes(tid, "fg");
      if (!active) return;
      setAthleteNames(names);
      const preset = await loadScoutPreset<PresetKick[]>(tid, PRESET_KEY);
      if (preset && active) setPresetKicks(preset);
      setPresetLoaded(true);
    }
    load();
    return () => { active = false; };
  }, []);

  const handleSavePreset = async () => {
    const tid = getTeamId();
    if (tid) await saveScoutPreset(tid, PRESET_KEY, presetKicks);
    setPhase("setup");
  };

  const addPresetKick = () => {
    const d = parseInt(newDist) || 30;
    const p = parseInt(newPoints) || 1;
    setPresetKicks((prev) => [...prev, { distance: d, hash: newHash, pointValue: p }]);
  };

  const removePresetKick = (idx: number) => {
    setPresetKicks((prev) => prev.filter((_, i) => i !== idx));
  };

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const startChart = () => {
    // Initialize per-athlete kicks from preset
    if (chartMode === "preset") {
      const akicks: Record<string, PresetKick[]> = {};
      for (const p of selectedPlayers) {
        akicks[p] = [...presetKicks];
      }
      setAthleteKicks(akicks);
    }
    setPhase("live");
  };

  const handleResult = (result: "make" | "miss") => {
    if (chartMode === "preset") {
      const kick = getCurrentKick();
      if (!kick) return;
      const score = result === "make" ? kick.pointValue : 0;
      setResults((prev) => [...prev, {
        athlete: currentPlayer,
        kickNum: currentKickNum + 1,
        distance: kick.distance,
        hash: kick.hash,
        pointValue: kick.pointValue,
        result,
        score,
      }]);
      if (results.length + 1 >= totalKicks) setPhase("results");
    } else {
      // Manual mode
      const d = parseInt(manualDist) || 0;
      const p = parseInt(manualPoints) || 1;
      const score = result === "make" ? p : 0;
      const kickNum = getPlayerResults(currentPlayer).length + 1;
      setResults((prev) => [...prev, {
        athlete: currentPlayer,
        kickNum,
        distance: d,
        hash: manualHash,
        pointValue: p,
        result,
        score,
      }]);
    }
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    setResults((prev) => prev.slice(0, -1));
    if (phase === "results") setPhase("live");
  };

  const handleFinishManual = () => {
    if (results.length > 0) setPhase("results");
  };

  const handleSave = async () => {
    const tid = getTeamId();
    if (!tid || results.length === 0) return;
    const athletes = [...new Set(results.map((r) => r.athlete))];
    const label = `FG Scout — ${athletes.map((a) => `${a}: ${getPlayerScore(a)}`).join(", ")}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_FG",
      label,
      date: new Date().toISOString(),
      entries: results as unknown as Record<string, unknown>[],
    });
    setSaved(true);
  };

  const handleNewChart = () => {
    setResults([]);
    setSelectedPlayers([]);
    setSaved(false);
    setPhase(chartMode === "preset" ? "preset-edit" : "manual-setup");
  };

  // Edit a kick for current athlete in preset mode
  const [editingKick, setEditingKick] = useState(false);
  const [editDist, setEditDist] = useState("");
  const [editHash, setEditHash] = useState("M");
  const [editPoints, setEditPoints] = useState("");

  const startEditKick = () => {
    const kick = getCurrentKick();
    if (!kick) return;
    setEditDist(String(kick.distance));
    setEditHash(kick.hash);
    setEditPoints(String(kick.pointValue));
    setEditingKick(true);
  };

  const saveEditKick = () => {
    const d = parseInt(editDist) || 30;
    const p = parseInt(editPoints) || 1;
    setAthleteKicks((prev) => {
      const next = { ...prev };
      const arr = [...(next[currentPlayer] ?? presetKicks)];
      arr[currentKickNum] = { distance: d, hash: editHash, pointValue: p };
      next[currentPlayer] = arr;
      return next;
    });
    setEditingKick(false);
  };

  const addAthlete = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || athleteNames.includes(trimmed)) return;
    const updated = [...athleteNames, trimmed];
    setAthleteNames(updated);
    setNewAthleteName("");
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "fg", updated);
  };

  const removeAthlete = async (name: string) => {
    const updated = athleteNames.filter((n) => n !== name);
    setAthleteNames(updated);
    setSelectedPlayers((prev) => prev.filter((n) => n !== name));
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "fg", updated);
  };

  // ── Preset Editor ──
  if (phase === "preset-edit") {
    return (
      <>
        <Header title="FG Preset Chart" />
        <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
          <Link href="/scout/fg" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          <h2 className="text-lg font-bold text-slate-100">
            {presetKicks.length === 0 ? "Create Your FG Chart" : "Edit FG Chart"}
          </h2>
          <p className="text-xs text-muted">Define kicks with distance, hash, and optional point value.</p>

          {/* Current kicks */}
          {presetKicks.length > 0 && (
            <div className="card-2 space-y-1">
              {presetKicks.map((k, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted w-6">{i + 1}.</span>
                  <span className="text-slate-200 font-semibold">{k.distance}yd</span>
                  <span className="text-slate-300">{k.hash}</span>
                  <span className="text-amber-400 font-bold">{k.pointValue}pt</span>
                  <button onClick={() => removePresetKick(i)} className="text-miss text-[10px] hover:underline">Remove</button>
                </div>
              ))}
            </div>
          )}

          {/* Add kick */}
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Add Kick</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                <input type="text" inputMode="numeric" value={newDist} onChange={(e) => setNewDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Hash</p>
                <select value={newHash} onChange={(e) => setNewHash(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5">
                  {HASH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Points</p>
                <input type="text" inputMode="numeric" value={newPoints} onChange={(e) => setNewPoints(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
              </div>
            </div>
            <button onClick={addPresetKick} disabled={!newDist} className="btn-primary w-full py-2 text-xs font-bold disabled:opacity-40">Add Kick</button>
          </div>

          <button onClick={handleSavePreset} disabled={presetKicks.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">
            Save &amp; Select Athletes
          </button>
        </main>
      </>
    );
  }

  // ── Setup (athlete selection) ──
  if (phase === "setup" || phase === "manual-setup") {
    return (
      <>
        <Header title={chartMode === "preset" ? "FG Preset Chart" : "FG Manual Chart"} />
        <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
          <Link href="/scout/fg" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          <h2 className="text-lg font-bold text-slate-100">Select Athletes</h2>
          <p className="text-xs text-muted">Select or add kickers to evaluate.</p>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <div key={a} className="flex items-center gap-0.5">
                <button onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-l-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>
                  {a}
                </button>
                <button onClick={() => removeAthlete(a)} className="px-1.5 py-1.5 rounded-r-input text-[10px] bg-surface-2 text-muted border border-border border-l-0 hover:text-miss transition-colors">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newAthleteName} onChange={(e) => setNewAthleteName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addAthlete(newAthleteName); }} placeholder="Type name to add..." className="input flex-1 text-sm py-1.5" />
            <button onClick={() => addAthlete(newAthleteName)} disabled={!newAthleteName.trim()} className="btn-primary px-4 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
          </div>
          {selectedPlayers.length > 0 && (
            <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>
          )}
          {chartMode === "preset" && presetKicks.length > 0 && (
            <div className="card-2 text-xs space-y-1">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Chart Preview</p>
              {presetKicks.map((k, i) => (
                <div key={i} className="flex items-center gap-3 text-slate-300">
                  <span className="text-muted w-4">{i + 1}.</span>
                  <span>{k.distance}yd</span>
                  <span>{k.hash}</span>
                  <span className="text-amber-400">{k.pointValue}pt</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={startChart} disabled={selectedPlayers.length === 0} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">
            Start Chart
          </button>
        </main>
      </>
    );
  }

  // ── Results ──
  if (phase === "results") {
    const allAthletes = [...new Set(results.map((r) => r.athlete))];
    const allKicks = [...new Set(results.map((r) => r.kickNum))].sort((a, b) => a - b);
    const kickInfo = allKicks.map((k) => {
      const e = results.find((en) => en.kickNum === k);
      return { num: k, distance: e?.distance ?? 0, hash: e?.hash ?? "", pointValue: e?.pointValue ?? 0 };
    });
    const ranked = allAthletes
      .map((name) => ({
        name,
        entries: results.filter((r) => r.athlete === name),
        total: getPlayerScore(name),
      }))
      .sort((a, b) => b.total - a.total);

    return (
      <>
        <Header title="FG Scout Results" />
        <main className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                  {kickInfo.map((k) => (
                    <th key={k.num} className="text-[10px] text-muted text-center py-1 px-2">
                      {k.distance}yd {k.hash}
                      {k.pointValue > 1 && <span className="block text-[8px]">({k.pointValue}pt)</span>}
                    </th>
                  ))}
                  <th className="text-[10px] text-muted text-right py-1 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.name} className="border-t border-border/30">
                    <td className="py-1.5 px-2 font-semibold text-slate-200 text-left">
                      <span className="text-muted mr-1">{i + 1}.</span>{r.name}
                    </td>
                    {allKicks.map((k) => {
                      const e = r.entries.find((en) => en.kickNum === k);
                      return (
                        <td key={k} className={clsx("text-center py-1.5 px-2 font-bold", e?.result === "make" ? "text-make" : "text-miss")}>
                          {e ? e.score : "—"}
                        </td>
                      );
                    })}
                    <td className="text-right py-1.5 px-2 font-black text-amber-400">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 max-w-sm mx-auto">
            {!saved ? (
              <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to Rankings</button>
            ) : (
              <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>
            )}
            <button onClick={handleNewChart} className="btn-ghost flex-1 py-3 text-sm">New Chart</button>
          </div>
        </main>
      </>
    );
  }

  // ── Live Charting ──
  const currentKick = chartMode === "preset" ? getCurrentKick() : null;
  const playerKickCount = getPlayerResults(currentPlayer).length + 1;

  return (
    <>
      <Header title="FG Scout" />
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        {/* Header info */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              {currentPlayer} — Kick {playerKickCount}
              {chartMode === "preset" && kicks.length > 0 && <span> of {kicks.length}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-amber-400">{getPlayerScore(currentPlayer)}</p>
            <p className="text-[10px] text-muted">score</p>
          </div>
        </div>

        {/* Multiplayer scoreboard */}
        {selectedPlayers.length > 1 && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {selectedPlayers.map((p, i) => (
              <div key={p} className="flex items-center gap-3">
                {i > 0 && <span className="text-xs text-muted font-bold">vs</span>}
                <div className={clsx("card-2 px-3 py-2 text-center", p === currentPlayer && "ring-2 ring-amber-500")}>
                  <p className="text-xs font-bold text-slate-200">{p}</p>
                  <p className="text-lg font-black text-amber-400">{getPlayerScore(p)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar for preset */}
        {chartMode === "preset" && totalKicks > 0 && (
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${(results.length / totalKicks) * 100}%` }} />
          </div>
        )}

        {/* Kick info */}
        {chartMode === "preset" && currentKick && !editingKick && (
          <div className="card-2 py-3 px-4 text-center">
            <p className="text-2xl font-black text-slate-100">{currentKick.distance}yd</p>
            <p className="text-sm text-slate-300">{currentKick.hash} Hash</p>
            {currentKick.pointValue > 0 && <p className="text-xs text-amber-400 font-bold mt-1">{currentKick.pointValue} point{currentKick.pointValue !== 1 ? "s" : ""}</p>}
            <button onClick={startEditKick} className="text-[10px] text-muted hover:text-amber-400 mt-2 transition-colors">Change for {currentPlayer}</button>
          </div>
        )}

        {/* Edit kick overlay */}
        {chartMode === "preset" && editingKick && (
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Edit Kick for {currentPlayer}</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                <input type="text" inputMode="numeric" value={editDist} onChange={(e) => setEditDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Hash</p>
                <select value={editHash} onChange={(e) => setEditHash(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5">
                  {HASH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Points</p>
                <input type="text" inputMode="numeric" value={editPoints} onChange={(e) => setEditPoints(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
              </div>
            </div>
            <button onClick={saveEditKick} className="btn-primary w-full py-2 text-xs font-bold">Save Change</button>
          </div>
        )}

        {/* Manual mode inputs */}
        {chartMode === "manual" && (
          <div className="card space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                <input type="text" inputMode="numeric" value={manualDist} onChange={(e) => setManualDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Hash</p>
                <select value={manualHash} onChange={(e) => setManualHash(e.target.value)} className="input w-full text-center text-lg font-bold py-2">
                  {HASH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Points</p>
                <input type="text" inputMode="numeric" value={manualPoints} onChange={(e) => setManualPoints(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-lg font-bold py-2" />
              </div>
            </div>
          </div>
        )}

        {/* Make / Miss buttons */}
        {(!editingKick) && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleResult("make")} className="py-6 rounded-input text-lg font-black bg-make/20 text-make border-2 border-make/40 hover:bg-make/30 transition-all">
              MAKE
            </button>
            <button onClick={() => handleResult("miss")} className="py-6 rounded-input text-lg font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all">
              MISS
            </button>
          </div>
        )}

        {/* Undo + Finish */}
        <div className="flex gap-2">
          {results.length > 0 && (
            <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">
              Undo
            </button>
          )}
          {chartMode === "manual" && results.length > 0 && (
            <button onClick={handleFinishManual} className="btn-ghost flex-1 py-2 text-xs font-bold border border-amber-500/40 text-amber-400">
              Finish Chart
            </button>
          )}
        </div>

        {/* Mini log */}
        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[150px]">
            {results.map((r, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                <span className="text-slate-400 w-16 truncate">{r.athlete}</span>
                <span className="text-slate-300">{r.distance}yd {r.hash}</span>
                <span className={clsx("font-bold ml-auto", r.result === "make" ? "text-make" : "text-miss")}>
                  {r.result === "make" ? `+${r.score}` : "0"}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

export default function ScoutFGChartPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}>
      <ScoutFGChartInner />
    </Suspense>
  );
}
