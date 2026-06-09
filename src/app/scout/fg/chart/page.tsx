"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTeamId } from "@/lib/teamData";
import { loadScoutPreset, saveScoutPreset, insertScoutSession, loadScoutAthletes, saveScoutAthletes, removeScoutAthlete, loadScoutNumbers, saveScoutNumbers, scoutDisplayName, todayDateInput, dateInputToISO } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
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
  const [scoutNumbers, setScoutNumbers] = useState<Record<string, string>>({});
  const [newAthleteNum, setNewAthleteNum] = useState("");

  // Preset
  const [presetKicks, setPresetKicks] = useState<PresetKick[]>([]);
  const [presetLoaded, setPresetLoaded] = useState(false);
  const [newDist, setNewDist] = useState("30");
  const [newHash, setNewHash] = useState("M");
  const [newPoints, setNewPoints] = useState("1");

  // Per-athlete kick overrides (for preset mode)
  const [athleteKicks, setAthleteKicks] = useState<Record<string, PresetKick[]>>({});

  // Manual mode — extra kicks added on the fly
  const [manualKicks, setManualKicks] = useState<PresetKick[]>([]);
  const [manualDist, setManualDist] = useState("30");
  const [manualHash, setManualHash] = useState("M");
  const [manualPoints, setManualPoints] = useState("1");

  // Grid-based results: resultMap[athlete][kickIdx] = "make" | "miss"
  const [resultMap, setResultMap] = useState<Record<string, Record<number, "make" | "miss">>>({});
  // Which cell is selected: { athlete, kickIdx }
  const [activeCell, setActiveCell] = useState<{ athlete: string; kickIdx: number } | null>(null);

  // Flattened results for saving
  const kicks: PresetKick[] = chartMode === "preset" ? presetKicks : manualKicks;

  const getKickForAthlete = (athlete: string, kickIdx: number): PresetKick => {
    const overrides = athleteKicks[athlete];
    if (overrides && overrides[kickIdx]) return overrides[kickIdx];
    return kicks[kickIdx] ?? { distance: 0, hash: "M", pointValue: 1 };
  };

  const getPlayerScore = (name: string) => {
    const map = resultMap[name] ?? {};
    return Object.entries(map).reduce((s, [idx, res]) => {
      if (res === "make") {
        const kick = getKickForAthlete(name, parseInt(idx));
        return s + kick.pointValue;
      }
      return s;
    }, 0);
  };

  const getResultCount = () => {
    return Object.values(resultMap).reduce((s, m) => s + Object.keys(m).length, 0);
  };

  const getTotalKicks = () => selectedPlayers.length * kicks.length;

  const buildResults = (): FGResult[] => {
    const out: FGResult[] = [];
    for (const athlete of selectedPlayers) {
      const map = resultMap[athlete] ?? {};
      for (let i = 0; i < kicks.length; i++) {
        const res = map[i];
        if (!res) continue;
        const kick = getKickForAthlete(athlete, i);
        out.push({
          athlete,
          kickNum: i + 1,
          distance: kick.distance,
          hash: kick.hash,
          pointValue: kick.pointValue,
          result: res,
          score: res === "make" ? kick.pointValue : 0,
        });
      }
    }
    return out;
  };

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }
      if (!tid || !active) return;
      const [names, nums] = await Promise.all([loadScoutAthletes(tid, "fg"), loadScoutNumbers(tid, "fg")]);
      if (!active) return;
      setAthleteNames(names);
      setScoutNumbers(nums);
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
    if (chartMode === "preset") {
      const akicks: Record<string, PresetKick[]> = {};
      for (const p of selectedPlayers) {
        akicks[p] = [...presetKicks];
      }
      setAthleteKicks(akicks);
    }
    setResultMap({});
    setActiveCell(null);
    setPhase("live");
  };

  const handleResult = (result: "make" | "miss") => {
    if (!activeCell) return;
    const { athlete, kickIdx } = activeCell;
    setResultMap((prev) => ({
      ...prev,
      [athlete]: { ...(prev[athlete] ?? {}), [kickIdx]: result },
    }));
    // Auto-advance to next unkicked cell
    const nextCell = findNextEmpty(athlete, kickIdx);
    setActiveCell(nextCell);
  };

  const findNextEmpty = (fromAthlete: string, fromIdx: number): { athlete: string; kickIdx: number } | null => {
    // Try next kick for same athlete
    for (let i = fromIdx + 1; i < kicks.length; i++) {
      if (!resultMap[fromAthlete]?.[i]) return { athlete: fromAthlete, kickIdx: i };
    }
    // Try next athletes
    const startPlayerIdx = selectedPlayers.indexOf(fromAthlete);
    for (let p = 1; p <= selectedPlayers.length; p++) {
      const playerIdx = (startPlayerIdx + p) % selectedPlayers.length;
      const player = selectedPlayers[playerIdx];
      for (let i = 0; i < kicks.length; i++) {
        if (!resultMap[player]?.[i]) return { athlete: player, kickIdx: i };
      }
    }
    return null;
  };

  const handleClearCell = () => {
    if (!activeCell) return;
    const { athlete, kickIdx } = activeCell;
    setResultMap((prev) => {
      const next = { ...prev };
      const athleteMap = { ...(next[athlete] ?? {}) };
      delete athleteMap[kickIdx];
      next[athlete] = athleteMap;
      return next;
    });
  };

  const handleFinish = () => {
    if (getResultCount() > 0) setPhase("results");
  };

  const handleSave = async () => {
    const tid = getTeamId();
    const results = buildResults();
    if (!tid || results.length === 0) return;
    const label = `FG Scout — ${selectedPlayers.map((a) => `${a}: ${getPlayerScore(a)}`).join(", ")}`;
    // Attach notes to each athlete's first entry
    const entriesWithNotes = results.map((r, i) => {
      const base = i === 0 ? { ...r, chartMode: chartMode } : { ...r };
      const note = athleteNotes[r.athlete];
      if (note) {
        const isFirstForAthlete = results.findIndex((x) => x.athlete === r.athlete) === i;
        if (isFirstForAthlete) return { ...base, notes: note };
      }
      return base;
    });
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_FG",
      label,
      date: dateInputToISO(chartDate),
      weather: weather || undefined,
      entries: entriesWithNotes as unknown as Record<string, unknown>[],
    });
    setSaved(true);
  };

  // Notes + weather for results
  const [athleteNotes, setAthleteNotes] = useState<Record<string, string>>({});
  const [weather, setWeather] = useState("");
  const [chartDate, setChartDate] = useState(todayDateInput());

  const handleNewChart = () => {
    setResultMap({});
    setActiveCell(null);
    setSelectedPlayers([]);
    setSaved(false);
    setManualKicks([]);
    setAthleteNotes({});
    setWeather("");
    setChartDate(todayDateInput());
    setPhase(chartMode === "preset" ? "preset-edit" : "manual-setup");
  };

  // Edit a kick for a specific athlete
  const [editingKick, setEditingKick] = useState<{ athlete: string; kickIdx: number } | null>(null);
  const [editDist, setEditDist] = useState("");
  const [editHash, setEditHash] = useState("M");
  const [editPoints, setEditPoints] = useState("");

  const startEditKick = (athlete: string, kickIdx: number) => {
    const kick = getKickForAthlete(athlete, kickIdx);
    setEditDist(String(kick.distance));
    setEditHash(kick.hash);
    setEditPoints(String(kick.pointValue));
    setEditingKick({ athlete, kickIdx });
  };

  const saveEditKick = () => {
    if (!editingKick) return;
    const d = parseInt(editDist) || 30;
    const p = parseInt(editPoints) || 1;
    const { athlete, kickIdx } = editingKick;
    setAthleteKicks((prev) => {
      const next = { ...prev };
      const arr = [...(next[athlete] ?? [...kicks])];
      arr[kickIdx] = { distance: d, hash: editHash, pointValue: p };
      next[athlete] = arr;
      return next;
    });
    setEditingKick(null);
  };

  const addManualKick = () => {
    const d = parseInt(manualDist) || 30;
    const p = parseInt(manualPoints) || 1;
    setManualKicks((prev) => [...prev, { distance: d, hash: manualHash, pointValue: p }]);
  };

  const addExtraKick = () => {
    const d = parseInt(manualDist) || 30;
    const p = parseInt(manualPoints) || 1;
    const newKick: PresetKick = { distance: d, hash: manualHash, pointValue: p };
    if (chartMode === "preset") {
      setPresetKicks((prev) => [...prev, newKick]);
      setAthleteKicks((prev) => {
        const next = { ...prev };
        for (const player of selectedPlayers) {
          next[player] = [...(next[player] ?? [...presetKicks]), newKick];
        }
        return next;
      });
    } else {
      setManualKicks((prev) => [...prev, newKick]);
    }
    setManualDist("30");
    setManualHash("M");
    setManualPoints("1");
  };

  // Warn before leaving if there's unsaved data
  useUnsavedWarning(getResultCount() > 0 && !saved);

  const addAthlete = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || athleteNames.includes(trimmed)) return;
    const updated = [...athleteNames, trimmed];
    setAthleteNames(updated);
    setNewAthleteName("");
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "fg", updated);
    if (newAthleteNum.trim()) {
      const updatedNums = { ...scoutNumbers, [trimmed]: newAthleteNum.trim() };
      setScoutNumbers(updatedNums);
      if (tid) await saveScoutNumbers(tid, "fg", updatedNums);
    }
    setNewAthleteNum("");
  };

  const removeAthlete = async (name: string) => {
    setAthleteNames((prev) => prev.filter((n) => n !== name));
    setSelectedPlayers((prev) => prev.filter((n) => n !== name));
    const tid = getTeamId();
    if (tid) await removeScoutAthlete(tid, "fg", name);
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
          <div>
            <p className="text-xs text-muted mb-1">Date</p>
            <input type="date" value={chartDate} onChange={(e) => setChartDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <div key={a} className="flex items-center gap-0.5">
                <button onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-l-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>
                  {scoutDisplayName(a, scoutNumbers)}
                </button>
                <button onClick={async () => { const num = window.prompt(`Jersey number for ${a}:`, scoutNumbers[a] ?? ""); if (num !== null) { const updatedNums = { ...scoutNumbers, [a]: num.replace(/\D/g, "") }; if (!num.trim()) delete updatedNums[a]; setScoutNumbers(updatedNums); const tid = getTeamId(); if (tid) await saveScoutNumbers(tid, "fg", updatedNums); } }} className="px-1.5 py-1.5 text-[10px] bg-surface-2 text-muted border border-border border-l-0 hover:text-amber-400 transition-colors font-bold">#</button>
                <button onClick={() => removeAthlete(a)} className="px-1.5 py-1.5 rounded-r-input text-[10px] bg-surface-2 text-muted border border-border border-l-0 hover:text-miss transition-colors">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" inputMode="numeric" value={newAthleteNum} onChange={(e) => setNewAthleteNum(e.target.value.replace(/\D/g, ""))} placeholder="#" className="input w-14 text-center text-sm font-bold py-1.5" />
            <input type="text" value={newAthleteName} onChange={(e) => setNewAthleteName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addAthlete(newAthleteName); }} placeholder="Type name to add..." className="input flex-1 text-sm py-1.5" />
            <button onClick={() => addAthlete(newAthleteName)} disabled={!newAthleteName.trim()} className="btn-primary px-4 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
          </div>
          {selectedPlayers.length > 0 && (
            <p className="text-xs text-muted">Order: {selectedPlayers.map((p) => scoutDisplayName(p, scoutNumbers)).join(" → ")}</p>
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
    const results = buildResults();
    const kickInfo = kicks.map((k, i) => ({ num: i + 1, distance: k.distance, hash: k.hash, pointValue: k.pointValue }));
    const ranked = selectedPlayers
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

          {/* Weather */}
          <div className="max-w-sm mx-auto">
            <input
              type="text"
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              placeholder="Weather conditions (optional)"
              className="input w-full text-sm py-1.5 text-center"
            />
          </div>

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
                  <th className="text-[10px] text-muted text-center py-1 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.name} className="border-t border-border/30">
                    <td className="py-1.5 px-2 font-semibold text-slate-200 text-left">
                      <span className="text-muted mr-1">{i + 1}.</span>{scoutDisplayName(r.name, scoutNumbers)}
                    </td>
                    {kickInfo.map((k) => {
                      const e = r.entries.find((en) => en.kickNum === k.num);
                      return (
                        <td key={k.num} className={clsx("text-center py-1.5 px-2 font-bold", e?.result === "make" ? "text-make" : "text-miss")}>
                          {e ? e.score : "—"}
                        </td>
                      );
                    })}
                    <td className="text-right py-1.5 px-2 font-black text-amber-400">{r.total}</td>
                    <td className="text-center py-1.5 px-1">
                      <button
                        onClick={() => {
                          const note = window.prompt(`Notes for ${r.name}:`, athleteNotes[r.name] ?? "");
                          if (note !== null) setAthleteNotes((prev) => ({ ...prev, [r.name]: note }));
                        }}
                        className={clsx("text-[10px] px-1.5 py-0.5 rounded transition-colors", athleteNotes[r.name] ? "text-amber-400 bg-amber-500/10 border border-amber-500/30" : "text-muted hover:text-amber-400")}
                        title={athleteNotes[r.name] || "Add notes"}
                      >
                        {athleteNotes[r.name] ? "Notes" : "+Note"}
                      </button>
                    </td>
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
            <Link href="/scout/fg?tab=rankings" className="btn-ghost flex-1 py-3 text-sm text-center">Go to Rankings</Link>
          </div>
        </main>
      </>
    );
  }

  // ── Live Charting — Grid View ──
  const activeKick = activeCell ? getKickForAthlete(activeCell.athlete, activeCell.kickIdx) : null;

  return (
    <>
      <Header title="FG Scout" />
      <main className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
        {/* Desktop: table grid */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-[10px] text-muted text-left py-1 px-1 min-w-[80px]">Athlete</th>
                {kicks.map((k, i) => (
                  <th key={i} className="text-[10px] text-muted text-center py-1 px-1 min-w-[44px]">
                    <span className="block">{k.distance}</span>
                    <span className="block text-[8px]">{k.hash}</span>
                  </th>
                ))}
                <th className="text-[10px] text-muted text-right py-1 px-1 min-w-[40px]">Score</th>
              </tr>
            </thead>
            <tbody>
              {selectedPlayers.map((athlete) => (
                <tr key={athlete} className="border-t border-border/30">
                  <td className="py-2 px-1 font-semibold text-slate-200 text-xs">{scoutDisplayName(athlete, scoutNumbers)}</td>
                  {kicks.map((_, kickIdx) => {
                    const res = resultMap[athlete]?.[kickIdx];
                    const isActive = activeCell?.athlete === athlete && activeCell?.kickIdx === kickIdx;
                    return (
                      <td key={kickIdx} className="text-center py-2 px-1">
                        <button
                          onClick={() => setActiveCell({ athlete, kickIdx })}
                          className={clsx(
                            "w-8 h-8 rounded-full border-2 transition-all mx-auto flex items-center justify-center text-[10px] font-bold",
                            isActive && "ring-2 ring-amber-400 ring-offset-1 ring-offset-bg",
                            res === "make" && "bg-make/30 border-make text-make",
                            res === "miss" && "bg-miss/30 border-miss text-miss",
                            !res && "border-border bg-surface-2 text-muted hover:border-slate-400"
                          )}
                        >
                          {res === "make" ? getKickForAthlete(athlete, kickIdx).pointValue : res === "miss" ? "0" : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-right py-2 px-1 font-black text-amber-400 text-sm">{getPlayerScore(athlete)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: wrapped grid with 5 kicks per row */}
        <div className="lg:hidden space-y-3">
          {selectedPlayers.map((athlete) => (
            <div key={athlete} className="card-2 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-200">{scoutDisplayName(athlete, scoutNumbers)}</p>
                <p className="text-sm font-black text-amber-400">{getPlayerScore(athlete)}</p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {kicks.map((k, kickIdx) => {
                  const res = resultMap[athlete]?.[kickIdx];
                  const isActive = activeCell?.athlete === athlete && activeCell?.kickIdx === kickIdx;
                  return (
                    <div key={kickIdx} className="flex flex-col items-center gap-0.5">
                      <p className="text-[8px] text-muted leading-none">{k.distance}{k.hash}</p>
                      <button
                        onClick={() => setActiveCell({ athlete, kickIdx })}
                        className={clsx(
                          "w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center text-[10px] font-bold",
                          isActive && "ring-2 ring-amber-400 ring-offset-1 ring-offset-bg",
                          res === "make" && "bg-make/30 border-make text-make",
                          res === "miss" && "bg-miss/30 border-miss text-miss",
                          !res && "border-border bg-surface-2 text-muted hover:border-slate-400"
                        )}
                      >
                        {res === "make" ? getKickForAthlete(athlete, kickIdx).pointValue : res === "miss" ? "0" : ""}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Selected cell info + actions */}
        {activeCell && activeKick && !editingKick && (
          <div className="card-2 py-3 px-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-100">{scoutDisplayName(activeCell.athlete, scoutNumbers)}</p>
              <p className="text-xs text-slate-300">{activeKick.distance}yd {activeKick.hash} — {activeKick.pointValue}pt</p>
            </div>
            <button onClick={() => startEditKick(activeCell.athlete, activeCell.kickIdx)} className="text-[10px] text-muted hover:text-amber-400 transition-colors">Change Kick</button>
          </div>
        )}

        {/* Edit kick overlay */}
        {editingKick && (
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Edit Kick for {scoutDisplayName(editingKick.athlete, scoutNumbers)}</p>
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

        {/* Make / Miss / Clear buttons */}
        {activeCell && !editingKick && (
          <div className="flex gap-3">
            <button onClick={() => handleResult("make")} className="flex-1 py-5 rounded-input text-lg font-black bg-make/20 text-make border-2 border-make/40 hover:bg-make/30 transition-all">
              MAKE
            </button>
            <button onClick={() => handleResult("miss")} className="flex-1 py-5 rounded-input text-lg font-black bg-miss/20 text-miss border-2 border-miss/40 hover:bg-miss/30 transition-all">
              MISS
            </button>
          </div>
        )}

        {/* Clear + Finish buttons */}
        <div className="flex gap-2">
          {activeCell && resultMap[activeCell.athlete]?.[activeCell.kickIdx] && (
            <button onClick={handleClearCell} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">
              Clear
            </button>
          )}
          {getResultCount() > 0 && (
            <button onClick={handleFinish} className="btn-ghost flex-1 py-2 text-xs font-bold border border-amber-500/40 text-amber-400">
              Finish Chart
            </button>
          )}
        </div>

        {/* Add extra kick — available in both preset and manual mode */}
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Add Extra Kick</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-muted text-center mb-1">Distance</p>
              <input type="text" inputMode="numeric" value={manualDist} onChange={(e) => setManualDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
            </div>
            <div>
              <p className="text-[10px] text-muted text-center mb-1">Hash</p>
              <select value={manualHash} onChange={(e) => setManualHash(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5">
                {HASH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[10px] text-muted text-center mb-1">Points</p>
              <input type="text" inputMode="numeric" value={manualPoints} onChange={(e) => setManualPoints(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
            </div>
          </div>
          <button onClick={addExtraKick} disabled={!manualDist} className="btn-primary w-full py-2 text-xs font-bold disabled:opacity-40">Add Kick</button>
        </div>
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
