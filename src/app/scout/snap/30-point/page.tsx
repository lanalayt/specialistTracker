"use client";

import { useState, useEffect } from "react";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { getTeamId } from "@/lib/teamData";
import { insertScoutSession, loadScoutAthletes, saveScoutAthletes, loadScoutNumbers, saveScoutNumbers, scoutDisplayName, todayDateInput, dateInputToISO } from "@/lib/scoutStore";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { Header } from "@/components/layout/Header";
import Link from "next/link";
import clsx from "clsx";

const PTS_PER_SNAP = 3;

interface SnapResult {
  athlete: string;
  accuracy: "Strike" | "Ball";
  laces: "Good" | "1/4 Turn" | "Back" | "";
  spiral: "Good" | "Bad" | "";
  points: number;
  marker?: ShortSnapMarker;
}

function calcPoints(acc: string, laces: string, spiral: string): number {
  let pts = 0;
  if (acc === "Strike") pts += 1;
  if (laces === "Good") pts += 1;
  else if (laces === "1/4 Turn") pts += 0.5;
  if (spiral === "Good") pts += 1;
  return pts;
}

function calcAvg(scores: number[], dropWorst: boolean): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  if (!dropWorst) return parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
  const sorted = [...scores].sort((a, b) => a - b);
  const best = sorted.slice(1);
  return parseFloat((best.reduce((s, v) => s + v, 0) / best.length).toFixed(2));
}

