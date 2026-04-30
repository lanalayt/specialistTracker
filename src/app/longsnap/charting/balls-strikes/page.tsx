"use client";

import { useState, useEffect } from "react";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import Link from "next/link";
import type { LongSnapEntry, SnapAccuracy, SnapType } from "@/types";
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

export default function BallsStrikesPage() {
  const { athletes, commitPractice } = useLongSnap();
  const athleteNames = athletes.map((a) => a.name);

  const [mode, setMode] = useState<"single" | "multi" | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [maxTime, setMaxTime] = useState("0.75");
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);

  const [markers, setMarkers] = useState<SnapMarker[]>([]);
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

  const togglePlayer = (name: string) => {
    setSelectedPlayers((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const formatAutoDecimal = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const padded = digits.padStart(3, "0");
    const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
    return `${whole}.${padded.slice(-2)}`;
  };

  const handleSnapClick = (marker: SnapMarker) => {
    setPendingMarker(marker);
    setPromptTime("");
    setPromptSpiral("");
  };

  const handleConfirmSnap = () => {
    if (!pendingMarker || !promptSpiral) return;
    const timeVal = parseFloat(promptTime) || 0;
    const overTime = maxTimeNum > 0 && timeVal > maxTimeNum;
    const badSpiral = promptSpiral === "Bad";
    const acc: "Strike" | "Ball" = overTime || badSpiral ? "Ball" : pendingMarker.inZone ? "Strike" : "Ball";
    const autoReason = overTime ? "time" as const : badSpiral ? "spiral" as const : undefined;
    setMarkers((prev) => [...prev, { ...pendingMarker, inZone: acc === "Strike" }]);
    const newSnap: BsSnap = { athlete: currentPlayer, time: promptTime, accuracy: acc, auto: !!autoReason, autoReason, spiral: promptSpiral, marker: pendingMarker };
    const newSnaps = [...snaps, newSnap];
    setSnaps(newSnaps);
    setPendingMarker(null);
    setPromptTime("");
    setPromptSpiral("");
    if (newSnaps.length >= totalSnaps) setFinished(true);
  };

  const handleUndo = () => {
    if (snaps.length === 0) return;
    setSnaps((prev) => prev.slice(0, -1));
    setMarkers((prev) => prev.slice(0, -1));
    setFinished(false);
  };

  const handleSave = () => {
    if (snaps.length === 0) return;
    const entries: LongSnapEntry[] = snaps.map((s) => ({
      athleteId: s.athlete, athlete: s.athlete,
      snapType: "PUNT" as SnapType, time: parseFloat(s.time) || 0,
      accuracy: s.accuracy === "Strike" ? "ON_TARGET" as SnapAccuracy : "HIGH" as SnapAccuracy,
      score: 0, spiral: s.spiral || undefined,
      markerX: s.marker?.x, markerY: s.marker?.y, markerInZone: s.marker?.inZone,
    }));
    const allStrikes = snaps.filter((s) => s.accuracy === "Strike").length;
    const pct = snaps.length > 0 ? Math.round((allStrikes / snaps.length) * 100) : 0;
    const label = mode === "multi"
      ? `Balls & Strikes — ${players.map((p) => `${p}: ${getPlayerStrikes(p)}/${getPlayerSnaps(p).length}`).join(" vs ")} (${pct}%)`
      : `Balls & Strikes — ${allStrikes}/${snaps.length} (${pct}%)`;
    commitPractice(entries, label);
    setSaved(true);
  };

  const handleNewRound = () => {
    setSnaps([]); setMarkers([]); setStarted(false); setFinished(false);
    setMode(null); setSelectedPlayers([]); setSaved(false);
    setPromptTime(""); setPromptSpiral(""); setPendingMarker(null);
  };

  // Mode selection
  if (!mode) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">⚾</div>
          <h2 className="text-xl font-bold text-slate-100">Balls & Strikes</h2>
          <p className="text-sm text-muted">10 snaps per player. Over time or bad spiral = auto Ball.</p>
          <div className="flex gap-3">
            <button onClick={() => setMode("single")} className="btn-primary flex-1 py-3 text-sm">Single Player</button>
            <button onClick={() => setMode("multi")} className="btn-ghost flex-1 py-3 text-sm">Multiplayer</button>
          </div>
          <Link href="/longsnap/charting" className="text-xs text-muted hover:text-white transition-colors">← Back to Charting</Link>
        </div>
      </div>
    );
  }

  // Player selection + max time
  if (!started) {
    const canStart = mode === "single" ? selectedPlayers.length === 1 : selectedPlayers.length >= 2;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">⚾</div>
          <h2 className="text-xl font-bold text-slate-100">Balls & Strikes — {mode === "single" ? "Single" : "Multiplayer"}</h2>
          <p className="text-sm text-muted">{mode === "single" ? "Select your snapper" : "Select 2 or more snappers"}</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {athleteNames.map((a) => (
              <button key={a} onClick={() => mode === "single" ? setSelectedPlayers([a]) : togglePlayer(a)} className={clsx("px-3 py-1.5 rounded-input text-xs font-medium transition-all", selectedPlayers.includes(a) ? "bg-accent text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border")}>{a}</button>
            ))}
          </div>
          {mode === "multi" && selectedPlayers.length > 0 && <p className="text-xs text-muted">Order: {selectedPlayers.join(" → ")}</p>}
          <div>
            <p className="label">Max Snap Time (seconds)</p>
            <input type="text" inputMode="numeric" value={maxTime} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setMaxTime(d ? formatAutoDecimal(d) : ""); }} className="input w-32 mx-auto text-center text-xl font-bold" placeholder="0.75" />
          </div>
          <button onClick={() => setStarted(true)} disabled={!canStart || !maxTime} className="btn-primary py-3 px-8 text-sm w-full disabled:opacity-40">Start Round</button>
          <button onClick={() => { setMode(null); setSelectedPlayers([]); }} className="text-xs text-muted hover:text-white transition-colors">← Back</button>
        </div>
      </div>
    );
  }

  // Finished
  if (finished) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-100">Round Complete</h2>
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))` }}>
            {players.map((p) => {
              const ps = getPlayerSnaps(p);
              const pm = getPlayerMarkers(p);
              const str = getPlayerStrikes(p);
              const balls = ps.length - str;
              const pct = ps.length > 0 ? Math.round((str / ps.length) * 100) : 0;
              const times = ps.filter((s) => parseFloat(s.time) > 0);
              const avgT = times.length > 0 ? (times.reduce((sum, s) => sum + parseFloat(s.time), 0) / times.length).toFixed(2) : "—";
              return (
                <div key={p} className="space-y-3">
                  <p className="text-sm font-bold text-slate-200">{p}</p>
                  <PunterStrikeZone markers={pm} />
                  <div className="card-2 py-3">
                    <div className="flex justify-center gap-4">
                      <div><p className="text-2xl font-black text-make">{str}</p><p className="text-[10px] text-muted">Strikes</p></div>
                      <div><p className="text-2xl font-black text-miss">{balls}</p><p className="text-[10px] text-muted">Balls</p></div>
                    </div>
                    <p className="text-lg font-bold text-accent mt-2">{pct}%</p>
                    <p className="text-sm text-slate-300 mt-1">Avg: {avgT}s</p>
                  </div>
                  <div className="card-2 text-left text-xs overflow-y-auto max-h-[180px]">
                    <table className="w-full">
                      <thead><tr>
                        <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Time</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                        <th className="text-[10px] text-muted text-center py-1 px-1">Result</th>
                      </tr></thead>
                      <tbody>
                        {ps.map((s, i) => (
                          <tr key={i} className="border-t border-border/30">
                            <td className="text-muted py-1 px-1">{i + 1}</td>
                            <td className="text-center py-1 px-1">{s.time || "—"}</td>
                            <td className={clsx("text-center py-1 px-1", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : "Open"}</td>
                            <td className={clsx("text-center py-1 px-1 font-semibold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}{s.auto ? ` (${s.autoReason})` : ""}</td>
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
            <button onClick={handleNewRound} className="btn-ghost flex-1 py-3 text-sm">New Round</button>
          </div>
        </div>
      </div>
    );
  }

  // In progress
  const playerSnapCount = getPlayerSnaps(currentPlayer).length + 1;

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">{currentPlayer} — Snap {playerSnapCount} of {SNAPS_PER_PLAYER}</p>
            {mode === "multi" && <p className="text-[10px] text-muted">Overall {currentSnapIdx + 1} of {totalSnaps} · Max: {maxTime}s</p>}
            {mode === "single" && <p className="text-[10px] text-muted">Max: {maxTime}s</p>}
          </div>
          <div className="flex gap-3 text-center">
            {players.map((p) => (
              <div key={p} className={clsx("text-center", p === currentPlayer && mode === "multi" && "ring-2 ring-accent rounded px-2 py-0.5")}>
                <p className="text-[10px] text-muted">{p}</p>
                <p className="text-sm font-black"><span className="text-make">{getPlayerStrikes(p)}</span><span className="text-muted">/</span><span className="text-miss">{getPlayerSnaps(p).length - getPlayerStrikes(p)}</span></p>
              </div>
            ))}
          </div>
        </div>

        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${(snaps.length / totalSnaps) * 100}%` }} />
        </div>

        <p className="text-xs text-muted text-center">Click the diagram to chart snap location</p>
        <PunterStrikeZone markers={getPlayerMarkers(currentPlayer)} onSnap={handleSnapClick} nextNum={getPlayerSnaps(currentPlayer).length + 1} editable />

        <div className="flex gap-2">
          {snaps.length > 0 && <button onClick={handleUndo} className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white font-semibold transition-all">Undo</button>}
          {snaps.length > 0 && <button onClick={() => setFinished(true)} className="btn-primary flex-1 py-2 text-sm font-bold">Finish Early ({snaps.length}/{totalSnaps})</button>}
        </div>

        {snaps.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border overflow-y-auto max-h-[200px]">
            {snaps.map((s, i) => (
              <div key={i} className="flex items-center text-xs gap-2">
                <span className="text-muted w-5">#{i + 1}</span>
                <span className="text-slate-400 w-16 truncate">{s.athlete}</span>
                <span className="w-12">{s.time || "—"}s</span>
                <span className={clsx("w-10", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : "Open"}</span>
                <span className={clsx("font-semibold", s.accuracy === "Strike" ? "text-make" : "text-miss")}>{s.accuracy}</span>
                {s.auto && <span className="text-miss text-[10px]">({s.autoReason})</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time + Spiral prompt */}
      {pendingMarker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-card p-6 w-72 space-y-4">
            <p className="text-sm font-bold text-slate-100 text-center">{currentPlayer} — Snap #{playerSnapCount}</p>
            <div>
              <p className="label text-slate-100 text-center">Time</p>
              <input type="text" inputMode="numeric" placeholder="0.74" value={promptTime} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setPromptTime(d ? formatAutoDecimal(d) : ""); }} className="input w-full text-center text-2xl font-bold" autoFocus />
              {promptTime && parseFloat(promptTime) > maxTimeNum && maxTimeNum > 0 && <p className="text-xs text-miss font-semibold text-center mt-1">Over {maxTime}s — auto Ball</p>}
            </div>
            <div>
              <p className="label text-slate-100 text-center">Spiral</p>
              <div className="flex gap-2">
                <button onClick={() => setPromptSpiral("Good")} className={clsx("flex-1 py-2.5 rounded-input text-sm font-bold border transition-all", promptSpiral === "Good" ? "bg-make/20 text-make border-make/50" : "bg-surface-2 text-muted border-border")}>Tight</button>
                <button onClick={() => setPromptSpiral("Bad")} className={clsx("flex-1 py-2.5 rounded-input text-sm font-bold border transition-all", promptSpiral === "Bad" ? "bg-miss/20 text-miss border-miss/50" : "bg-surface-2 text-muted border-border")}>Open</button>
              </div>
              {promptSpiral === "Bad" && <p className="text-xs text-miss font-semibold text-center mt-1">Bad spiral — auto Ball</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPendingMarker(null); setPromptSpiral(""); }} className="btn-ghost flex-1 py-2 text-sm">Cancel</button>
              <button onClick={handleConfirmSnap} disabled={!promptSpiral} className="btn-primary flex-1 py-2 text-sm font-bold disabled:opacity-40">Log Snap</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
