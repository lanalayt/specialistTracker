"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useKickoff } from "@/lib/kickoffContext";
import { useAuth } from "@/lib/auth";
import { KickoffFieldView } from "@/components/ui/KickoffFieldView";
import type { KickoffEntry, Session } from "@/types";
import clsx from "clsx";

function formatDateForInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

export default function KickoffHistoryPage() {
  return <Suspense><KickoffHistoryContent /></Suspense>;
}

function KickoffHistoryContent() {
  const { history, updateSessionDate, updateSessionWeather, deleteSession } = useKickoff();
  const { isAthlete } = useAuth();
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [modeFilter, setModeFilter] = useState<"practice" | "game">(() => {
    if (sessionParam) {
      const s = history.find((h) => h.id === sessionParam);
      if (s?.mode === "game") return "game";
    }
    return "practice";
  });
  const filteredHistory = history.filter((s) =>
    modeFilter === "game" ? s.mode === "game" : s.mode !== "game"
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    sessionParam && filteredHistory.some((s) => s.id === sessionParam)
      ? sessionParam
      : filteredHistory[filteredHistory.length - 1]?.id ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWeatherId, setEditingWeatherId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionParam && history.length > 0 && !filteredHistory.some((s) => s.id === selectedId)) {
      const target = history.find((h) => h.id === sessionParam);
      if (target) {
        if (target.mode === "game" && modeFilter !== "game") setModeFilter("game");
        else if (target.mode !== "game" && modeFilter !== "practice") setModeFilter("practice");
        setSelectedId(sessionParam);
      }
    }
  }, [history, sessionParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = filteredHistory.find((s) => s.id === selectedId);
  const entries = (selected?.entries ?? []) as KickoffEntry[];

  return (
    <main className="flex flex-col lg:flex-row h-[calc(100vh-100px)] overflow-hidden">
      {/* Session list */}
      <div className="lg:w-64 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto shrink-0">
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex rounded-input border border-border overflow-hidden">
            <button
              onClick={() => { setModeFilter("practice"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors",
                modeFilter === "practice" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
              )}
            >
              Practice
            </button>
            <button
              onClick={() => { setModeFilter("game"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border",
                modeFilter === "game" ? "bg-red-500 text-white" : "text-red-400/60 hover:text-red-400"
              )}
            >
              GAME
            </button>
          </div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Sessions ({filteredHistory.length})
          </p>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-xs text-muted p-4">No {modeFilter} sessions yet</p>
        ) : (
          <div className="divide-y divide-border/30">
            {[...filteredHistory].reverse().map((s: Session) => {
              const se = (s.entries ?? []) as KickoffEntry[];
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-colors hover:bg-surface-2",
                    selectedId === s.id && (modeFilter === "game" ? "bg-red-500/10 border-l-2 border-red-500" : "bg-accent/10 border-l-2 border-accent")
                  )}
                >
                  <p className="text-sm font-semibold text-slate-200">{s.label}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {se.length} kickoff{se.length !== 1 ? "s" : ""}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Session detail */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selected ? (
          <div className="flex items-center justify-center h-40 text-muted text-sm">
            Select a session to view kickoffs
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
              {!isAthlete && editingId === selected.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    defaultValue={formatDateForInput(selected.date)}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateSessionDate(
                          selected.id,
                          new Date(e.target.value + "T12:00:00").toISOString(),
                          formatLabel(e.target.value)
                        );
                      }
                    }}
                    className="input text-sm px-2 py-1 w-auto"
                  />
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-accent hover:underline"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {selected.mode === "game" && selected.opponent && (
                    <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-black uppercase tracking-wider">
                      GAME vs {selected.opponent}
                    </span>
                  )}
                  <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
                  {selected.mode === "game" && selected.gameTime && (
                    <span className="text-xs text-muted">· {selected.gameTime}</span>
                  )}
                  {!isAthlete && (
                    <button
                      onClick={() => setEditingId(selected.id)}
                      className="text-xs text-muted hover:text-accent transition-colors"
                      title="Change date"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-muted mt-0.5">{entries.length} kickoff{entries.length !== 1 ? "s" : ""}</p>
              </div>
              {!isAthlete && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete session "${selected.label}"? This cannot be undone.`)) {
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
              {!isAthlete && editingWeatherId === selected.id ? (
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
                  {!isAthlete && (
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
            {/* Game field view */}
            {selected.mode === "game" && entries.some((e) => e.los != null && e.landingYL != null) && (
              <div className="mb-4">
                <KickoffFieldView kicks={entries.filter((e) => e.los != null && e.landingYL != null)} />
              </div>
            )}
            {/* Per-athlete recap stats */}
            {(() => {
              const dirToNum = (d: string): number | null => {
                if (d === "1") return 1;
                if (d === "0.5") return 0.5;
                if (d === "OB") return 0;
                return null;
              };
              const byAthlete: Record<string, KickoffEntry[]> = {};
              entries.forEach((e) => {
                if (!byAthlete[e.athlete]) byAthlete[e.athlete] = [];
                byAthlete[e.athlete].push(e);
              });
              const athleteNames = Object.keys(byAthlete);
              if (athleteNames.length === 0) return null;
              return (
                <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                  {athleteNames.map((name) => {
                    const ak = byAthlete[name];
                    const att = ak.length;
                    const distEntries = ak.filter((e) => e.distance > 0);
                    const avgDist = distEntries.length > 0 ? (distEntries.reduce((s, e) => s + e.distance, 0) / distEntries.length).toFixed(1) : "—";
                    const hangEntries = ak.filter((e) => e.hangTime > 0);
                    const avgHang = hangEntries.length > 0 ? (hangEntries.reduce((s, e) => s + e.hangTime, 0) / hangEntries.length).toFixed(2) : "—";
                    const dirVals = ak.map((e) => dirToNum(e.direction)).filter((v): v is number => v != null);
                    const avgDir = dirVals.length > 0 ? (dirVals.reduce((s, v) => s + v, 0) / dirVals.length).toFixed(2) : "—";
                    return (
                      <div key={name} className="card-2 p-3">
                        <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{att}</span></div>
                          <div><span className="text-muted">Dist</span> <span className="text-slate-200 font-medium ml-1">{avgDist}</span></div>
                          <div><span className="text-muted">Hang</span> <span className="text-slate-200 font-medium ml-1">{avgHang}{avgHang !== "—" ? "s" : ""}</span></div>
                          <div><span className="text-muted">Dir</span> <span className="text-accent font-medium ml-1">{avgDir}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header text-left">Athlete</th>
                    <th className="table-header">Dist</th>
                    <th className="table-header">Hang</th>
                    <th className="table-header">Dir</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="hover:bg-surface/30">
                      <td className="table-cell text-left text-muted">{e.kickNum ?? i + 1}</td>
                      <td className="table-name">{e.athlete}</td>
                      <td className="table-cell">{e.distance > 0 ? `${e.distance} yd` : "—"}</td>
                      <td className="table-cell text-muted">{e.hangTime > 0 ? `${e.hangTime.toFixed(2)}s` : "—"}</td>
                      <td className={clsx("table-cell font-bold",
                        e.direction === "1" ? "text-make" : e.direction === "OB" ? "text-miss" : e.direction === "0.5" ? "text-amber-400" : "text-muted"
                      )}>{e.direction || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
