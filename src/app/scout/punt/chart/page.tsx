"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTeamId } from "@/lib/teamData";
import { insertScoutSession, loadScoutAthletes, saveScoutAthletes, removeScoutAthlete, loadScoutNumbers, saveScoutNumbers, scoutDisplayName, todayDateInput, dateInputToISO } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
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
  targetDir?: string; // "L" | "M" | "R" target direction when direction mode is on
}

const DIR_OPTIONS = [
  { value: "L", label: "Left" },
  { value: "M", label: "Middle" },
  { value: "R", label: "Right" },
];

function calcAvg(scores: number[], dropWorst: boolean): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  if (!dropWorst) return parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
  const sorted = [...scores].sort((a, b) => a - b);
  const best = sorted.slice(1);
  return parseFloat((best.reduce((s, v) => s + v, 0) / best.length).toFixed(2));
}

function ScoutPuntChartInner() {
  const searchParams = useSearchParams();
  const isManual = searchParams.get("mode") === "manual";
  const [phase, setPhase] = useState<"setup" | "live" | "results">("setup");
  const [athleteNames, setAthleteNames] = useState<string[]>([]);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [scoutNumbers, setScoutNumbers] = useState<Record<string, string>>({});
  const [newAthleteNum, setNewAthleteNum] = useState("");
  const [puntsPerPlayer, setPuntsPerPlayer] = useState(isManual ? "0" : "5");
  const [directionMode, setDirectionMode] = useState(false);
  const [baseDir, setBaseDir] = useState("M");
  const [puntTypes, setPuntTypes] = useState<{ count: string; dir: string }[]>([]);
  const [dropWorst, setDropWorst] = useState(true);
  const [saved, setSaved] = useState(false);
  const [athleteNotes, setAthleteNotes] = useState<Record<string, string>>({});
  const [weather, setWeather] = useState("");
  const [chartDate, setChartDate] = useState(todayDateInput());

  const [results, setResults] = useState<PuntResult[]>([]);
  const [activePlayer, setActivePlayer] = useState("");
  const [distInput, setDistInput] = useState("");
  const [hangInput, setHangInput] = useState("");
  const [opInput, setOpInput] = useState("");
  const [dirGood, setDirGood] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editDist, setEditDist] = useState("");
  const [editHang, setEditHang] = useState("");
  const [editOp, setEditOp] = useState("");
  const [editDir, setEditDir] = useState(true);
  const [showComplete, setShowComplete] = useState(false);
  const [completeDismissed, setCompleteDismissed] = useState(false);
  const [dirOverride, setDirOverride] = useState<string | null>(null); // coach override of the target direction for the current punt

  const parseHangRaw = (raw: string): number => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return 0;
    return parseFloat(`${digits.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${digits.padStart(3, "0").slice(-2)}`);
  };

  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerScores = (name: string) => getPlayerResults(name).map((r) => r.score);
  const getPlayerAvg = (name: string) => calcAvg(getPlayerScores(name), dropWorst);

  // Flatten the configured punt types into a per-punt target-direction sequence.
  const dirSequence = (() => {
    if (!directionMode) return [] as string[];
    const seq: string[] = [];
    for (let i = 0; i < (parseInt(puntsPerPlayer) || 0); i++) seq.push(baseDir);
    for (const t of puntTypes) {
      const c = parseInt(t.count) || 0;
      for (let i = 0; i < c; i++) seq.push(t.dir);
    }
    return seq;
  })();

  const addPuntType = () => setPuntTypes((prev) => [...prev, { count: "5", dir: "M" }]);
  const updatePuntType = (i: number, field: "count" | "dir", value: string) =>
    setPuntTypes((prev) => prev.map((t, j) => j === i ? { ...t, [field]: value } : t));
  const removePuntType = (i: number) => setPuntTypes((prev) => prev.filter((_, j) => j !== i));

  // Total punts each player should take (0 = unlimited / manual).
  const kppTotal = isManual ? 0 : (directionMode ? dirSequence.length : (parseInt(puntsPerPlayer) || 0));

  // Once every selected athlete has reached the target count, prompt to keep going or submit.
  useEffect(() => {
    if (phase !== "live" || kppTotal <= 0 || selectedPlayers.length === 0) return;
    const done = selectedPlayers.every((p) => results.filter((r) => r.athlete === p).length >= kppTotal);
    if (done && !completeDismissed) setShowComplete(true);
  }, [results, kppTotal, selectedPlayers, completeDismissed, phase]);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid || !active) return;
      const [names, nums] = await Promise.all([loadScoutAthletes(tid, "punt"), loadScoutNumbers(tid, "punt")]);
      if (active) { setAthleteNames(names); setScoutNumbers(nums); }
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
    if (newAthleteNum.trim()) {
      const updatedNums = { ...scoutNumbers, [trimmed]: newAthleteNum.trim() };
      setScoutNumbers(updatedNums);
      if (tid) await saveScoutNumbers(tid, "punt", updatedNums);
    }
    setNewAthleteNum("");
  };

  const removeAthlete = async (name: string) => {
    setAthleteNames((prev) => prev.filter((n) => n !== name));
    setSelectedPlayers((prev) => prev.filter((n) => n !== name));
    const tid = getTeamId();
    if (tid) await removeScoutAthlete(tid, "punt", name);
  };

  useUnsavedWarning(results.length > 0 && !saved);

  const handleLog = () => {
    const dist = parseInt(distInput);
    const hang = parseHangRaw(hangInput);
    const op = parseHangRaw(opInput);
    if (isNaN(dist) || dist <= 0 || !hang || !activePlayer) return;
    const score = parseFloat((dist + hang * 15 + (dirGood ? 0 : -10)).toFixed(2));
    const puntIdx = getPlayerResults(activePlayer).length;
    const targetDir = directionMode ? (dirOverride ?? dirSequence[puntIdx]) : undefined;
    setResults((prev) => [...prev, { athlete: activePlayer, kickNum: puntIdx + 1, distance: dist, hangTime: hang, opTime: op, directionGood: dirGood, score, targetDir }]);
    setDistInput("");
    setHangInput("");
    setOpInput("");
    setDirGood(true);
    setDirOverride(null);
    // Auto-rotate to next player
    const idx = selectedPlayers.indexOf(activePlayer);
    const next = selectedPlayers[(idx + 1) % selectedPlayers.length];
    setActivePlayer(next);
  };

  const handleUndo = () => {
    if (results.length === 0) return;
    const last = results[results.length - 1];
    setResults((prev) => prev.slice(0, -1));
    setActivePlayer(last.athlete);
    setDirOverride(null);
  };

  const startEditResult = (idx: number) => {
    const r = results[idx];
    if (!r) return;
    setEditIdx(idx);
    setEditDist(String(r.distance));
    setEditHang(String(r.hangTime));
    setEditOp(r.opTime ? String(r.opTime) : "");
    setEditDir(r.directionGood);
  };

  const saveEditResult = () => {
    if (editIdx === null) return;
    const dist = parseInt(editDist);
    const hang = parseFloat(editHang);
    if (isNaN(dist) || dist <= 0 || isNaN(hang) || hang <= 0) return;
    const op = parseFloat(editOp) || 0;
    const score = parseFloat((dist + hang * 15 + (editDir ? 0 : -10)).toFixed(2));
    setResults((prev) => prev.map((r, i) => i === editIdx ? { ...r, distance: dist, hangTime: hang, opTime: op, directionGood: editDir, score } : r));
    setEditIdx(null);
  };

  const handleFinish = () => {
    if (results.length > 0) setPhase("results");
  };

  const handleSave = async () => {
    const tid = getTeamId();
    if (!tid || results.length === 0) return;
    const athletes = [...new Set(results.map((r) => r.athlete))];
    const label = `Punt Scout — ${athletes.map((a) => `${a}: ${getPlayerAvg(a).toFixed(2)}`).join(", ")}`;
    const entriesWithNotes = results.map((r, i) => {
      const base = { ...r, dropWorst };
      const note = athleteNotes[r.athlete];
      if (note) {
        const isFirstForAthlete = results.findIndex((x) => x.athlete === r.athlete) === i;
        if (isFirstForAthlete) return { ...base, notes: note };
      }
      return base;
    });
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_PUNT",
      label,
      date: dateInputToISO(chartDate),
      weather: weather || undefined,
      entries: entriesWithNotes as unknown as Record<string, unknown>[],
    });
    setSaved(true);
  };

  // ── Setup ──
  if (phase === "setup") {
    return (
      <>
        <Header title={isManual ? "Punt Manual Chart" : "Punt Preset Chart"} />
        <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
          <Link href="/scout/punt" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          <h2 className="text-lg font-bold text-slate-100">{isManual ? "Manual Chart Setup" : "Punt Chart Setup"}</h2>
          <p className="text-xs text-muted">Select or add punters{isManual ? "" : ", then set number of punts"}.</p>
          <div>
            <p className="text-xs text-muted mb-1">Date</p>
            <input type="date" value={chartDate} onChange={(e) => setChartDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <div key={a} className="flex items-center gap-0.5">
                <button onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-l-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{scoutDisplayName(a, scoutNumbers)}</button>
                <button onClick={async () => { const num = window.prompt(`Jersey number for ${a}:`, scoutNumbers[a] ?? ""); if (num !== null) { const updatedNums = { ...scoutNumbers, [a]: num.replace(/\D/g, "") }; if (!num.trim()) delete updatedNums[a]; setScoutNumbers(updatedNums); const tid = getTeamId(); if (tid) await saveScoutNumbers(tid, "punt", updatedNums); } }} className="px-1.5 py-1.5 text-[10px] bg-surface-2 text-muted border border-border border-l-0 hover:text-amber-400 transition-colors font-bold">#</button>
                <button onClick={() => removeAthlete(a)} className="px-1.5 py-1.5 rounded-r-input text-[10px] bg-surface-2 text-muted border border-border border-l-0 hover:text-miss transition-colors">&times;</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" inputMode="numeric" value={newAthleteNum} onChange={(e) => setNewAthleteNum(e.target.value.replace(/\D/g, ""))} placeholder="#" className="input w-14 text-center text-sm font-bold py-1.5" />
            <input type="text" value={newAthleteName} onChange={(e) => setNewAthleteName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addAthlete(newAthleteName); }} placeholder="Type name to add..." className="input flex-1 text-sm py-1.5" />
            <button onClick={() => addAthlete(newAthleteName)} disabled={!newAthleteName.trim()} className="btn-primary px-4 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
          </div>
          {selectedPlayers.length > 0 && <p className="text-xs text-muted">Order: {selectedPlayers.map((p) => scoutDisplayName(p, scoutNumbers)).join(" → ")}</p>}
          {!isManual && (
            <>
              <div className="flex items-center justify-between card-2 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Direction</p>
                  <p className="text-[10px] text-muted">Assign a target direction to each punt</p>
                </div>
                <button
                  onClick={() => setDirectionMode(!directionMode)}
                  className={clsx("w-10 h-5 rounded-full transition-colors relative", directionMode ? "bg-amber-500" : "bg-surface-2 border border-border")}
                >
                  <div className={clsx("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all", directionMode ? "left-5" : "left-0.5")} />
                </button>
              </div>
              <div>
                <p className="text-xs text-muted mb-1">Punts per player</p>
                <div className="flex gap-2 items-center">
                  <input type="text" inputMode="numeric" value={puntsPerPlayer} onChange={(e) => setPuntsPerPlayer(e.target.value.replace(/\D/g, ""))} className="input w-20 text-center text-sm font-bold py-1.5" />
                  {directionMode && (
                    <select value={baseDir} onChange={(e) => setBaseDir(e.target.value)} className="input text-sm py-1.5">
                      {DIR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {directionMode && (
                <div className="space-y-2">
                  {puntTypes.map((t, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="text" inputMode="numeric" value={t.count} onChange={(e) => updatePuntType(i, "count", e.target.value.replace(/\D/g, ""))} placeholder="# punts" className="input w-20 text-center text-sm font-bold py-1.5" />
                      <select value={t.dir} onChange={(e) => updatePuntType(i, "dir", e.target.value)} className="input text-sm py-1.5">
                        {DIR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button onClick={() => removePuntType(i)} className="px-2 py-1.5 text-xs text-muted hover:text-miss transition-colors">&times;</button>
                    </div>
                  ))}
                  <button onClick={addPuntType} className="btn-ghost w-full py-2 text-xs font-bold border border-amber-500/40 text-amber-400">+ Add Punt Type</button>
                </div>
              )}
            </>
          )}
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
            <p>Punt score = Distance + (Hang Time x 15). Bad direction = -10.</p>
            <p>Final = average of all punts{dropWorst ? ", dropping the worst one" : ""}.</p>
          </div>
          <button onClick={() => { setPhase("live"); setActivePlayer(selectedPlayers[0] ?? ""); }} disabled={selectedPlayers.length === 0 || (!isManual && (directionMode ? dirSequence.length === 0 : !parseInt(puntsPerPlayer)))} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start</button>
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
        <Header title="Punt Scout Results" />
        <main className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
          <p className="text-xs text-muted">Score = avg of all punts{dropWorst ? ", worst dropped" : ""}. Punt = Dist + (Hang x 15), bad dir = -10.</p>
          <div className="max-w-sm mx-auto">
            <input type="text" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="Weather conditions (optional)" className="input w-full text-sm py-1.5 text-center" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted text-left py-1 px-2">Name</th>
                  {Array.from({ length: maxKicks }, (_, i) => (
                    <th key={i} className="text-[10px] text-muted text-center py-1 px-2">P{i + 1}</th>
                  ))}
                  <th className="text-[10px] text-muted text-right py-1 px-2">Avg</th>
                  <th className="text-[10px] text-muted text-center py-1 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.name} className="border-t border-border/30">
                    <td className="py-1 px-2 font-semibold text-slate-200 text-left"><span className="text-muted mr-1">{i + 1}.</span>{scoutDisplayName(r.name, scoutNumbers)}</td>
                    {r.entries.map((e, j) => {
                      const isDropped = r.worst !== null && e.score === r.worst && j === r.entries.findIndex((x) => x.score === r.worst);
                      return (
                        <td key={j} className={clsx("text-center py-1 px-2", isDropped ? "opacity-40 line-through" : "", e.directionGood ? "text-make" : "text-miss")}>
                          {e.targetDir && <span className="text-[8px] block text-slate-400 font-semibold">{e.targetDir}</span>}
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
            {!saved ? <button onClick={handleSave} className="btn-primary flex-1 py-3 text-sm">Save to Rankings</button> : <span className="flex-1 py-3 text-sm text-make font-bold">Saved!</span>}
            <Link href="/scout/punt?tab=rankings" className="btn-ghost flex-1 py-3 text-sm text-center">Go to Rankings</Link>
          </div>
        </main>
      </>
    );
  }

  // ── Live ──
  const kpp = kppTotal;
  const playerKickCount = getPlayerResults(activePlayer).length;
  const currentTargetDir = directionMode ? dirSequence[playerKickCount] : undefined;
  const selectedDir = dirOverride ?? currentTargetDir ?? "M";

  return (
    <>
      <Header title="Punt Scout" />
      <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
        {/* Athlete selector — tap to switch */}
        <div className="flex flex-wrap gap-2 justify-center">
          {selectedPlayers.map((p) => {
            const count = getPlayerResults(p).length;
            const avg = getPlayerAvg(p);
            return (
              <button
                key={p}
                onClick={() => { setActivePlayer(p); setDirOverride(null); }}
                className={clsx(
                  "card-2 px-3 py-2 text-center transition-all min-w-[80px]",
                  p === activePlayer ? "ring-2 ring-amber-500" : "opacity-60 hover:opacity-100"
                )}
              >
                <p className="text-xs font-bold text-slate-200">{scoutDisplayName(p, scoutNumbers)}</p>
                <p className="text-lg font-black text-amber-400">{count > 0 ? avg.toFixed(2) : "—"}</p>
                <p className="text-[10px] text-muted">{count}{kpp > 0 ? `/${kpp}` : ""} punts</p>
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-muted text-center">
          Punt score = Dist + (Hang x 15), bad dir = -10. Final = avg{dropWorst ? ", drop worst" : ""}.
        </p>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">{scoutDisplayName(activePlayer, scoutNumbers)} — Punt {playerKickCount + 1}{kpp > 0 ? ` of ${kpp}` : ""}</p>
        </div>

        <div className="card space-y-3">
          {directionMode && (
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Direction:</p>
              <select value={selectedDir} onChange={(e) => setDirOverride(e.target.value)} className="input flex-1 text-sm font-bold py-1.5">
                {DIR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
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
          <button onClick={handleLog} disabled={!distInput || !hangInput || !activePlayer} className="btn-primary flex-1 py-2 text-sm font-bold disabled:opacity-40">Log Punt</button>
        </div>
        {results.length > 0 && (
          <button onClick={handleFinish} className="btn-ghost w-full py-2 text-xs font-bold border border-amber-500/40 text-amber-400">Finish Chart</button>
        )}

        {results.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted uppercase tracking-wider">{editMode ? "Tap a punt to edit" : "Punt Log"}</p>
              <button onClick={() => { setEditMode(!editMode); setEditIdx(null); }} className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-input border transition-all", editMode ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-border text-muted hover:text-white")}>{editMode ? "Done" : "Edit"}</button>
            </div>
            <div className="space-y-1 overflow-y-auto max-h-[200px]">
              {[...results].reverse().map((r, i) => {
                const idx = results.length - 1 - i;
                return (
                  <button
                    key={idx}
                    onClick={() => { if (editMode) startEditResult(idx); }}
                    disabled={!editMode}
                    className={clsx("w-full flex items-center text-xs gap-2 py-1 px-1 rounded transition-colors", editMode ? "hover:bg-surface-2 cursor-pointer ring-1 ring-border" : "cursor-default")}
                  >
                    <span className="text-muted w-5">#{idx + 1}</span>
                    <span className="text-slate-400 w-20 truncate text-left">{scoutDisplayName(r.athlete, scoutNumbers)}</span>
                    <span className={clsx(r.directionGood ? "text-make" : "text-miss")}>{r.distance}yd</span>
                    <span className={clsx(r.directionGood ? "text-make" : "text-miss")}>{r.hangTime.toFixed(2)}s</span>
                    <span className="text-amber-400 font-bold ml-auto">{r.score.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {editIdx !== null && results[editIdx] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditIdx(null)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-3">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Edit Punt #{editIdx + 1} — {scoutDisplayName(results[editIdx].athlete, scoutNumbers)}</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Distance</p>
                <input type="text" inputMode="numeric" value={editDist} onChange={(e) => setEditDist(e.target.value.replace(/\D/g, ""))} className="input w-full text-center text-sm font-bold py-1.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Hang Time</p>
                <input type="text" inputMode="decimal" value={editHang} onChange={(e) => setEditHang(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5" />
              </div>
              <div>
                <p className="text-[10px] text-muted text-center mb-1">Op Time</p>
                <input type="text" inputMode="decimal" value={editOp} onChange={(e) => setEditOp(e.target.value)} className="input w-full text-center text-sm font-bold py-1.5" />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted text-center mb-1">Direction</p>
              <div className="flex rounded-input border border-border overflow-hidden">
                <button onClick={() => setEditDir(true)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors", editDir ? "bg-make text-slate-900" : "text-muted hover:text-white")}>Good</button>
                <button onClick={() => setEditDir(false)} className={clsx("flex-1 py-2 text-sm font-semibold transition-colors border-l border-border", !editDir ? "bg-miss text-white" : "text-muted hover:text-white")}>Bad (-10)</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditIdx(null)} className="btn-ghost flex-1 py-2 text-xs">Cancel</button>
              <button onClick={saveEditResult} className="btn-primary flex-1 py-2 text-xs font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {showComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
            <div className="text-center">
              <p className="text-sm font-bold text-slate-100">All athletes have punted</p>
              <p className="text-[10px] text-muted">{kppTotal} punt{kppTotal !== 1 ? "s" : ""} each — average score</p>
            </div>
            <div className="space-y-1">
              {[...selectedPlayers].sort((a, b) => getPlayerAvg(b) - getPlayerAvg(a)).map((p) => (
                <div key={p} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <span className="text-slate-200 font-semibold">{scoutDisplayName(p, scoutNumbers)}</span>
                  <span className="text-amber-400 font-black">{getPlayerAvg(p).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowComplete(false); setCompleteDismissed(true); }} className="btn-ghost flex-1 py-2.5 text-xs font-bold border border-border">Keep Punting</button>
              <button onClick={() => { setShowComplete(false); setPhase("results"); }} className="btn-primary flex-1 py-2.5 text-xs font-bold">Submit to Rankings</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ScoutPuntChartPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading...</div>}>
      <ScoutPuntChartInner />
    </Suspense>
  );
}
