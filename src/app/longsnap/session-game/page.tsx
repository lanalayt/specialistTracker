"use client";

import { useState, useEffect, useCallback } from "react";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { makePct, getSnapBenchmark } from "@/lib/stats";
import type { LongSnapEntry, SnapAccuracy, SnapType } from "@/types";
import clsx from "clsx";
import { teamSet, teamGet, getTeamId } from "@/lib/teamData";

const INIT_ROWS = 12;

interface PuntLogRow { athlete: string; time: string; accuracy: string; critical?: boolean }
interface FGLogRow { athlete: string; accuracy: string; laces: string; spiral: string; critical?: boolean }

const emptyPuntRow = (): PuntLogRow => ({ athlete: "", time: "", accuracy: "", critical: false });
const emptyFGRow = (): FGLogRow => ({ athlete: "", accuracy: "", laces: "", spiral: "", critical: false });

export default function LongSnapGameSessionPage() {
  const { athletes, commitPractice } = useLongSnap();
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;
  const athleteNames = athletes.map((a) => a.name);

  const [opponent, setOpponent] = useState("");
  const [gameTime, setGameTime] = useState("");
  const [weather, setWeather] = useState("");
  const [committed, setCommitted] = useState(false);

  // Punt snap rows
  const [puntRows, setPuntRows] = useState<PuntLogRow[]>(Array.from({ length: INIT_ROWS }, emptyPuntRow));
  const [puntMarkers, setPuntMarkers] = useState<SnapMarker[]>([]);

  // FG snap rows
  const [fgRows, setFGRows] = useState<FGLogRow[]>(Array.from({ length: INIT_ROWS }, emptyFGRow));
  const [fgMarkers, setFGMarkers] = useState<ShortSnapMarker[]>([]);

  const [chartMode, setChartMode] = useState<"simple" | "detailed">("simple");
  const [missMode, setMissMode] = useState<"simple" | "detailed">("simple");

  // Load settings
  useEffect(() => {
    try {
      const r = localStorage.getItem("snapSettings");
      if (r) { const p = JSON.parse(r); setChartMode(p.chartMode === "detailed" ? "detailed" : "simple"); setMissMode(p.missMode === "detailed" ? "detailed" : "simple"); }
    } catch {}
  }, []);

  // Draft keys
  const draftKey = (type: "punt" | "fg") => {
    const tid = getTeamId();
    return tid ? `longsnap_game_draft_${type}_${tid}` : `longsnap_game_draft_${type}`;
  };

  // Load drafts (from snap overlay saves + local)
  useEffect(() => {
    // Punt draft
    try {
      const raw = localStorage.getItem(draftKey("punt"));
      if (raw) { const d = JSON.parse(raw); if (d.rows?.length) setPuntRows(d.rows); if (d.snapMarkers?.length) setPuntMarkers(d.snapMarkers); }
    } catch {}
    // FG draft
    try {
      const raw = localStorage.getItem(draftKey("fg"));
      if (raw) { const d = JSON.parse(raw); if (d.rows?.length) setFGRows(d.rows); if (d.snapMarkers?.length) setFGMarkers(d.snapMarkers); }
    } catch {}
    // Load opponent/weather
    try {
      const raw = localStorage.getItem("longsnap_game_meta");
      if (raw) { const d = JSON.parse(raw); if (d.opponent) setOpponent(d.opponent); if (d.gameTime) setGameTime(d.gameTime); if (d.weather) setWeather(d.weather); }
    } catch {}
  }, []);

  // Auto-save
  useEffect(() => {
    try { localStorage.setItem(draftKey("punt"), JSON.stringify({ rows: puntRows, snapMarkers: puntMarkers })); } catch {}
  }, [puntRows, puntMarkers]);
  useEffect(() => {
    try { localStorage.setItem(draftKey("fg"), JSON.stringify({ rows: fgRows, snapMarkers: fgMarkers })); } catch {}
  }, [fgRows, fgMarkers]);
  useEffect(() => {
    try { localStorage.setItem("longsnap_game_meta", JSON.stringify({ opponent, gameTime, weather })); } catch {}
  }, [opponent, gameTime, weather]);

  const formatAutoDecimal = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const padded = digits.padStart(3, "0");
    const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
    return `${whole}.${padded.slice(-2)}`;
  };

  const updatePuntRow = (idx: number, field: keyof PuntLogRow, value: string | boolean) => {
    setPuntRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const updateFGRow = (idx: number, field: keyof FGLogRow, value: string | boolean) => {
    setFGRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addPuntRow = () => setPuntRows((prev) => [...prev, emptyPuntRow()]);
  const addFGRow = () => setFGRows((prev) => [...prev, emptyFGRow()]);

  const filledPunt = puntRows.filter((r) => r.athlete && (r.time || r.accuracy));
  const filledFG = fgRows.filter((r) => r.athlete && (r.accuracy || r.laces || r.spiral));

  // Punt snap click
  const CELL_ARROWS: Record<string, string> = { TL: "✓↖", TC: "✓↑", TR: "✓↗", ML: "✓←", MC: "✓", MR: "✓→", BL: "✓↙", BC: "✓↓", BR: "✓↘" };
  const MISS_ARROWS: Record<string, string> = { HIGH_L: "✗↖", HIGH: "✗↑", HIGH_R: "✗↗", LEFT: "✗←", RIGHT: "✗→", LOW_L: "✗↙", LOW: "✗↓", LOW_R: "✗↘" };

  const nextPuntNum = (() => { const idx = puntRows.findIndex((r) => !r.accuracy); return idx >= 0 ? idx + 1 : puntRows.length + 1; })();
  const nextFGNum = (() => { const idx = fgRows.findIndex((r) => !r.accuracy); return idx >= 0 ? idx + 1 : fgRows.length + 1; })();

  const handlePuntSnapClick = (marker: SnapMarker) => {
    const rowIdx = marker.num - 1;
    if (rowIdx < puntRows.length) {
      let acc: string;
      if (marker.inZone) { acc = chartMode === "detailed" && marker.zoneCell ? (CELL_ARROWS[marker.zoneCell] ?? "Strike") : "Strike"; }
      else { acc = missMode === "detailed" && marker.missCell ? (MISS_ARROWS[marker.missCell] ?? "Ball") : "Ball"; }
      setPuntRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, accuracy: acc } : r));
    }
    setPuntMarkers((prev) => [...prev, marker]);
  };

  const handleFGSnapClick = (marker: ShortSnapMarker) => {
    const rowIdx = marker.num - 1;
    if (rowIdx < fgRows.length) {
      const acc = marker.inZone ? "Strike" : "Ball";
      setFGRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, accuracy: acc } : r));
    }
    setFGMarkers((prev) => [...prev, marker]);
  };

  const handleCommit = () => {
    const allSnaps: LongSnapEntry[] = [];

    filledPunt.forEach((r) => {
      const time = parseFloat(r.time) || 0;
      const accuracy: SnapAccuracy = r.accuracy === "Strike" || r.accuracy.startsWith("✓") ? "ON_TARGET" : "HIGH";
      allSnaps.push({
        athleteId: r.athlete, athlete: r.athlete, snapType: "PUNT" as SnapType,
        time, accuracy, score: 0, benchmark: getSnapBenchmark("PUNT", time), critical: !!r.critical,
      });
    });

    filledFG.forEach((r) => {
      const accuracy: SnapAccuracy = r.accuracy === "Strike" || r.accuracy.startsWith("✓") ? "ON_TARGET" : "HIGH";
      allSnaps.push({
        athleteId: r.athlete, athlete: r.athlete, snapType: "FG" as SnapType,
        time: 0, accuracy, score: 0, critical: !!r.critical,
        laces: r.laces || undefined, spiral: r.spiral || undefined,
      });
    });

    if (allSnaps.length === 0) return;

    const label = opponent ? `vs ${opponent}` : new Date().toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
    commitPractice(allSnaps, label, weather, "game", opponent, gameTime);
    setCommitted(true);
  };

  const handleNewSession = () => {
    setPuntRows(Array.from({ length: INIT_ROWS }, emptyPuntRow));
    setFGRows(Array.from({ length: INIT_ROWS }, emptyFGRow));
    setPuntMarkers([]); setFGMarkers([]);
    setOpponent(""); setGameTime(""); setWeather("");
    setCommitted(false);
    try { localStorage.removeItem(draftKey("punt")); localStorage.removeItem(draftKey("fg")); localStorage.removeItem("longsnap_game_meta"); } catch {}
  };

  if (committed) {
    return (
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-4xl">
        <div className="space-y-4 text-center">
          <p className="text-xs font-semibold text-make uppercase tracking-wider">Game Committed</p>
          {opponent && <p className="text-lg font-black text-red-400">vs {opponent}</p>}
          <p className="text-sm text-muted">{filledPunt.length} punt snaps · {filledFG.length} FG snaps</p>
          <button onClick={handleNewSession} className="btn-primary py-3 px-8 text-sm">← Back to Log</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-5xl space-y-6">
      {/* Game header */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-card p-4 space-y-3">
        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest text-center">Game Mode</p>
        <div className="grid grid-cols-3 gap-2">
          <input type="text" placeholder="Opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} className="input text-sm py-1.5 text-center" />
          <input type="text" placeholder="Game Time" value={gameTime} onChange={(e) => setGameTime(e.target.value)} className="input text-sm py-1.5 text-center" />
          <input type="text" placeholder="Weather" value={weather} onChange={(e) => setWeather(e.target.value)} className="input text-sm py-1.5 text-center" />
        </div>
      </div>

      {/* ═══ PUNT SNAPS (TOP) ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-accent uppercase tracking-wider">Punt Snaps</p>
          <span className="text-[10px] text-muted">{filledPunt.length} entered</span>
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Table */}
          <div className="lg:w-[60%] card-2 overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border">#</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center border-b border-border">Athlete</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Time</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Acc</th>
                </tr>
              </thead>
              <tbody>
                {puntRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/30">
                    <td className="text-center text-muted py-1 px-1">{idx + 1}</td>
                    <td className="py-1 px-1">
                      <select value={row.athlete} onChange={(e) => updatePuntRow(idx, "athlete", e.target.value)} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60">
                        <option value="">—</option>
                        {athleteNames.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <input type="text" inputMode="numeric" value={row.time} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); updatePuntRow(idx, "time", d ? formatAutoDecimal(d) : ""); }} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60" />
                    </td>
                    <td className="py-1 px-1 text-center">
                      {row.accuracy.startsWith("✓") || row.accuracy.startsWith("✗") ? (
                        <span className={clsx("text-xs font-bold", row.accuracy.startsWith("✗") ? "text-miss" : "text-make")}>{row.accuracy}</span>
                      ) : (
                        <select value={row.accuracy} onChange={(e) => updatePuntRow(idx, "accuracy", e.target.value)} className={clsx("w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs font-bold focus:outline-none focus:border-accent/60", row.accuracy === "Strike" ? "text-make" : row.accuracy === "Ball" ? "text-miss" : "text-slate-200")}>
                          <option value="">—</option>
                          <option value="Ball">Ball</option>
                          <option value="Strike">Strike</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addPuntRow} className="w-full text-xs text-muted hover:text-accent py-1.5 border-t border-border/30">+ Add Row</button>
          </div>
          {/* Strike zone */}
          <div className="lg:w-[40%] space-y-2">
            <PunterStrikeZone markers={puntMarkers} onSnap={handlePuntSnapClick} nextNum={nextPuntNum} chartMode={chartMode} missMode={missMode} editable />
            {puntMarkers.length > 0 && (
              <button onClick={() => { const last = puntMarkers[puntMarkers.length - 1]; const ri = last.num - 1; if (ri < puntRows.length) setPuntRows((p) => p.map((r, i) => i === ri ? { ...r, accuracy: "" } : r)); setPuntMarkers((p) => p.slice(0, -1)); }} className="w-full text-xs py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">
                Undo Snap #{puntMarkers.length}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ FG SNAPS (BOTTOM) ═══ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-accent uppercase tracking-wider">FG / Short Snaps</p>
          <span className="text-[10px] text-muted">{filledFG.length} entered</span>
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Table */}
          <div className="lg:w-[60%] card-2 overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border">#</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center border-b border-border">Athlete</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Acc</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Laces</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-10 border-b border-border">Spiral</th>
                </tr>
              </thead>
              <tbody>
                {fgRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/30">
                    <td className="text-center text-muted py-1 px-1">{idx + 1}</td>
                    <td className="py-1 px-1">
                      <select value={row.athlete} onChange={(e) => updateFGRow(idx, "athlete", e.target.value)} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60">
                        <option value="">—</option>
                        {athleteNames.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="py-1 px-1 text-center">
                      <select value={row.accuracy} onChange={(e) => updateFGRow(idx, "accuracy", e.target.value)} className={clsx("w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs font-bold focus:outline-none focus:border-accent/60", row.accuracy === "Strike" ? "text-make" : row.accuracy === "Ball" ? "text-miss" : "text-slate-200")}>
                        <option value="">—</option>
                        <option value="Ball">Ball</option>
                        <option value="Strike">Strike</option>
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <select value={row.laces} onChange={(e) => updateFGRow(idx, "laces", e.target.value)} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60">
                        <option value="">—</option>
                        <option value="Good">Good</option>
                        <option value="1/4 Out">1/4 Out</option>
                        <option value="1/4 In">1/4 In</option>
                        <option value="Back">Back</option>
                      </select>
                    </td>
                    <td className="py-1 px-1 text-center">
                      <input type="checkbox" checked={row.spiral === "Good"} onChange={(e) => updateFGRow(idx, "spiral", e.target.checked ? "Good" : "")} className="w-4 h-4 accent-accent cursor-pointer" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addFGRow} className="w-full text-xs text-muted hover:text-accent py-1.5 border-t border-border/30">+ Add Row</button>
          </div>
          {/* Strike zone */}
          <div className="lg:w-[40%] space-y-2">
            <HolderStrikeZone markers={fgMarkers} onSnap={handleFGSnapClick} nextNum={nextFGNum} editable />
            {fgMarkers.length > 0 && (
              <button onClick={() => { const last = fgMarkers[fgMarkers.length - 1]; const ri = last.num - 1; if (ri < fgRows.length) setFGRows((p) => p.map((r, i) => i === ri ? { ...r, accuracy: "" } : r)); setFGMarkers((p) => p.slice(0, -1)); }} className="w-full text-xs py-1.5 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">
                Undo Snap #{fgMarkers.length}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <span className="text-xs text-muted flex-1">{filledPunt.length + filledFG.length} total snaps</span>
        {!viewOnly && (
          <>
            {(filledPunt.length > 0 || filledFG.length > 0) && (
              <button onClick={handleNewSession} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-miss hover:border-miss/50 font-semibold transition-all">Clear All</button>
            )}
            <button onClick={handleCommit} disabled={filledPunt.length === 0 && filledFG.length === 0} className="btn-primary text-xs py-2 px-5 disabled:opacity-40">
              Commit Game{(filledPunt.length + filledFG.length) > 0 ? ` (${filledPunt.length + filledFG.length})` : ""}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
