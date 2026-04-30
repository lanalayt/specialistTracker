"use client";

import { useState, useMemo } from "react";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import type { LongSnapEntry, SnapBenchmark, Session } from "@/types";
import clsx from "clsx";

const ACC_LABEL: Record<string, string> = {
  ON_TARGET: "✓ On Target",
  HIGH: "↑ High",
  LOW: "↓ Low",
  LEFT: "← Left",
  RIGHT: "→ Right",
};

const BM_COLORS: Record<SnapBenchmark, string> = {
  excellent: "text-make",
  good: "text-accent",
  needsWork: "text-miss",
};

export default function LongSnapHistoryPage() {
  const { history, updateSessionWeather, deleteSession } = useLongSnap();
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;
  const [selectedId, setSelectedId] = useState<string | null>(
    history[history.length - 1]?.id ?? null
  );
  const [editingWeatherId, setEditingWeatherId] = useState<string | null>(null);
  const [tab, setTab] = useState<"practice" | "charting">("practice");

  const filteredHistory = tab === "charting"
    ? history.filter((s) => s.label?.startsWith("30 Point Game") || s.label?.startsWith("Balls & Strikes"))
    : history.filter((s) => !s.label?.startsWith("30 Point Game") && !s.label?.startsWith("Balls & Strikes"));

  const selected = selectedId ? filteredHistory.find((s) => s.id === selectedId) ?? null : null;
  const snaps = (selected?.entries ?? []) as LongSnapEntry[];

  return (
    <main className="flex flex-col lg:flex-row h-[calc(100vh-100px)] overflow-hidden">
      {/* Session list — hidden on mobile when a session is selected */}
      <div className={clsx("lg:w-64 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto shrink-0", selected && "hidden lg:block")}>
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex rounded-input border border-border overflow-hidden w-fit">
            <button onClick={() => { setTab("practice"); setSelectedId(null); }} className={clsx("px-3 py-1 text-[10px] font-semibold transition-colors", tab === "practice" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Practice</button>
            <button onClick={() => { setTab("charting"); setSelectedId(null); }} className={clsx("px-3 py-1 text-[10px] font-semibold transition-colors border-l border-border", tab === "charting" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Charting</button>
          </div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Sessions ({filteredHistory.length})
          </p>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-xs text-muted p-4">No sessions yet</p>
        ) : (
          <div className="divide-y divide-border/30">
            {[...filteredHistory].reverse().map((s: Session) => {
              const ss = (s.entries ?? []) as LongSnapEntry[];
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-colors hover:bg-surface-2",
                    selectedId === s.id && "bg-accent/10 border-l-2 border-accent"
                  )}
                >
                  <p className="text-sm font-semibold text-slate-200">{s.label}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {ss.length} snap{ss.length !== 1 ? "s" : ""}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Session detail — hidden on mobile when no session selected */}
      <div className={clsx("flex-1 overflow-y-auto p-4", !selectedId && "hidden lg:block")}>
        {!selected ? (
          <div className="flex items-center justify-center h-40 text-muted text-sm">
            Select a session to view snaps
          </div>
        ) : (
          <>
            {/* Mobile back button */}
            <button
              onClick={() => setSelectedId(null)}
              className="lg:hidden flex items-center gap-1 text-xs text-accent font-semibold mb-3 hover:underline"
            >
              ← All Sessions
            </button>
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
                <p className="text-xs text-muted mt-0.5">{snaps.length} snap{snaps.length !== 1 ? "s" : ""}</p>
              </div>
              {!viewOnly && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete session "${selected.label}"? You can restore it from Deleted Sessions within 7 days.`)) {
                      deleteSession(selected.id);
                      setSelectedId(history.find((s) => s.id !== selected.id)?.id ?? null);
                    }
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-input border border-miss/30 text-miss/70 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all ml-3 shrink-0"
                >
                  Delete Session
                </button>
              )}
            </div>
            {/* Weather display / edit */}
            <div className="mb-4">
              {!viewOnly && editingWeatherId === selected.id ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Weather</label>
                  <input
                    type="text"
                    value={selected.weather ?? ""}
                    onChange={(e) => updateSessionWeather(selected.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditingWeatherId(null); } }}
                    placeholder="Add weather notes..."
                    className="flex-1 max-w-xs bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {selected.weather ? (
                    <p className="text-xs text-slate-300">{selected.weather}</p>
                  ) : (
                    <p className="text-xs text-muted italic">No weather set</p>
                  )}
                  {!viewOnly && (
                    <button
                      onClick={() => setEditingWeatherId(selected.id)}
                      className="text-muted hover:text-white transition-colors p-1"
                      title="Edit weather"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            {selected?.label?.startsWith("30 Point Game") ? (() => {
              // Split by athlete for multiplayer
              const athleteList = [...new Set(snaps.map((s) => s.athlete))];
              return (
                <div className="space-y-4">
                  <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${athleteList.length}, minmax(0, 1fr))` }}>
                    {athleteList.map((a) => {
                      const ps = snaps.filter((s) => s.athlete === a);
                      const pm: ShortSnapMarker[] = ps.filter((s) => s.markerX != null).map((s, i) => ({ x: s.markerX!, y: s.markerY!, num: i + 1, inZone: s.markerInZone ?? s.accuracy === "ON_TARGET" }));
                      const pts = ps.reduce((sum, s) => sum + (s.score || 0), 0);
                      return (
                        <div key={a} className="space-y-3">
                          <p className="text-sm font-bold text-slate-200 text-center">{a}</p>
                          <HolderStrikeZone markers={pm} />
                          <div className="card-2 text-center py-2">
                            <p className="text-2xl font-black text-accent">{pts}</p>
                            <p className="text-[10px] text-muted">/ {ps.length * 3}</p>
                          </div>
                          <div className="card-2 overflow-x-auto text-xs">
                            <table className="w-full">
                              <thead><tr>
                                <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                                <th className="text-[10px] text-muted text-center py-1 px-1">Loc</th>
                                <th className="text-[10px] text-muted text-center py-1 px-1">Laces</th>
                                <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
                                <th className="text-[10px] text-muted text-right py-1 px-1">Pts</th>
                              </tr></thead>
                              <tbody>
                                {ps.map((s, i) => (
                                  <tr key={i} className="border-t border-border/30">
                                    <td className="text-muted py-1 px-1">{i + 1}</td>
                                    <td className={clsx("text-center py-1 px-1 font-semibold", s.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>{s.accuracy === "ON_TARGET" ? "Strike" : "Ball"}</td>
                                    <td className={clsx("text-center py-1 px-1", s.laces === "Good" ? "text-make" : s.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>{s.laces === "Good" ? "Perfect" : s.laces || "—"}</td>
                                    <td className={clsx("text-center py-1 px-1", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : s.spiral === "Bad" ? "Open" : "—"}</td>
                                    <td className="text-right py-1 px-1 font-bold text-accent">{s.score ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })() : selected?.label?.startsWith("Balls & Strikes") ? (() => {
              // Split by athlete for multiplayer
              const athleteList = [...new Set(snaps.map((s) => s.athlete))];
              return (
                <div className="space-y-4">
                  <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${athleteList.length}, minmax(0, 1fr))` }}>
                    {athleteList.map((a) => {
                      const ps = snaps.filter((s) => s.athlete === a);
                      const pm: SnapMarker[] = ps.filter((s) => s.markerX != null).map((s, i) => ({ x: s.markerX!, y: s.markerY!, num: i + 1, inZone: s.markerInZone ?? s.accuracy === "ON_TARGET" }));
                      const str = ps.filter((s) => s.accuracy === "ON_TARGET").length;
                      const balls = ps.length - str;
                      const pct = ps.length > 0 ? Math.round((str / ps.length) * 100) : 0;
                      const times = ps.filter((s) => s.time > 0);
                      const avgT = times.length > 0 ? (times.reduce((sum, s) => sum + s.time, 0) / times.length).toFixed(2) : "—";
                      return (
                        <div key={a} className="space-y-3">
                          <p className="text-sm font-bold text-slate-200 text-center">{a}</p>
                          <PunterStrikeZone markers={pm} />
                          <div className="card-2 text-center py-2">
                            <div className="flex justify-center gap-4">
                              <div><p className="text-xl font-black text-make">{str}</p><p className="text-[10px] text-muted">Strikes</p></div>
                              <div><p className="text-xl font-black text-miss">{balls}</p><p className="text-[10px] text-muted">Balls</p></div>
                            </div>
                            <p className="text-sm font-bold text-accent mt-1">{pct}%</p>
                            <p className="text-[10px] text-slate-300">Avg: {avgT}s</p>
                          </div>
                          <div className="card-2 overflow-x-auto text-xs">
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
                                    <td className="text-center py-1 px-1">{s.time > 0 ? `${s.time.toFixed(2)}s` : "—"}</td>
                                    <td className={clsx("text-center py-1 px-1", s.spiral === "Good" ? "text-make" : "text-miss")}>{s.spiral === "Good" ? "Tight" : s.spiral === "Bad" ? "Open" : "—"}</td>
                                    <td className={clsx("text-center py-1 px-1 font-semibold", s.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>{s.accuracy === "ON_TARGET" ? "Strike" : "Ball"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (
            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header text-left">Athlete</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Time</th>
                    <th className="table-header">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {snaps.map((s, i) => (
                    <tr key={i} className="hover:bg-surface/30">
                      <td className="table-cell text-left text-muted">{i + 1}</td>
                      <td className="table-name">{s.athlete}</td>
                      <td className="table-cell text-muted">{s.snapType}</td>
                      <td className="table-cell font-bold">{s.time > 0 ? `${s.time.toFixed(2)}s` : "—"}</td>
                      <td className="table-cell">
                        <span className={clsx("text-xs font-semibold", s.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>
                          {s.accuracy === "ON_TARGET" ? "Strike" : "Ball"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
