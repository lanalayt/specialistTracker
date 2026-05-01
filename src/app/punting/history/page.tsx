"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { usePunt } from "@/lib/puntContext";
import { useAuth } from "@/lib/auth";
import { exportPuntSession, exportSessionPDF } from "@/lib/exportStats";
import { PuntFieldView } from "@/components/ui/PuntFieldView";
import type { PuntEntry, Session } from "@/types";
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

export default function PuntHistoryPage() {
  return <Suspense><PuntHistoryContent /></Suspense>;
}

function PuntHistoryContent() {
  const { history, updateSessionDate, updateSessionWeather, updateSessionOpponent, updateSessionEntries, deleteSession } = usePunt();
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [modeFilter, setModeFilter] = useState<"practice" | "game">(() => {
    if (sessionParam) {
      const s = history.find((h) => h.id === sessionParam);
      if (s?.mode === "game") return "game";
    }
    return "practice";
  });
  const [historyTab, setHistoryTab] = useState<"sessions" | "charting">("sessions");

  const isChartingSession = (s: Session) => s.label?.startsWith("Line Golf");

  const filteredHistory = historyTab === "charting"
    ? history.filter((s) => isChartingSession(s))
    : history.filter((s) => !isChartingSession(s) && (modeFilter === "game" ? s.mode === "game" : s.mode !== "game"));
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
  const punts = (selected?.entries ?? []) as PuntEntry[];
  const [editing, setEditing] = useState(false);
  const [editEntries, setEditEntries] = useState<PuntEntry[]>([]);

  const startEditing = () => {
    setEditEntries(punts.map((p) => ({ ...p })));
    setEditing(true);
  };
  const cancelEditing = () => { setEditing(false); setEditEntries([]); };
  const saveEditing = () => {
    if (selected) {
      updateSessionEntries(selected.id, editEntries);
      setEditing(false);
      setEditEntries([]);
    }
  };
  const updateEntry = (idx: number, field: keyof PuntEntry, value: unknown) => {
    setEditEntries((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  return (
    <main className="flex flex-col lg:flex-row h-[calc(100vh-100px)] overflow-hidden">
      {/* Session list — hidden on mobile when a session is selected */}
      <div className={clsx("lg:w-64 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto shrink-0", selectedId && "hidden lg:block")}>
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex rounded-input border border-border overflow-hidden">
            <button
              onClick={() => { setHistoryTab("sessions"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors",
                historyTab === "sessions" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
              )}
            >
              Sessions
            </button>
            <button
              onClick={() => { setHistoryTab("charting"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border",
                historyTab === "charting" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
              )}
            >
              Charting Games
            </button>
          </div>
          {historyTab === "sessions" && (
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
          )}
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Sessions ({filteredHistory.length})
          </p>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-xs text-muted p-4">No {modeFilter} sessions yet</p>
        ) : (
          <div className="divide-y divide-border/30">
            {[...filteredHistory].reverse().map((s: Session) => {
              const sp = (s.entries ?? []) as PuntEntry[];
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-colors hover:bg-surface-2",
                    selectedId === s.id && (modeFilter === "game" ? "bg-red-500/10 border-l-2 border-red-500" : "bg-accent/10 border-l-2 border-accent")
                  )}
                >
                  <p className="text-sm font-semibold text-slate-200">
                    {s.mode === "game" && s.opponent ? `vs ${s.opponent}` : s.label}
                  </p>
                  {s.mode === "game" && s.opponent && (
                    <p className="text-[10px] text-muted">{s.label}{s.gameTime ? ` · ${s.gameTime}` : ""}</p>
                  )}
                  <p className="text-xs text-muted mt-0.5">
                    {sp.length} punt{sp.length !== 1 ? "s" : ""}
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
            Select a session to view punts
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
            {isChartingSession(selected) ? (() => {
              // Line Golf history detail for punt
              const byAthlete: Record<string, PuntEntry[]> = {};
              punts.forEach((p) => { if (!byAthlete[p.athlete]) byAthlete[p.athlete] = []; byAthlete[p.athlete].push(p); });
              const athleteNames = Object.keys(byAthlete);
              const isMulti = athleteNames.length > 1;
              // opTime stores the target hang time
              const hangTarget = punts[0]?.opTime || 0;
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
                      <p className="text-xs text-muted mt-0.5">{punts.length} punts{hangTarget > 0 ? ` · Hang target: ${hangTarget.toFixed(1)}s` : ""}</p>
                    </div>
                    {!viewOnly && (
                      <button
                        onClick={() => { if (window.confirm(`Delete "${selected.label}"? You can restore it within 7 days.`)) { deleteSession(selected.id); setSelectedId(null); } }}
                        className="text-xs px-2.5 py-1.5 rounded-input border border-miss/30 text-miss/70 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all"
                      >Delete</button>
                    )}
                  </div>
                  <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                    {athleteNames.map((name) => {
                      const ap = byAthlete[name];
                      const totalScore = ap.reduce((s, p) => s + p.yards, 0);
                      const hangEntries = ap.filter((p) => p.hangTime > 0);
                      const avgHang = hangEntries.length > 0 ? (hangEntries.reduce((s, p) => s + p.hangTime, 0) / hangEntries.length).toFixed(2) : "—";
                      const hangHits = hangTarget > 0 ? hangEntries.filter((p) => p.hangTime >= hangTarget).length : 0;
                      return (
                        <div key={name} className="space-y-3">
                          {isMulti ? <p className="text-sm font-bold text-slate-200 text-center">{name}</p> : <p className="text-sm font-bold text-slate-200">{name}</p>}
                          <div className="card-2 py-3 text-center">
                            <p className="text-3xl font-black text-accent">{totalScore}</p>
                            <p className="text-[10px] text-muted mt-1">Total yards off</p>
                            {hangEntries.length > 0 && (
                              <div className="mt-2 flex items-center justify-center gap-3 text-xs">
                                <span className="text-muted">Avg Hang: <span className="text-slate-200 font-semibold">{avgHang}s</span></span>
                                {hangTarget > 0 && <span className="text-muted">Hits: <span className="text-make font-semibold">{hangHits}/{hangEntries.length}</span></span>}
                              </div>
                            )}
                          </div>
                          {/* Field view */}
                          <div className="card-2 py-4">
                            <div className="relative mx-auto" style={{ height: 100 }}>
                              <div className="absolute inset-0 rounded bg-green-900/40" />
                              {Array.from({ length: 21 }, (_, i) => i - 10).map((offset) => {
                                const pct = ((offset + 10) / 20) * 100;
                                const isCtr = offset === 0;
                                return (
                                  <div key={offset} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                                    <div className={clsx("h-full w-px", isCtr ? "bg-yellow-400" : offset % 5 === 0 ? "bg-white/30" : "bg-white/10")} />
                                    {offset % 2 === 0 && <span className={clsx("absolute -bottom-4 -translate-x-1/2 text-[8px]", isCtr ? "text-yellow-400 font-bold" : "text-white/40")}>{Math.abs(offset)}</span>}
                                  </div>
                                );
                              })}
                              {ap.map((p, i) => {
                                const dir = (p.landingZones?.[0] ?? "").toUpperCase();
                                const off = dir === "LEFT" ? -p.yards : dir === "RIGHT" ? p.yards : 0;
                                const pct = ((off + 10) / 20) * 100;
                                const samePosBefore = ap.slice(0, i).filter((prev) => {
                                  const pd = (prev.landingZones?.[0] ?? "").toUpperCase();
                                  const po = pd === "LEFT" ? -prev.yards : pd === "RIGHT" ? prev.yards : 0;
                                  return po === off;
                                }).length;
                                return (
                                  <div key={i} className="absolute -translate-x-1/2" style={{ left: `${Math.max(2, Math.min(98, pct))}%`, top: `${15 + samePosBefore * 24}%` }}>
                                    <div className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white", p.yards === 0 ? "bg-green-500" : p.yards <= 2 ? "bg-accent" : "bg-red-500")}>{i + 1}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* Kick table */}
                          <div className="card-2 text-xs">
                            <table className="w-full">
                              <thead><tr>
                                <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                                <th className="text-[10px] text-muted text-center py-1 px-1">Dir</th>
                                <th className="text-[10px] text-muted text-center py-1 px-1">Hang</th>
                                <th className="text-[10px] text-muted text-right py-1 px-1">Off</th>
                              </tr></thead>
                              <tbody>
                                {ap.map((p, i) => {
                                  const dir = (p.landingZones?.[0] ?? "").toUpperCase();
                                  return (
                                    <tr key={i} className="border-t border-border/30">
                                      <td className="text-muted py-1 px-1">{i + 1}</td>
                                      <td className={clsx("text-center py-1 px-1", dir === "CENTER" ? "text-make" : "text-slate-300")}>{dir === "CENTER" ? "✓" : dir === "LEFT" ? `← ${p.yards}` : `${p.yards} →`}</td>
                                      <td className={clsx("text-center py-1 px-1", hangTarget > 0 ? (p.hangTime >= hangTarget ? "text-make" : "text-miss") : "text-slate-300")}>{p.hangTime > 0 ? `${p.hangTime.toFixed(2)}s` : "—"}</td>
                                      <td className={clsx("text-right py-1 px-1 font-bold", p.yards === 0 ? "text-make" : p.yards <= 2 ? "text-accent" : "text-miss")}>+{p.yards}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (<>
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
              {!viewOnly && editingId === selected.id ? (
                <div className="flex items-center gap-2 flex-wrap">
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
                  {selected.mode === "game" && (
                    <input
                      type="text"
                      defaultValue={selected.opponent ?? ""}
                      placeholder="Opponent"
                      onBlur={(e) => updateSessionOpponent(selected.id, e.target.value.trim())}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="input text-sm px-2 py-1 w-32"
                    />
                  )}
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
                  {!viewOnly && (
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
              <p className="text-xs text-muted mt-0.5">{punts.length} punt{punts.length !== 1 ? "s" : ""}</p>
              </div>
              {!viewOnly && (
                <div className="flex gap-2 ml-3 shrink-0">
                  {editing ? (
                    <>
                      <button onClick={saveEditing} className="text-xs px-2.5 py-1.5 rounded-input border border-make/50 text-make hover:bg-make/10 transition-all font-semibold">
                        Save Changes
                      </button>
                      <button onClick={cancelEditing} className="text-xs px-2.5 py-1.5 rounded-input border border-border text-muted hover:text-white transition-all">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={startEditing} className="text-xs px-2.5 py-1.5 rounded-input border border-accent/50 text-accent hover:bg-accent/10 transition-all font-semibold">
                        Edit
                      </button>
                      <button
                        onClick={() => exportPuntSession(selected.label, punts)}
                        className="text-xs px-2.5 py-1.5 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 transition-all"
                      >
                        Excel
                      </button>
                      <button
                        onClick={() => {
                          const ydsE = punts.filter((p) => p.yards > 0);
                          const htE = punts.filter((p) => p.hangTime > 0);
                          const hasYL = punts.some((p) => p.poochLandingYardLine != null && p.poochLandingYardLine > 0);
                          const hdrs = ["#", "Athlete", "Type", "Yards"];
                          if (hasYL) hdrs.push("YL");
                          hdrs.push("Hang", "OT", "Dir");
                          const athleteNames = [...new Set(punts.map((p) => p.athlete))];
                          const athleteBreakdowns = athleteNames.map((name) => {
                            const ap = punts.filter((p) => p.athlete === name);
                            const aYds = ap.filter((p) => p.yards > 0);
                            const aHt = ap.filter((p) => p.hangTime > 0);
                            const aOt = ap.filter((p) => (p.opTime || 0) > 0);
                            const aDa = ap.filter((p) => typeof p.directionalAccuracy === "number");
                            const stats: Record<string, string> = {
                              Punts: String(ap.length),
                              "Avg Dist": aYds.length > 0 ? (aYds.reduce((s, p) => s + p.yards, 0) / aYds.length).toFixed(1) : "—",
                              "Avg Hang": aHt.length > 0 ? (aHt.reduce((s, p) => s + p.hangTime, 0) / aHt.length).toFixed(2) + "s" : "—",
                              "Avg OT": aOt.length > 0 ? (aOt.reduce((s, p) => s + (p.opTime || 0), 0) / aOt.length).toFixed(2) + "s" : "—",
                              "Dir %": aDa.length > 0 ? Math.round((aDa.reduce((s, p) => s + (typeof p.directionalAccuracy === "number" ? p.directionalAccuracy : 0), 0) / aDa.length) * 100) + "%" : "—",
                            };
                            const poochYL = ap.filter((p) => p.poochLandingYardLine != null && p.poochLandingYardLine > 0);
                            if (poochYL.length > 0) {
                              stats["Pooch Avg YL"] = (poochYL.reduce((s, p) => s + (p.poochLandingYardLine ?? 0), 0) / poochYL.length).toFixed(1);
                            }
                            return { name, stats };
                          });
                          exportSessionPDF(
                            `Punt Session — ${selected.label}`,
                            hdrs,
                            punts.map((p, i) => {
                              const row = [
                                String(p.kickNum ?? i + 1),
                                p.athlete,
                                p.type || "—",
                                p.yards > 0 ? `${p.yards}` : "—",
                              ];
                              if (hasYL) row.push(p.poochLandingYardLine != null && p.poochLandingYardLine > 0 ? String(p.poochLandingYardLine) : "—");
                              row.push(
                                p.hangTime > 0 ? p.hangTime.toFixed(2) : "—",
                                (p.opTime || 0) > 0 ? p.opTime.toFixed(2) : "—",
                                String(p.directionalAccuracy ?? "—"),
                              );
                              return row;
                            }),
                            {
                              Punts: String(punts.length),
                              "Avg Dist": ydsE.length > 0 ? (ydsE.reduce((s, p) => s + p.yards, 0) / ydsE.length).toFixed(1) : "—",
                              "Avg Hang": htE.length > 0 ? (htE.reduce((s, p) => s + p.hangTime, 0) / htE.length).toFixed(2) + "s" : "—",
                            },
                            athleteBreakdowns
                          );
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 transition-all"
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete session "${selected.label}"? You can restore it from Deleted Sessions within 7 days.`)) {
                            deleteSession(selected.id);
                            setSelectedId(history.find((s) => s.id !== selected.id)?.id ?? null);
                          }
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-input border border-miss/30 text-miss/70 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
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
            {/* Game chart — field view for games */}
            {selected.mode === "game" && punts.some((p) => p.los != null && p.landingYL != null) && (
              <div className="mb-4">
                <PuntFieldView
                  punts={punts.filter((p) => p.los != null && p.landingYL != null)}
                />
              </div>
            )}
            {/* Per-athlete recap stats */}
            {(() => {
              const byAthlete: Record<string, PuntEntry[]> = {};
              punts.forEach((p) => {
                if (!byAthlete[p.athlete]) byAthlete[p.athlete] = [];
                byAthlete[p.athlete].push(p);
              });
              const athleteNames = Object.keys(byAthlete);
              if (athleteNames.length === 0) return null;
              return (
                <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                  {athleteNames.map((name) => {
                    const ap = byAthlete[name];
                    const att = ap.length;
                    const yardsEntries = ap.filter((p) => p.yards > 0);
                    const avgDist = yardsEntries.length > 0 ? (yardsEntries.reduce((s, p) => s + p.yards, 0) / yardsEntries.length).toFixed(1) : "—";
                    const grossTotal = yardsEntries.reduce((s, p) => s + p.yards, 0);
                    const netPenalty = ap.reduce((s, p) => s + ((p.touchback || p.landingZones?.includes("TB")) ? 20 : (p.returnYards ?? 0)), 0);
                    const avgNet = yardsEntries.length > 0 ? ((grossTotal - netPenalty) / yardsEntries.length).toFixed(1) : "—";
                    const hangEntries = ap.filter((p) => p.hangTime > 0);
                    const avgHang = hangEntries.length > 0 ? (hangEntries.reduce((s, p) => s + p.hangTime, 0) / hangEntries.length).toFixed(2) : "—";
                    const otEntries = ap.filter((p) => (p.opTime || 0) > 0);
                    const avgOT = otEntries.length > 0 ? (otEntries.reduce((s, p) => s + (p.opTime || 0), 0) / otEntries.length).toFixed(2) : "—";
                    const daEntries = ap.filter((p) => typeof p.directionalAccuracy === "number" && p.directionalAccuracy >= 0);
                    const dirPct = daEntries.length > 0 ? `${Math.round((daEntries.reduce((s, p) => s + (typeof p.directionalAccuracy === "number" ? p.directionalAccuracy : 0), 0) / daEntries.length) * 100)}%` : "—";
                    const criticals = ap.filter((p) => p.directionalAccuracy === 0).length;
                    const dirScore = daEntries.reduce((s, p) => s + (typeof p.directionalAccuracy === "number" ? p.directionalAccuracy : 0), 0);
                    const dirScoreDisplay = daEntries.length > 0 ? `${dirScore % 1 === 0 ? dirScore : dirScore.toFixed(1)}/${daEntries.length}` : "—";
                    return (
                      <div key={name} className="card-2 p-3">
                        <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                          <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{att}</span></div>
                          <div><span className="text-muted">Gross</span> <span className="text-slate-200 font-medium ml-1">{avgDist}</span></div>
                          <div><span className="text-muted">Net</span> <span className="text-slate-200 font-medium ml-1">{avgNet}</span></div>
                          <div><span className="text-muted">Hang</span> <span className="text-slate-200 font-medium ml-1">{avgHang}{avgHang !== "—" ? "s" : ""}</span></div>
                          <div><span className="text-muted">OT</span> <span className="text-slate-200 font-medium ml-1">{avgOT}{avgOT !== "—" ? "s" : ""}</span></div>
                          <div><span className="text-muted">Dir%</span> <span className="text-accent font-medium ml-1">{dirPct}</span></div>
                          <div><span className="text-muted">Dir Score</span> <span className="text-slate-200 font-medium ml-1">{dirScoreDisplay}</span></div>
                          <div><span className="text-muted">Crit</span> <span className={`font-medium ml-1 ${criticals > 0 ? "text-miss" : "text-slate-200"}`}>{criticals}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {(() => {
              const displayPunts = editing ? editEntries : punts;
              return (
                <div className="card-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-header text-left">#</th>
                        <th className="table-header text-left">Athlete</th>
                        <th className="table-header">Type</th>
                        <th className="table-header">Yds</th>
                        <th className="table-header">Hang</th>
                        <th className="table-header">OT</th>
                        <th className="table-header">Dir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPunts.map((p, i) => (
                        <tr key={i} className="hover:bg-surface/30">
                          <td className="table-cell text-left text-muted">{p.kickNum ?? i + 1}{p.starred ? <span className="text-amber-400"> ★</span> : ""}</td>
                          <td className="table-name">{p.athlete}</td>
                          <td className="table-cell text-muted">{p.type || "—"}</td>
                          {editing ? (
                            <>
                              <td className="table-cell p-1">
                                {p.poochLandingYardLine != null && p.poochLandingYardLine > 0 ? (
                                  <input type="text" inputMode="numeric" value={p.poochLandingYardLine || ""} onChange={(e) => updateEntry(i, "poochLandingYardLine", parseInt(e.target.value) || 0)} className="w-14 bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-center text-make" />
                                ) : (
                                  <input type="text" inputMode="numeric" value={p.yards || ""} onChange={(e) => updateEntry(i, "yards", parseInt(e.target.value) || 0)} className="w-14 bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-center text-slate-200" />
                                )}
                              </td>
                              <td className="table-cell p-1"><input type="text" inputMode="numeric" value={p.hangTime || ""} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); updateEntry(i, "hangTime", d ? parseFloat(`${d.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${d.padStart(3, "0").slice(-2)}`) : 0); }} className="w-14 bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-center text-slate-200" /></td>
                              <td className="table-cell p-1"><input type="text" inputMode="numeric" value={p.opTime || ""} onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); updateEntry(i, "opTime", d ? parseFloat(`${d.padStart(3, "0").slice(0, -2).replace(/^0+(?=\d)/, "") || "0"}.${d.padStart(3, "0").slice(-2)}`) : 0); }} className="w-14 bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-center text-slate-200" /></td>
                              <td className="table-cell p-1">
                                <select value={String(p.directionalAccuracy ?? "")} onChange={(e) => updateEntry(i, "directionalAccuracy", parseFloat(e.target.value))} className="bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-slate-200">
                                  <option value="1">1</option>
                                  <option value="0.5">0.5</option>
                                  <option value="0">0</option>
                                </select>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className={clsx("table-cell", p.poochLandingYardLine != null && p.poochLandingYardLine > 0 && "!text-make font-semibold")}>
                                {p.poochLandingYardLine != null && p.poochLandingYardLine > 0
                                  ? `${p.poochLandingYardLine} YL`
                                  : p.yards > 0 ? `${p.yards} yd` : "—"}
                              </td>
                              <td className="table-cell text-muted">{p.hangTime > 0 ? `${p.hangTime.toFixed(2)}s` : "—"}</td>
                              <td className="table-cell text-muted">{(p.opTime || 0) > 0 ? `${p.opTime.toFixed(2)}s` : "—"}</td>
                              <td className={`table-cell font-bold ${p.directionalAccuracy === 1 ? "text-make" : p.directionalAccuracy === 0 ? "text-miss" : "text-amber-400"}`}>{p.directionalAccuracy != null ? (p.directionalAccuracy === 0.5 ? "0.5" : p.directionalAccuracy) : "—"}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </>)}
          </>
        )}
      </div>
    </main>
  );
}