export default function ScoutShortSnapsPage() {
  const [phase, setPhase] = useState<"setup" | "live" | "results">("setup");
  const [athleteNames, setAthleteNames] = useState<string[]>([]);
  const [newAthleteName, setNewAthleteName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [scoutNumbers, setScoutNumbers] = useState<Record<string, string>>({});
  const [newAthleteNum, setNewAthleteNum] = useState("");
  const [snapsPerPlayer, setSnapsPerPlayer] = useState("10");
  const [dropWorst, setDropWorst] = useState(false);
  const [saved, setSaved] = useState(false);
  const [athleteNotes, setAthleteNotes] = useState<Record<string, string>>({});
  const [weather, setWeather] = useState("");
  const [chartDate, setChartDate] = useState(todayDateInput());

  const [results, setResults] = useState<SnapResult[]>([]);
  const [activePlayer, setActivePlayer] = useState("");
  const [accuracy, setAccuracy] = useState<"Strike" | "Ball" | "">("");
  const [pendingMarker, setPendingMarker] = useState<ShortSnapMarker | null>(null);
  const [laces, setLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [spiral, setSpiral] = useState<"Good" | "Bad" | "">("");

  const spp = parseInt(snapsPerPlayer) || 0;
  const totalSnaps = selectedPlayers.length * spp;

  const getPlayerResults = (name: string) => results.filter((r) => r.athlete === name);
  const getPlayerMarkers = (name: string) => results.filter((r) => r.athlete === name && r.marker).map((r, i) => ({ ...r.marker!, num: i + 1 }));
  const getPlayerPoints = (name: string) => getPlayerResults(name).reduce((s, r) => s + r.points, 0);
  const getPlayerAvg = (name: string) => calcAvg(getPlayerResults(name).map((r) => r.points), dropWorst);

  useUnsavedWarning(results.length > 0 && !saved);

  useEffect(() => {
    let active = true;
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid || !active) return;
      const [names, nums] = await Promise.all([loadScoutAthletes(tid, "snap"), loadScoutNumbers(tid, "snap")]);
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
    if (tid) await saveScoutAthletes(tid, "snap", updated);
    if (newAthleteNum.trim()) {
      const updatedNums = { ...scoutNumbers, [trimmed]: newAthleteNum.trim() };
      setScoutNumbers(updatedNums);
      if (tid) await saveScoutNumbers(tid, "snap", updatedNums);
    }
    setNewAthleteNum("");
  };

  const removeAthlete = async (name: string) => {
    const updated = athleteNames.filter((n) => n !== name);
    setAthleteNames(updated);
    setSelectedPlayers((prev) => prev.filter((n) => n !== name));
    const tid = getTeamId();
    if (tid) await saveScoutAthletes(tid, "snap", updated);
  };

  const handleSnapClick = (marker: ShortSnapMarker) => {
    if (accuracy) return;
    setAccuracy(marker.inZone ? "Strike" : "Ball");
    setPendingMarker(marker);
  };

  const handleLogSnap = () => {
    if (!accuracy || !laces || !spiral || !pendingMarker || !activePlayer) return;
    const points = calcPoints(accuracy, laces, spiral);
    setResults((prev) => [...prev, { athlete: activePlayer, accuracy, laces, spiral, points, marker: pendingMarker }]);
    setAccuracy(""); setLaces(""); setSpiral(""); setPendingMarker(null);
    // Auto-rotate
    const idx = selectedPlayers.indexOf(activePlayer);
    setActivePlayer(selectedPlayers[(idx + 1) % selectedPlayers.length]);
    if (results.length + 1 >= totalSnaps) setPhase("results");
  };

  const handleUndo = () => {
    if (pendingMarker) { setPendingMarker(null); setAccuracy(""); return; }
    if (results.length === 0) return;
    const last = results[results.length - 1];
    setResults((prev) => prev.slice(0, -1));
    setActivePlayer(last.athlete);
    if (phase === "results") setPhase("live");
    setAccuracy(""); setLaces(""); setSpiral(""); setPendingMarker(null);
  };

  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editLaces, setEditLaces] = useState<"Good" | "1/4 Turn" | "Back" | "">("");
  const [editSpiral, setEditSpiral] = useState<"Good" | "Bad" | "">("");
  const [editAccuracy, setEditAccuracy] = useState<"Strike" | "Ball" | "">("");

  const startEdit = (idx: number) => {
    const r = results[idx];
    setEditIdx(idx);
    setEditAccuracy(r.accuracy);
    setEditLaces(r.laces);
    setEditSpiral(r.spiral);
  };

  const saveEdit = () => {
    if (editIdx === null || !editAccuracy || !editLaces || !editSpiral) return;
    const pts = calcPoints(editAccuracy, editLaces, editSpiral);
    setResults((prev) => prev.map((r, i) => i === editIdx ? { ...r, accuracy: editAccuracy, laces: editLaces, spiral: editSpiral, points: pts } : r));
    setEditIdx(null);
  };

  const handleFinish = () => {
    if (results.length > 0) setPhase("results");
  };

  const handleSave = async () => {
    if (results.length === 0) return;
    const tid = getTeamId();
    if (!tid) return;
    const entries = results.map((r) => ({
      athlete: r.athlete, accuracy: r.accuracy, laces: r.laces, spiral: r.spiral, points: r.points,
      markerX: r.marker?.x, markerY: r.marker?.y, markerInZone: r.marker?.inZone, dropWorst,
    }));
    const entriesWithNotes = entries.map((r, i) => {
      const note = athleteNotes[r.athlete];
      if (note) {
        const isFirstForAthlete = entries.findIndex((x) => x.athlete === r.athlete) === i;
        if (isFirstForAthlete) return { ...r, notes: note };
      }
      return r;
    });
    const allAthletes = [...new Set(results.map((r) => r.athlete))];
    const label = `Short Snaps — ${allAthletes.map((a) => `${a}: ${getPlayerAvg(a).toFixed(2)} avg`).join(", ")}`;
    await insertScoutSession(tid, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sport: "SCOUT_SNAP",
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
        <Header title="Short Snaps" />
        <main className="p-4 lg:p-6 max-w-lg mx-auto space-y-4">
          <Link href="/scout/snap" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
          <h2 className="text-lg font-bold text-slate-100">Short Snap Setup</h2>
          <p className="text-xs text-muted">Select or add snappers, then set number of snaps.</p>
          <div>
            <p className="text-xs text-muted mb-1">Date</p>
            <input type="date" value={chartDate} onChange={(e) => setChartDate(e.target.value)} className="input w-full max-w-[200px] text-sm py-1.5" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {athleteNames.map((a) => (
              <div key={a} className="flex items-center gap-0.5">
                <button onClick={() => togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-l-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-amber-500 text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{scoutDisplayName(a, scoutNumbers)}</button>
                <button onClick={async () => { const num = window.prompt(`Jersey number for ${a}:`, scoutNumbers[a] ?? ""); if (num !== null) { const updatedNums = { ...scoutNumbers, [a]: num.replace(/\D/g, "") }; if (!num.trim()) delete updatedNums[a]; setScoutNumbers(updatedNums); const tid = getTeamId(); if (tid) await saveScoutNumbers(tid, "snap", updatedNums); } }} className="px-1.5 py-1.5 text-[10px] bg-surface-2 text-muted border border-border border-l-0 hover:text-amber-400 transition-colors font-bold">#</button>
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
          <div>
            <p className="text-xs text-muted mb-1">Snaps per player</p>
            <input type="text" inputMode="numeric" value={snapsPerPlayer} onChange={(e) => setSnapsPerPlayer(e.target.value.replace(/\D/g, ""))} className="input w-20 text-center text-sm font-bold py-1.5" />
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
            <p>Each snap scores up to 3 points: Strike (1) + Laces (1 or 0.5) + Spiral (1). Open spiral = 0 for spiral.</p>
            <p>Final = average per snap{dropWorst ? ", dropping the worst one" : ""}.</p>
          </div>
          <button onClick={() => { setPhase("live"); setActivePlayer(selectedPlayers[0] ?? ""); }} disabled={selectedPlayers.length === 0 || !spp} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40">Start</button>
        </main>
      </>
    );
  }

  // ── Results ──
  if (phase === "results") {
    const allAthletes = [...new Set(results.map((r) => r.athlete))];
    const ranked = allAthletes
      .map((name) => {
        const pr = getPlayerResults(name);
        const scores = pr.map((r) => r.points);
        const worst = dropWorst && scores.length > 1 ? Math.min(...scores) : null;
        return { name, entries: pr, avg: getPlayerAvg(name), total: getPlayerPoints(name), worst, markers: getPlayerMarkers(name) };
      })
      .sort((a, b) => b.avg - a.avg);

    return (
      <>
        <Header title="Short Snap Results" />
        <main className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-6 text-center">
            <h2 className="text-2xl font-extrabold text-slate-100">Results</h2>
            <p className="text-xs text-muted">Avg per snap{dropWorst ? ", worst dropped" : ""}. Max 3 pts/snap: Strike (1) + Laces (1/0.5) + Spiral (1).</p>
            <div className="max-w-sm mx-auto">
              <input type="text" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="Weather conditions (optional)" className="input w-full text-sm py-1.5 text-center" />
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(ranked.length, 3)}, minmax(0, 1fr))` }}>
              {ranked.map((r) => (
                <div key={r.name} className="space-y-3">
                  <p className="text-sm font-bold text-slate-200">{scoutDisplayName(r.name, scoutNumbers)}</p>
                  <HolderStrikeZone markers={r.markers} />
                  <div className="card-2 py-3">
                    <p className="text-3xl font-black text-amber-400">{r.avg.toFixed(2)}</p>
                    <p className="text-xs text-muted">avg / {PTS_PER_SNAP} ({r.total} total)</p>
                  </div>
                  <button
                    onClick={() => {
                      const note = window.prompt(`Notes for ${r.name}:`, athleteNotes[r.name] ?? "");
                      if (note !== null) setAthleteNotes((prev) => ({ ...prev, [r.name]: note }));
                    }}
                    className={clsx("text-[10px] px-1.5 py-0.5 rounded transition-colors mx-auto", athleteNotes[r.name] ? "text-amber-400 bg-amber-500/10 border border-amber-500/30" : "text-muted hover:text-amber-400")}
                    title={athleteNotes[r.name] || "Add notes"}
                  >
                    {athleteNotes[r.name] ? "Notes" : "+Note"}
                  </button>
                  <div className="card-2 text-left text-xs max-h-[200px] overflow-y-auto">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Loc</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Laces</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                        <th className="text-[10px] text-muted text-right py-1 px-1">Pts</th>
                      </tr></thead>
                      <tbody>
                        {r.entries.map((e, j) => {
                          const isDropped = r.worst !== null && e.points === r.worst && j === r.entries.findIndex((x) => x.points === r.worst);
                          return (
                            <tr key={j} className={clsx("border-t border-border/30", isDropped && "opacity-40 line-through")}>
                              <td className="text-muted py-1 px-1">{j + 1}</td>
                              <td className={clsx("text-center py-1 px-1 font-semibold", e.accuracy === "Strike" ? "text-make" : "text-miss")}>{e.accuracy}</td>
                              <td className={clsx("text-center py-1 px-1", e.laces === "Good" ? "text-make" : e.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{e.laces === "Good" ? "Perfect" : e.laces}</td>
                              <td className={clsx("text-center py-1 px-1", e.spiral === "Good" ? "text-make" : "text-miss")}>{e.spiral === "Good" ? "Tight" : "Open"}</td>
                              <td className="text-right py-1 px-1 font-bold text-amber-400">{e.points}</td>
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
              <Link href="/scout/snap?tab=rankings" className="btn-ghost flex-1 py-3 text-sm text-center">Go to Rankings</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ── Live ──
  const playerSnapCount = getPlayerResults(activePlayer).length;

  return (
    <>
      <Header title="Short Snaps" />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Athlete selector */}
          <div className="flex flex-wrap gap-2 justify-center">
            {selectedPlayers.map((p) => {
              const count = getPlayerResults(p).length;
              return (
                <button key={p} onClick={() => setActivePlayer(p)} className={clsx("card-2 px-3 py-2 text-center transition-all min-w-[80px]", p === activePlayer ? "ring-2 ring-amber-500" : "opacity-60 hover:opacity-100")}>
                  <p className="text-xs font-bold text-slate-200">{scoutDisplayName(p, scoutNumbers)}</p>
                  <p className="text-lg font-black text-amber-400">{count > 0 ? `${getPlayerPoints(p)}/${count * PTS_PER_SNAP}` : "—"}</p>
                  <p className="text-[10px] text-muted">{count}/{spp} snaps</p>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-muted text-center">Strike (1) + Laces (1/0.5) + Spiral (1) = 3 max. Avg{dropWorst ? ", drop worst" : ""}.</p>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{scoutDisplayName(activePlayer, scoutNumbers)} — Snap {playerSnapCount + 1} of {spp}</p>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <div className="flex flex-col gap-1 sm:gap-1.5 shrink-0">
              <p className="text-[8px] sm:text-[10px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Laces</p>
              <button onClick={() => setLaces("Good")} className={clsx("px-2 sm:px-3 py-2 sm:py-2.5 rounded-input text-[10px] sm:text-xs font-bold border transition-all", laces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
              <button onClick={() => setLaces("1/4 Turn")} className={clsx("px-2 sm:px-3 py-2 sm:py-2.5 rounded-input text-[10px] sm:text-xs font-bold border transition-all", laces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4</button>
              <button onClick={() => setLaces("Back")} className={clsx("px-2 sm:px-3 py-2 sm:py-2.5 rounded-input text-[10px] sm:text-xs font-bold border transition-all", laces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
            </div>
            <div className="flex-1 min-w-0">
              <HolderStrikeZone markers={[...getPlayerMarkers(activePlayer), ...(pendingMarker ? [{ ...pendingMarker, num: playerSnapCount + 1 }] : [])]} onSnap={handleSnapClick} nextNum={playerSnapCount + 1} chartMode="simple" missMode="simple" editable />
            </div>
            <div className="flex flex-col gap-1 sm:gap-1.5 shrink-0">
              <p className="text-[8px] sm:text-[10px] font-semibold text-muted uppercase tracking-wider text-center mb-0.5">Spiral</p>
              <button onClick={() => setSpiral("Good")} className={clsx("px-2 sm:px-3 py-2 sm:py-2.5 rounded-input text-[10px] sm:text-xs font-bold border transition-all", spiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
              <button onClick={() => setSpiral("Bad")} className={clsx("px-2 sm:px-3 py-2 sm:py-2.5 rounded-input text-[10px] sm:text-xs font-bold border transition-all", spiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
            </div>
          </div>

          {accuracy && <div className="text-center"><span className={clsx("text-sm font-bold", accuracy === "Strike" ? "text-make" : "text-miss")}>{accuracy}</span></div>}

          <div className="flex gap-2">
            {(results.length > 0 || pendingMarker) && <button onClick={handleUndo} className="text-xs px-3 py-3 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
            <button onClick={handleLogSnap} disabled={!accuracy || !laces || !spiral} className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40">
              Log Snap {accuracy && laces && spiral ? `(${calcPoints(accuracy, laces, spiral)} pts)` : ""}
            </button>
          </div>
          {results.length > 0 && (
            <button onClick={handleFinish} className="btn-ghost w-full py-2 text-xs font-bold border border-amber-500/40 text-amber-400">Finish</button>
          )}

          {/* Editable snap log */}
          {results.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[200px]">
              {[...results].reverse().map((r, ri) => {
                const idx = results.length - 1 - ri;
                const isEditing = editIdx === idx;
                return (
                  <div key={idx}>
                    <button onClick={() => isEditing ? setEditIdx(null) : startEdit(idx)} className="w-full flex items-center text-xs gap-2 py-1 hover:bg-surface-2 rounded transition-colors px-1">
                      <span className="text-muted w-5">#{idx + 1}</span>
                      <span className="text-slate-400 w-16 truncate">{scoutDisplayName(r.athlete, scoutNumbers)}</span>
                      <span className={clsx("font-semibold", r.accuracy === "Strike" ? "text-make" : "text-miss")}>{r.accuracy}</span>
                      <span className={clsx(r.laces === "Good" ? "text-make" : r.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{r.laces === "Good" ? "Perf" : r.laces}</span>
                      <span className={clsx(r.spiral === "Good" ? "text-make" : "text-miss")}>{r.spiral === "Good" ? "Tight" : "Open"}</span>
                      <span className="text-amber-400 font-bold ml-auto">{r.points}pt</span>
                    </button>
                    {isEditing && (
                      <div className="card space-y-2 mt-1 mb-2">
                        <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Edit Snap #{idx + 1} — {scoutDisplayName(r.athlete, scoutNumbers)}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-[8px] text-muted text-center mb-1">Location</p>
                            <button onClick={() => setEditAccuracy("Strike")} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all", editAccuracy === "Strike" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Strike</button>
                            <button onClick={() => setEditAccuracy("Ball")} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editAccuracy === "Ball" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Ball</button>
                          </div>
                          <div>
                            <p className="text-[8px] text-muted text-center mb-1">Laces</p>
                            <button onClick={() => setEditLaces("Good")} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all", editLaces === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Perfect</button>
                            <button onClick={() => setEditLaces("1/4 Turn")} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editLaces === "1/4 Turn" ? "bg-warn/20 text-warn border-warn/50" : "bg-surface-2 text-muted border-border")}>1/4</button>
                            <button onClick={() => setEditLaces("Back")} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editLaces === "Back" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Back</button>
                          </div>
                          <div>
                            <p className="text-[8px] text-muted text-center mb-1">Spiral</p>
                            <button onClick={() => setEditSpiral("Good")} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all", editSpiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                            <button onClick={() => setEditSpiral("Bad")} className={clsx("w-full py-1.5 rounded-input text-[10px] font-bold border transition-all mt-1", editSpiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
                          </div>
                        </div>
                        <button onClick={saveEdit} className="btn-primary w-full py-2 text-xs font-bold">Save</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
